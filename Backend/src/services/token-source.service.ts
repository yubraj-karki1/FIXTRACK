// JWT Cookie Fallback

import type { IncomingMessage } from 'node:http';
import { config } from '../config/index.js';
import { sessionCookieName } from '../config/session.config.js';

export function getCookieMap(request: IncomingMessage): Record<string, string> {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return {};

  return Object.fromEntries(
    cookieHeader.split(';').flatMap((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return [];

      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      try {
        return [[name, decodeURIComponent(value)]];
      } catch {
        return [];
      }
    })
  );
}

function getBearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (!header || Array.isArray(header)) return undefined;

  const [scheme, token] = header.split(' ');
  if (!token || scheme?.toLowerCase() !== 'bearer') return undefined;

  return token;
}

export function getSessionToken(request: IncomingMessage): string | undefined {
  const cookieToken = getCookieMap(request)[sessionCookieName];
  if (cookieToken) return cookieToken;

  if (config.allowBearerFallback) {
    return getBearerToken(request);
  }

  return undefined;
}
