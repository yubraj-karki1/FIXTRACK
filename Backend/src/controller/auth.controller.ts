
 //Authentication Controller
 //Handles all authentication endpoints: login, TOTP setup/verification, logout

import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from '../errors/http-error.js';
import { auditService, type AuditContext } from '../services/audit.service.js';
import { authService } from '../services/auth.service.js';
import { isPasswordExpired } from '../services/password.service.js';
import { getClientIp } from '../middlewares/rate-limit.middleware.js';
import { totpService } from '../services/totp.service.js';
import { sessionService } from '../services/session.service.js';
import { userService } from '../services/user.service.js';
import { sendJson } from './response.js';
import type {
  ForgotPasswordRequestDto,
  LoginRequestDto,
  PasswordResetRequestDto,
  TotpConfirmRequestDto,
  TotpRecoveryRequestDto
} from '../dtos/auth.dto.js';
import type { AuthLoginResponse, TotpSetupResponse, TotpSetupVerifiedResponse, User } from '../types/index.js';

// IP/user-agent attached to auth-related audit events (see upload.service.ts for the
// pre-existing pattern of putting this in the metadata bag rather than a dedicated column).
function requestContext(request: IncomingMessage): AuditContext {
  return { ip: getClientIp(request), userAgent: String(request.headers['user-agent'] || '') };
}

export const authController = {

   //Email/password login endpoint
   //Validates credentials and returns user + TOTP requirement if enabled

  async login(request: IncomingMessage, response: ServerResponse, credentials: LoginRequestDto): Promise<void> {
    const user = await authService.validateLogin(credentials.email, credentials.password, requestContext(request));

// Check if the user's password has expired and requires a change
    if (isPasswordExpired(user.passwordChangedAt)) {
      sessionService.issuePendingPasswordChange(response, user.id);
      response.setHeader('Cache-Control', 'no-store');
      sendJson<AuthLoginResponse>(response, 200, {
        data: { user: null, requiresTotp: false, requiresPasswordChange: true, userId: user.id },
        message: 'Your password has expired. Choose a new password to continue.'
      });
      return;
    }

    const loginResponse = totpService.getLoginResponse(user);

    if (loginResponse.requiresTotp) {
      // A full session is deliberately withheld until the second factor succeeds.
      sessionService.issuePendingTotp(response, user.id);
    } else {
      sessionService.issueSession(response, user);
    }

    response.setHeader('Cache-Control', 'no-store');
    sendJson<AuthLoginResponse>(response, 200, {
      data: loginResponse,
      message: loginResponse.requiresTotp ? 'Two-factor authentication required' : 'Logged in successfully'
    });
  },


   //Initiates TOTP setup - generates QR code for authenticator app

  async setupTotp(request: IncomingMessage, response: ServerResponse, userId: string): Promise<void> {
    // The request body may name a user, but the authenticated cookie is authoritative.
    await assertCurrentUser(request, userId);
    const setup = await totpService.beginSetup(userId);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<TotpSetupResponse>(response, 200, {
      data: setup,
      message: 'Scan this QR code with your authenticator app'
    });
  },

  async verifyTotpSetup(
    request: IncomingMessage,
    response: ServerResponse,
    body: TotpConfirmRequestDto
  ): Promise<void> {
    // TOTP enrollment is also limited to the account represented by the session cookie.
    await assertCurrentUser(request, body.userId);
    const result = await totpService.verifySetup(body.userId, body.token, body.currentPassword, requestContext(request));
    response.setHeader('Cache-Control', 'no-store');
    sendJson<TotpSetupVerifiedResponse>(response, 200, {
      data: result,
      message: 'Two-factor authentication enabled. Save your recovery codes now - they will not be shown again.'
    });
  },

  async verifyTotpLogin(
    request: IncomingMessage,
    response: ServerResponse,
    userId: string,
    token: string
  ): Promise<void> {
    // The short-lived HttpOnly challenge prevents callers from starting at this endpoint.
    sessionService.assertPendingTotpUser(request, userId);
    const user = await totpService.verifyLogin(userId, token, requestContext(request));
    sessionService.issueSession(response, user);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: user,
      message: 'Two-factor authentication verified'
    });
  },

  async verifyTotpRecovery(request: IncomingMessage, response: ServerResponse, body: TotpRecoveryRequestDto): Promise<void> {
    // Same pre-session gating as the normal 2FA verification step.
    sessionService.assertPendingTotpUser(request, body.userId);
    const user = await totpService.verifyRecoveryCode(body.userId, body.recoveryCode, requestContext(request));
    sessionService.issueSession(response, user);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: user,
      message: 'Recovery code accepted'
    });
  },

   //Disables TOTP on user account

  async disableTotp(request: IncomingMessage, response: ServerResponse, body: TotpConfirmRequestDto): Promise<void> {
    // Prevent an authenticated user from disabling another user's second factor.
    await assertCurrentUser(request, body.userId);
    // Disabling the second factor requires proof of the current authenticator...
    await totpService.verifyLogin(body.userId, body.token, requestContext(request));
    // ...and the account password, so a hijacked session alone can't turn MFA off.
    const user = await totpService.disable(body.userId, body.currentPassword, requestContext(request));
    // Disabling MFA bumps sessionVersion, invalidating every session issued before this point
    // (including a stolen one). Reissue immediately so the legitimate caller - who just proved
    // both password (at login) and the current TOTP code - isn't logged out by their own request.
    sessionService.issueSession(response, user);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: user,
      message: 'Two-factor authentication disabled'
    });
  },

  async currentUser(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const user = await sessionService.getAuthenticatedUser(request);
      response.setHeader('Cache-Control', 'no-store');
      sendJson<User>(response, 200, { data: user });
    } catch (error) {
      // Clear only the invalid full session. A TOTP pre-auth challenge must
      // survive the frontend's initial /me check on the public TOTP page.
      sessionService.clearSession(response);
      throw error;
    }
  },

  async csrfToken(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // The frontend obtains a fresh, session-bound token after every successful /auth/me check.
    const token = await sessionService.createCsrfToken(request);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<{ token: string }>(response, 200, { data: { token } });
  },

  async forgotPassword(request: IncomingMessage, response: ServerResponse, body: ForgotPasswordRequestDto): Promise<void> {
    await authService.requestPasswordReset(body.email, requestContext(request));
    response.setHeader('Cache-Control', 'no-store');
    // Always the same response, whether or not the email is registered, so this endpoint
    // cannot be used to enumerate accounts.
    sendJson<null>(response, 200, {
      data: null,
      message: 'If an account exists for that email, a reset code has been sent.'
    });
  },

  async resetPassword(request: IncomingMessage, response: ServerResponse, body: PasswordResetRequestDto): Promise<void> {
    await authService.resetPassword(body.email, body.code, body.newPassword, requestContext(request));
    response.setHeader('Cache-Control', 'no-store');
    sendJson<null>(response, 200, {
      data: null,
      message: 'Password reset successfully. You can now log in.'
    });
  },

  async changeExpiredPassword(request: IncomingMessage, response: ServerResponse, userId: string, newPassword: string): Promise<void> {
    // The pending-password cookie is the only proof of the earlier successful login.
    sessionService.assertPendingPasswordUser(request, userId);
    await authService.changePasswordAfterExpiry(userId, newPassword, requestContext(request));
    // Re-fetch after the password service bumps sessionVersion, so the new session token
    // embeds the current version instead of immediately invalidating itself.
    const user = await userService.getUserById(userId);
    sessionService.issueSession(response, user);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: user,
      message: 'Password updated. You are now logged in.'
    });
  },

  async logout(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // Best-effort: log who logged out, but logout must succeed even with an already-expired
    // or missing session - it's the one auth action that can never itself fail on the client.
    try {
      const user = await sessionService.getAuthenticatedUser(request);
      void auditService.record(
        'user.logout',
        `${user.name} logged out.`,
        { id: user.id, name: user.name, role: user.role },
        user.id,
        requestContext(request)
      );
    } catch {
      // No valid session to attribute the logout to - nothing to log.
    }

    // HttpOnly cookies can only be cleared by the server using matching attributes.
    sessionService.clearAuthentication(response);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<null>(response, 200, {
      data: null,
      message: 'Logged out successfully'
    });
  }
};

async function assertCurrentUser(request: IncomingMessage, requestedUserId: string): Promise<User> {
  // Never trust a client-provided user id for account-level security settings.
  const authenticatedUser = await sessionService.getAuthenticatedUser(request);
  if (authenticatedUser.id !== requestedUserId) {
    throw new HttpError(403, 'You cannot change two-factor settings for another user');
  }

  return authenticatedUser;
}
