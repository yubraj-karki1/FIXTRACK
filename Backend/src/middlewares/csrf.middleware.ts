// CSRF middleware for cookie-authenticated write requests.

import type { IncomingMessage } from 'node:http';
import { sessionService } from '../services/session.service.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

const preAuthenticationWrites = new Set([
  '/api/auth/login',
  '/api/auth/totp/verify-login',
  '/api/auth/totp/recover',
  '/api/users',
  '/api/auth/forgot-password',
  '/api/auth/password-reset',
  '/api/auth/password/expired-change'
]);

export async function assertCsrfProtection(request: IncomingMessage, pathname: string): Promise<void> {
  if (safeMethods.has(request.method || 'GET') || preAuthenticationWrites.has(pathname)) {
    return;
  }
  await sessionService.assertCsrfToken(request);
}
