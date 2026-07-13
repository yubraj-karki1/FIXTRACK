import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config/index.js';

const allowedOrigins = config.corsOrigin
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export function isAllowedOrigin(origin: string): boolean {
  // Reused by the CSRF origin middleware so CORS and write protection share one allow-list.
  return allowedOrigins.includes(origin);
}

export function applyCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;

  // Credentialed requests require an explicit origin; '*' is invalid with cookies.
  if (origin && isAllowedOrigin(origin)) {
    // Echoing the approved origin is required when credentials: 'include' is used by the frontend.
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }

  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
