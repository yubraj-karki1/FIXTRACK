// SameSite cookies block most cross-site form attacks. This origin check adds a second
// CSRF boundary for browser requests that change state, including same-site subdomains.

import type { IncomingMessage } from 'node:http';
import { HttpError } from '../errors/http-error.js';
import { isAllowedOrigin } from './cors.middleware.js';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function assertTrustedOrigin(request: IncomingMessage): void {
  if (safeMethods.has(request.method || 'GET')) return;

  const origin = request.headers.origin;
  // Non-browser clients may omit Origin. Browser cookie requests provide it.
  if (!origin) return;

  if (!isAllowedOrigin(origin)) {
    throw new HttpError(403, 'Request origin is not allowed');
  }
}
