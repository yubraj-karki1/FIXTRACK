// CSRF middleware for cookie-authenticated write requests.
// Public sign-in entry points are exempt because they run before a full session exists.

import type { IncomingMessage } from 'node:http';
import { sessionService } from '../services/session.service.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

// These endpoints establish authentication (or complete a pending TOTP challenge), so they
// cannot use a CSRF token that is intentionally issued only after full authentication.
const preAuthenticationWrites = new Set([
  '/api/auth/login',
  '/api/auth/totp/verify-login',
  '/api/users'
]);

export async function assertCsrfProtection(request: IncomingMessage, pathname: string): Promise<void> {
  if (safeMethods.has(request.method || 'GET') || preAuthenticationWrites.has(pathname)) {
    return;
  }

  // This runs before route dispatch, covering POST, PUT, PATCH, and DELETE endpoints added
  // later as well as the existing logout and TOTP/account management operations.
  await sessionService.assertCsrfToken(request);
}
