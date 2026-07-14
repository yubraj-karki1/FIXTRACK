
 //Authentication Controller
 //Handles all authentication endpoints: login, TOTP setup/verification, logout
 
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError } from '../errors/http-error.js';
import { authService } from '../services/auth.service.js';
import { totpService } from '../services/totp.service.js';
import { sessionService } from '../services/session.service.js';
import { sendJson } from './response.js';
import type { LoginRequestDto } from '../dtos/auth.dto.js';
import type { AuthLoginResponse, TotpSetupResponse, User } from '../types/index.js';

export const authController = {
  
   //Email/password login endpoint
   //Validates credentials and returns user + TOTP requirement if enabled
   
  async login(response: ServerResponse, credentials: LoginRequestDto): Promise<void> {
    const user = await authService.validateLogin(credentials.email, credentials.password);
    const loginResponse = totpService.getLoginResponse(user);

    if (loginResponse.requiresTotp) {
      // A full session is deliberately withheld until the second factor succeeds.
      sessionService.issuePendingTotp(response, user.id);
    } else {
      sessionService.issueSession(response, user.id);
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
    userId: string,
    token: string
  ): Promise<void> {
    // TOTP enrollment is also limited to the account represented by the session cookie.
    await assertCurrentUser(request, userId);
    const user = await totpService.verifySetup(userId, token);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: user,
      message: 'Two-factor authentication enabled'
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
    const user = await totpService.verifyLogin(userId, token);
    sessionService.issueSession(response, user.id);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: user,
      message: 'Two-factor authentication verified'
    });
  },
  
   //Disables TOTP on user account
  
  async disableTotp(request: IncomingMessage, response: ServerResponse, userId: string, token: string): Promise<void> {
    // Prevent an authenticated user from disabling another user's second factor.
    await assertCurrentUser(request, userId);
    // Disabling the second factor requires proof of the current authenticator.
    await totpService.verifyLogin(userId, token);
    const user = await totpService.disable(userId);
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

  logout(response: ServerResponse): void {
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
