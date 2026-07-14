// HTTP security middleware for the raw Node server.
// Helmet's middleware API uses native Node request/response objects, so this adapter
// keeps the current server architecture without adding Express.

import helmet from 'helmet';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config/index.js';

// Explicitly enable the requested headers and disable Helmet defaults that do not apply
// to this API-only server, avoiding unnecessary OAuth or cross-origin integration issues.
const helmetMiddleware = helmet({
  // API responses should never be interpreted as a page that can load scripts, frames, or forms.
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  // Prevent the API from being displayed inside an iframe, blocking clickjacking.
  xFrameOptions: { action: 'deny' },
  // HSTS is intentionally production-only: browsers ignore/remember it for a long time.
  strictTransportSecurity: config.isProduction
    ? { maxAge: 15_552_000, includeSubDomains: true, preload: false }
    : false,
  // Send only the origin on cross-origin requests instead of full paths/query strings.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // Stop browsers from MIME-sniffing JSON into an executable or document type.
  xContentTypeOptions: true,
  // The API must remain readable by the frontend origin approved by CORS.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // These document-isolation policies are unnecessary for a JSON API and can interfere with OAuth.
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  xDnsPrefetchControl: false,
  xDownloadOptions: false,
  xPermittedCrossDomainPolicies: false,
  xPoweredBy: false,
  xXssProtection: false
});

/** Applies Helmet headers synchronously before CORS and route handling. */
export function applySecurityHeaders(request: IncomingMessage, response: ServerResponse): void {
  let middlewareError: unknown;
  helmetMiddleware(request, response, (error?: unknown) => {
    middlewareError = error;
  });

  if (middlewareError) throw middlewareError;
}

function isSecureRequest(request: IncomingMessage): boolean {
  // A directly terminated TLS request exposes an encrypted socket.
  if ('encrypted' in request.socket && request.socket.encrypted === true) return true;

  // Forwarded headers are trusted only when configured for a managed reverse proxy.
  if (!config.trustProxy) return false;
  const forwardedProto = request.headers['x-forwarded-proto'];
  const firstProto = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0]?.trim() : '';
  return firstProto === 'https';
}

/** Redirects production HTTP traffic to HTTPS before it can reach an API route. */
export function enforceHttps(request: IncomingMessage, response: ServerResponse): boolean {
  if (!config.requireHttps || isSecureRequest(request)) return false;

  // Redirect to the configured canonical origin instead of reflecting an untrusted Host header.
  const path = request.url?.startsWith('/') ? request.url : '/';
  response.writeHead(308, { Location: new URL(path, config.publicOrigin).toString() });
  response.end();
  return true;
}
