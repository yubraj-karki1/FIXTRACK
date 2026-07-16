// Session Service
// Orchestrates session issuance, cookie writing/clearing, and CSRF binding by composing the
// Session Configuration (constants/validation), JWT Cookie Fallback (token extraction), and
// JWT Verification (signature/claims/user-lookup) modules. Controllers never touch tokens or
// cookies directly - everything auth-cookie-related goes through this file, and its public
// shape is unchanged by the split so no caller (controllers, middleware, tests) needed to change.

import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import { HttpError } from '../errors/http-error.js';
import type { User } from '../types/index.js';
import {
  cookieSecurity,
  getJwtAudience,
  getJwtIssuer,
  getValidatedJwtSecret,
  getValidatedSessionLifetimeSeconds,
  jwtAlgorithm,
  pendingCookiePath,
  pendingPasswordCookieName,
  pendingPasswordLifetimeSeconds,
  pendingTotpCookieName,
  pendingTotpLifetimeSeconds,
  sessionCookieName,
  sessionCookiePath,
  type TokenPurpose
} from '../config/session.config.js';
import { getCookieMap, getSessionToken } from './token-source.service.js';
import { type FixTrackJwtPayload, verifyAndLoadActiveUser, verifyToken } from './jwt-verification.service.js';

function serializeCookie(name: string, value: string, options: { maxAgeSeconds: number; path?: string }): string {
  // An epoch expiry makes deletion unambiguous across browsers and clock skew.
  const expires = options.maxAgeSeconds <= 0 ? new Date(0) : new Date(Date.now() + options.maxAgeSeconds * 1000);
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || sessionCookiePath}`,
    'HttpOnly',
    `SameSite=${cookieSecurity.sameSite}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    `Expires=${expires.toUTCString()}`
  ];

  if (cookieSecurity.secure) attributes.push('Secure');
  return attributes.join('; ');
}

function appendSetCookie(response: ServerResponse, cookie: string): void {
  // Preserve previously set cookies: login may clear a challenge and set a new session together.
  const current = response.getHeader('Set-Cookie');
  const cookies = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  response.setHeader('Set-Cookie', [...cookies, cookie]);
}

function clearCookie(response: ServerResponse, name: string, path = sessionCookiePath): void {
  appendSetCookie(response, serializeCookie(name, '', { maxAgeSeconds: 0, path }));
}

function signToken(
  userId: string,
  purpose: TokenPurpose,
  expiresInSeconds: number,
  sessionId?: string,
  sessionVersion?: number
): string {
  // JWTs contain only the user id and token purpose; user profile data stays out of the token.
  return jwt.sign(
    { purpose, ...(sessionId ? { sessionId } : {}), ...(sessionVersion !== undefined ? { sv: sessionVersion } : {}) },
    getValidatedJwtSecret(),
    {
      algorithm: jwtAlgorithm,
      audience: getJwtAudience(),
      issuer: getJwtIssuer(),
      subject: userId,
      jwtid: randomUUID(),
      expiresIn: expiresInSeconds
    }
  );
}

function tokensMatch(left: string, right: string): boolean {
  // Avoid a value-dependent early exit when comparing the session binding values.
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function getAuthenticatedSession(request: IncomingMessage): Promise<{ user: User; payload: FixTrackJwtPayload }> {
  // The session cookie is checked first; a Bearer header is only ever consulted when
  // ALLOW_BEARER_FALLBACK=true (see token-source.service.ts).
  return verifyAndLoadActiveUser(getSessionToken(request));
}

export const sessionService = {
  // Accepts just the fields it needs (not a full User) so callers - including tests - can
  // issue a session without assembling an entire user record.
  issueSession(response: ServerResponse, user: Pick<User, 'id' | 'sessionVersion'>): void {
    const lifetimeSeconds = getValidatedSessionLifetimeSeconds();
    const token = signToken(user.id, 'session', lifetimeSeconds, undefined, user.sessionVersion ?? 0);
    // A completed sign-in replaces any pending 2FA or forced-password-change challenge.
    clearCookie(response, pendingTotpCookieName, pendingCookiePath);
    clearCookie(response, pendingPasswordCookieName, pendingCookiePath);
    appendSetCookie(
      response,
      serializeCookie(sessionCookieName, token, { maxAgeSeconds: lifetimeSeconds, path: sessionCookiePath })
    );
  },

  issuePendingTotp(response: ServerResponse, userId: string): void {
    const token = signToken(userId, 'totp-pending', pendingTotpLifetimeSeconds);
    // A user awaiting the second factor must not retain an authenticated session.
    clearCookie(response, sessionCookieName, sessionCookiePath);
    appendSetCookie(
      response,
      serializeCookie(pendingTotpCookieName, token, {
        maxAgeSeconds: pendingTotpLifetimeSeconds,
        path: pendingCookiePath
      })
    );
  },

  issuePendingPasswordChange(response: ServerResponse, userId: string): void {
    const token = signToken(userId, 'password-pending', pendingPasswordLifetimeSeconds);
    // A user with an expired password must not retain an authenticated session either.
    clearCookie(response, sessionCookieName, sessionCookiePath);
    appendSetCookie(
      response,
      serializeCookie(pendingPasswordCookieName, token, {
        maxAgeSeconds: pendingPasswordLifetimeSeconds,
        path: pendingCookiePath
      })
    );
  },

  clearSession(response: ServerResponse): void {
    // Used by /auth/me so an expired session does not cancel a still-valid TOTP challenge.
    clearCookie(response, sessionCookieName, sessionCookiePath);
  },

  clearAuthentication(response: ServerResponse): void {
    // Logout clears every cookie created by the authentication flows.
    clearCookie(response, sessionCookieName, sessionCookiePath);
    clearCookie(response, pendingTotpCookieName, pendingCookiePath);
    clearCookie(response, pendingPasswordCookieName, pendingCookiePath);
  },

  async getAuthenticatedUser(request: IncomingMessage): Promise<User> {
    return (await getAuthenticatedSession(request)).user;
  },

  async createCsrfToken(request: IncomingMessage): Promise<string> {
    const { payload } = await getAuthenticatedSession(request);
    if (!payload.jti) {
      // Every session is created with a jti. Failing closed protects older malformed tokens.
      throw new HttpError(401, 'Authentication session is invalid');
    }

    // The token is returned only over an authenticated, no-store response and held in memory
    // by the frontend. Keeping it out of a cookie avoids cross-subdomain cookie-read issues.
    return signToken(payload.sub!, 'csrf', getValidatedSessionLifetimeSeconds(), payload.jti);
  },

  async assertCsrfToken(request: IncomingMessage): Promise<void> {
    // Authenticate first. An attacker cannot turn a missing token into an account probe.
    const { payload: sessionPayload } = await getAuthenticatedSession(request);
    const header = request.headers['x-csrf-token'];
    const csrfToken = Array.isArray(header) ? undefined : header;
    if (!csrfToken) {
      throw new HttpError(403, 'CSRF token is required');
    }

    let csrfPayload: FixTrackJwtPayload;
    try {
      csrfPayload = verifyToken(csrfToken, 'csrf');
    } catch (error) {
      // A CSRF failure is deliberately a 403, not an authentication error.
      if (error instanceof HttpError) {
        throw new HttpError(403, 'CSRF token is invalid');
      }
      throw error;
    }

    if (
      !sessionPayload.jti ||
      !csrfPayload.sessionId ||
      csrfPayload.sub !== sessionPayload.sub ||
      !tokensMatch(csrfPayload.sessionId, sessionPayload.jti)
    ) {
      throw new HttpError(403, 'CSRF token is invalid');
    }
  },

  assertPendingTotpUser(request: IncomingMessage, userId: string): void {
    // The second-factor code is accepted only for the user who completed password/OAuth step one.
    // Pending challenges are cookie-only - the Bearer fallback never applies here.
    const cookies = getCookieMap(request);
    const pendingToken = cookies[pendingTotpCookieName];
    if (!pendingToken) {
      // The short-lived challenge cookie is intentionally required; a TOTP code alone must
      // never complete a login after a browser restart, expiry, or direct URL visit.
      throw new HttpError(401, 'Two-factor login session expired. Please sign in again.');
    }

    let payload: FixTrackJwtPayload;
    try {
      payload = verifyToken(pendingToken, 'totp-pending');
    } catch (error) {
      if (error instanceof HttpError) {
        throw new HttpError(401, 'Two-factor login session expired. Please sign in again.');
      }
      throw error;
    }

    if (payload.sub !== userId) {
      throw new HttpError(403, 'This two-factor challenge does not match the login attempt');
    }
  },

  assertPendingPasswordUser(request: IncomingMessage, userId: string): void {
    // A new password is accepted only for the user who just proved the old one at login.
    const cookies = getCookieMap(request);
    const pendingToken = cookies[pendingPasswordCookieName];
    if (!pendingToken) {
      throw new HttpError(401, 'Password update session expired. Please sign in again.');
    }

    let payload: FixTrackJwtPayload;
    try {
      payload = verifyToken(pendingToken, 'password-pending');
    } catch (error) {
      if (error instanceof HttpError) {
        throw new HttpError(401, 'Password update session expired. Please sign in again.');
      }
      throw error;
    }

    if (payload.sub !== userId) {
      throw new HttpError(403, 'This password update does not match the login attempt');
    }
  }
};
