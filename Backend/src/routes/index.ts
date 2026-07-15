
// API Route Handler
// Defines all API endpoints with request validation, rate limiting, and error handling
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applicationController } from '../controller/application.controller.js';
import { auditController } from '../controller/audit.controller.js';
import { authController } from '../controller/auth.controller.js';
import { complaintController } from '../controller/complaint.controller.js';
import { sendJson } from '../controller/response.js';
import { userController } from '../controller/user.controller.js';
import type { ForgotPasswordRequestDto, LoginRequestDto, PasswordResetRequestDto, TotpSetupRequestDto, TotpVerifyRequestDto } from '../dtos/auth.dto.js';
import type { CreateComplaintDto, UpdateComplaintDto } from '../dtos/complaint.dto.js';
import type { AdminUpdateUserDto, CreatePrivilegedUserDto, CreateUserDto, UpdateProfileDto } from '../dtos/user.dto.js';
import { HttpError } from '../errors/http-error.js';
import { assertRateLimit } from '../middlewares/rate-limit.middleware.js';
import { assertTrustedOrigin } from '../middlewares/origin.middleware.js';
import { assertCsrfProtection } from '../middlewares/csrf.middleware.js';
import { requireAuthenticatedUser, requireRole } from '../middlewares/auth.middleware.js';
import { sessionService } from '../services/session.service.js';
import {
  complaintIdValidationSchema,
  adminUpdateUserValidationSchema,
  auditQueryValidationSchema,
  createComplaintValidationSchema,
  forgotPasswordValidationSchema,
  loginValidationSchema,
  passwordResetValidationSchema,
  privilegedUserValidationSchema,
  registerValidationSchema,
  searchValidationSchema,
  updateComplaintValidationSchema,
  updateProfileValidationSchema,
  userIdValidationSchema,
  validateRequest
} from '../middlewares/validation.middleware.js';
import { readJsonBody } from './body.js';


 // Main route handler - processes all incoming HTTP requests
 // Matches URL and method to appropriate controller action
 // Includes validation middleware and centralized error handling
 
export async function handleRoutes(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/auth/')) {
    // Authentication responses can contain session-changing Set-Cookie headers.
    response.setHeader('Cache-Control', 'no-store');
  }

  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    // Cookie-authenticated writes must originate from a configured frontend origin.
    assertTrustedOrigin(request);
    assertRateLimit(request, url.pathname);
    // Require a signed, session-bound token before dispatching any authenticated write route.
    await assertCsrfProtection(request, url.pathname);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      applicationController.health(response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users') {
      // User directory data is administrative information, not a public endpoint.
      const authenticatedUser = await sessionService.getAuthenticatedUser(request);
      if (authenticatedUser.role !== 'Administrator') {
        throw new HttpError(403, 'Administrator access required');
      }
      await validateRequest({ query: Object.fromEntries(url.searchParams) }, searchValidationSchema, 'query');
      await userController.list(response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/admin/audit') {
      await requireRole(request, 'Administrator');
      const query = await validateRequest<{ limit?: string }>(
        { query: Object.fromEntries(url.searchParams) },
        auditQueryValidationSchema,
        'query'
      );
      await auditController.list(response, query.limit);
      return;
    }
    // Create a staff or administrator account through an authenticated admin-only boundary.
    // CSRF protection above has already required a valid session for this unsafe request.
    if (request.method === 'POST' && url.pathname === '/api/admin/users') {
      const administrator = await requireRole(request, 'Administrator');

      const body = await validateRequest<CreatePrivilegedUserDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        privilegedUserValidationSchema
      );
      await userController.createPrivileged(response, body, administrator);
      return;
    }

    const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (request.method === 'GET' && adminUserMatch) {
      await requireRole(request, 'Administrator');
      const params = await validateRequest<{ id: string }>({ params: { id: adminUserMatch[1] } }, userIdValidationSchema, 'params');
      await userController.detail(response, params.id);
      return;
    }

    if (request.method === 'PATCH' && adminUserMatch) {
      const administrator = await requireRole(request, 'Administrator');
      const params = await validateRequest<{ id: string }>({ params: { id: adminUserMatch[1] } }, userIdValidationSchema, 'params');
      const body = await validateRequest<AdminUpdateUserDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        adminUpdateUserValidationSchema
      );
      await userController.adminUpdate(response, administrator, params.id, body);
      return;
    }

    // Public registration creates students only. Any extra role property is not trusted or used.
    if (request.method === 'POST' && url.pathname === '/api/users') {
      const body = await validateRequest<CreateUserDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        registerValidationSchema
      );
      await userController.create(response, body);
      return;
    }

    // Email/password login
    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await validateRequest<LoginRequestDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        loginValidationSchema
      );
      await authController.login(response, body);
      return;
    }

    // Request a password reset code. Always responds the same way regardless of whether
    // the email is registered, so this endpoint cannot be used to enumerate accounts.
    if (request.method === 'POST' && url.pathname === '/api/auth/forgot-password') {
      const body = await validateRequest<ForgotPasswordRequestDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        forgotPasswordValidationSchema
      );
      await authController.forgotPassword(response, body);
      return;
    }

    // Complete a password reset using the code delivered by the forgot-password request.
    if (request.method === 'POST' && url.pathname === '/api/auth/password-reset') {
      const body = await validateRequest<PasswordResetRequestDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        passwordResetValidationSchema
      );
      await authController.resetPassword(response, body);
      return;
    }

    // Reload the authenticated user from the verified HttpOnly session cookie.
    if (request.method === 'GET' && url.pathname === '/api/auth/me') {
      await authController.currentUser(request, response);
      return;
    }

    // A CSRF token is fetched only after the HttpOnly session has been verified.
    if (request.method === 'GET' && url.pathname === '/api/auth/csrf') {
      await authController.csrfToken(request, response);
      return;
    }

    if (request.method === 'PATCH' && url.pathname === '/api/auth/profile') {
      const authenticatedUser = await requireAuthenticatedUser(request);
      const body = await validateRequest<UpdateProfileDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        updateProfileValidationSchema
      );
      await userController.updateProfile(response, authenticatedUser.id, body);
      return;
    }

    // Logout is idempotent and succeeds even if the session is already expired.
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
      authController.logout(response);
      return;
    }

    // Begin two-factor authentication setup
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/setup') {
      const body = await readJsonBody<TotpSetupRequestDto>(request);
      await authController.setupTotp(request, response, body.userId);
      return;
    }

    // Verify TOTP token and enable 2FA
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/verify-setup') {
      const body = await readJsonBody<TotpVerifyRequestDto>(request);
      await authController.verifyTotpSetup(request, response, body.userId, body.token);
      return;
    }

    // Verify TOTP token during login
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/verify-login') {
      const body = await readJsonBody<TotpVerifyRequestDto>(request);
      await authController.verifyTotpLogin(request, response, body.userId, body.token);
      return;
    }

    //Disable two-factor authentication
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/disable') {
      const body = await readJsonBody<TotpVerifyRequestDto>(request);
      await authController.disableTotp(request, response, body.userId, body.token);
      return;
    }

    // Retrieve all complaints
    if (request.method === 'GET' && url.pathname === '/api/complaints') {
      const authenticatedUser = await requireAuthenticatedUser(request);
      await validateRequest({ query: Object.fromEntries(url.searchParams) }, searchValidationSchema, 'query');
      await complaintController.list(response, authenticatedUser);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/complaints') {
      const authenticatedUser = await requireAuthenticatedUser(request);
      const body = await validateRequest<CreateComplaintDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        createComplaintValidationSchema
      );
      await complaintController.create(response, body, authenticatedUser);
      return;
    }

    // Retrieve single complaint by ID
    const complaintMatch = url.pathname.match(/^\/api\/complaints\/([^/]+)$/);
    if (request.method === 'GET' && complaintMatch) {
      const authenticatedUser = await requireAuthenticatedUser(request);
      const params = await validateRequest<{ id: string }>({ params: { id: complaintMatch[1] } }, complaintIdValidationSchema, 'params');
      await complaintController.detail(response, params.id, authenticatedUser);
      return;
    }

    if (request.method === 'PATCH' && complaintMatch) {
      const authenticatedUser = await requireAuthenticatedUser(request);
      const params = await validateRequest<{ id: string }>({ params: { id: complaintMatch[1] } }, complaintIdValidationSchema, 'params');
      const body = await validateRequest<UpdateComplaintDto>(
        { body: await readJsonBody<Record<string, unknown>>(request) },
        updateComplaintValidationSchema
      );
      await complaintController.update(response, params.id, body, authenticatedUser);
      return;
    }
    
    throw new HttpError(404, 'Route not found');
  } catch (error) {
    if (error instanceof HttpError) {
      Object.entries(error.headers).forEach(([key, value]) => response.setHeader(key, value));
      
      sendJson(response, error.statusCode, {
        data: null,
        message: error.message,
        ...(error.errors.length ? { errors: error.errors } : {})
      });
      return;
    }

    sendJson(response, 500, { data: null, message: 'Internal server error' });
  }
}
