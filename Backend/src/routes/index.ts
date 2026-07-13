
// API Route Handler
// Defines all API endpoints with request validation, rate limiting, and error handling
import type { IncomingMessage, ServerResponse } from 'node:http';
import { applicationController } from '../controller/application.controller.js';
import { authController } from '../controller/auth.controller.js';
import { complaintController } from '../controller/complaint.controller.js';
import { sendJson } from '../controller/response.js';
import { userController } from '../controller/user.controller.js';
import type { LoginRequestDto, TotpSetupRequestDto, TotpVerifyRequestDto } from '../dtos/auth.dto.js';
import type { CreateUserDto } from '../dtos/user.dto.js';
import { HttpError } from '../errors/http-error.js';
import { assertRateLimit } from '../middlewares/rate-limit.middleware.js';
import {
  complaintIdValidationSchema,
  loginValidationSchema,
  registerValidationSchema,
  searchValidationSchema,
  validateRequest
} from '../middlewares/validation.middleware.js';
import { readJsonBody } from './body.js';


 // Main route handler - processes all incoming HTTP requests
 // Matches URL and method to appropriate controller action
 // Includes validation middleware and centralized error handling
 
export async function handleRoutes(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    assertRateLimit(request, url.pathname);

    if (request.method === 'GET' && url.pathname === '/api/health') {
      applicationController.health(response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users') {
      await validateRequest({ query: Object.fromEntries(url.searchParams) }, searchValidationSchema, 'query');
      await userController.list(response);
      return;
    }
    // Create new user account (registration)
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

    // Initiate Google OAuth flow
    if (request.method === 'GET' && url.pathname === '/api/auth/google') {
      authController.googleLogin(response);
      return;
    }

    // Google OAuth callback with auth code
    if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') {
      await authController.googleCallback(response, url.searchParams.get('code') || '');
      return;
    }

    // Begin two-factor authentication setup
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/setup') {
      const body = await readJsonBody<TotpSetupRequestDto>(request);
      await authController.setupTotp(response, body.userId);
      return;
    }

    // Verify TOTP token and enable 2FA
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/verify-setup') {
      const body = await readJsonBody<TotpVerifyRequestDto>(request);
      await authController.verifyTotpSetup(response, body.userId, body.token);
      return;
    }

    // Verify TOTP token during login
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/verify-login') {
      const body = await readJsonBody<TotpVerifyRequestDto>(request);
      await authController.verifyTotpLogin(response, body.userId, body.token);
      return;
    }

    //Disable two-factor authentication
    if (request.method === 'POST' && url.pathname === '/api/auth/totp/disable') {
      const body = await readJsonBody<TotpSetupRequestDto>(request);
      await authController.disableTotp(response, body.userId);
      return;
    }

    // Retrieve all complaints
    if (request.method === 'GET' && url.pathname === '/api/complaints') {
      await validateRequest({ query: Object.fromEntries(url.searchParams) }, searchValidationSchema, 'query');
      await complaintController.list(response);
      return;
    }

    // Retrieve single complaint by ID
    const complaintMatch = url.pathname.match(/^\/api\/complaints\/([^/]+)$/);
    if (request.method === 'GET' && complaintMatch) {
      const params = await validateRequest<{ id: string }>({ params: { id: complaintMatch[1] } }, complaintIdValidationSchema, 'params');
      await complaintController.detail(response, params.id);
      return;
    }
    
    throw new HttpError(404, 'Route not found');
  } catch (error) {
    if (error instanceof HttpError) {
      if (request.method === 'GET' && url.pathname.startsWith('/api/auth/google')) {
        const redirectUrl = new URL('http://localhost:3000/login');
        redirectUrl.searchParams.set('googleError', error.message);
        response.writeHead(302, { Location: redirectUrl.toString() });
        response.end();
        return;
      }

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
