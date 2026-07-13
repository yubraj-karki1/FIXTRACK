// JWT session service
// Keeps all JWT creation/verification and cookie attributes in one place so controllers
// never expose tokens in JSON, URLs, JavaScript-readable cookies, or browser storage.

import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { config } from '../config/index.js';
import { HttpError } from '../errors/http-error.js';
import { userRepository } from '../repositories/user.repository.js';
import type { User } from '../types/index.js';

// Separate cookies prevent a partially authenticated TOTP user from using full-session routes.
const sessionCookieName = 'fixtrack_session';
const pendingTotpCookieName = 'fixtrack_totp_pending';
// OAuth state is a random one-time value, not a user credential.
const googleStateCookieName = 'fixtrack_google_state';
const pendingTotpLifetimeSeconds = 5 * 60;
const googleStateLifetimeSeconds = 10 * 60;
// CSRF tokens are signed capabilities, not authentication tokens. They are invalid as soon
// as the session JWT they reference is replaced or cleared, and never outlive that session.

type TokenPurpose = 'session' | 'totp-pending' | 'csrf';

interface FixTrackJwtPayload extends JwtPayload {
  purpose: TokenPurpose;
  // A CSRF token is bound to the unique JWT id of one authenticated session.
  sessionId?: string;
}

function getJwtSecret(): string {
  // A short/default secret makes offline JWT guessing practical, so fail closed in production.
  if (Buffer.byteLength(config.jwtSecret, 'utf8') < 32) {
    throw new HttpError(500, 'JWT_SECRET must contain at least 32 characters');
  }

  return config.jwtSecret;
}

function getSessionLifetimeSeconds(): number {
  if (!Number.isSafeInteger(config.jwtExpiresInSeconds) || config.jwtExpiresInSeconds <= 0) {
    throw new HttpError(500, 'JWT_EXPIRES_IN_SECONDS must be a positive integer');
  }

  return config.jwtExpiresInSeconds;
}

function getCookieMap(request: IncomingMessage): Record<string, string> {
  // Parse only server-side. Client code never reads the session cookie or JWT value.
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

function serializeCookie(
  name: string,
  value: string,
  options: { maxAgeSeconds: number; path?: string }
): string {
  // An epoch expiry makes deletion unambiguous across browsers and clock skew.
  const expires = options.maxAgeSeconds <= 0
    ? new Date(0)
    : new Date(Date.now() + options.maxAgeSeconds * 1000);
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path || '/'}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`,
    `Expires=${expires.toUTCString()}`
  ];

  // Secure is mandatory in production so the JWT is never sent over plain HTTP.
  if (config.isProduction) attributes.push('Secure');
  return attributes.join('; ');
}

function appendSetCookie(response: ServerResponse, cookie: string): void {
  // Preserve previously set cookies: login may clear a challenge and set a new session together.
  const current = response.getHeader('Set-Cookie');
  const cookies = Array.isArray(current) ? current.map(String) : current ? [String(current)] : [];
  response.setHeader('Set-Cookie', [...cookies, cookie]);
}

function clearCookie(response: ServerResponse, name: string, path = '/'): void {
  appendSetCookie(response, serializeCookie(name, '', { maxAgeSeconds: 0, path }));
}

function signToken(
  userId: string,
  purpose: TokenPurpose,
  expiresInSeconds: number,
  sessionId?: string
): string {
  // JWTs contain only the user id and token purpose; user profile data stays out of the token.
  return jwt.sign(
    { purpose, ...(sessionId ? { sessionId } : {}) },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      audience: config.jwtAudience,
      issuer: config.jwtIssuer,
      subject: userId,
      jwtid: randomUUID(),
      expiresIn: expiresInSeconds
    }
  );
}

function verifyToken(token: string | undefined, expectedPurpose: TokenPurpose): FixTrackJwtPayload {
  if (!token) throw new HttpError(401, 'Authentication required');

  try {
    // Lock the algorithm and validate issuer/audience to avoid accepting a token for another service.
    const payload = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      audience: config.jwtAudience,
      issuer: config.jwtIssuer
    });

    if (typeof payload === 'string' || payload.purpose !== expectedPurpose || !payload.sub) {
      throw new HttpError(401, 'Invalid authentication session');
    }

    return payload as FixTrackJwtPayload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Do not reveal whether a JWT was malformed, expired, or signed incorrectly.
    throw new HttpError(401, 'Authentication session is invalid or expired');
  }
}

function withoutPrivateFields(user: User): User {
  const { password, failedLoginAttempts, lockedUntil, totpSecret, pendingTotpSecret, ...safeUser } = user;
  return safeUser;
}

async function getAuthenticatedSession(request: IncomingMessage): Promise<{ user: User; payload: FixTrackJwtPayload }> {
  const cookies = getCookieMap(request);
  const payload = verifyToken(cookies[sessionCookieName], 'session');
  // Fetch the user on every check so deactivated accounts cannot use an old JWT.
  const user = await userRepository.findById(payload.sub!);

  if (!user || user.status !== 'Active') {
    throw new HttpError(401, 'Authentication session is no longer valid');
  }

  return { user: withoutPrivateFields(user), payload };
}

function tokensMatch(left: string, right: string): boolean {
  // Avoid a value-dependent early exit when comparing the session binding values.
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export const sessionService = {
  issueSession(response: ServerResponse, userId: string): void {
    const lifetimeSeconds = getSessionLifetimeSeconds();
    const token = signToken(userId, 'session', lifetimeSeconds);
    // A completed sign-in replaces any pending 2FA challenge.
    clearCookie(response, pendingTotpCookieName, '/api/auth');
    appendSetCookie(
      response,
      serializeCookie(sessionCookieName, token, { maxAgeSeconds: lifetimeSeconds })
    );
  },

  issuePendingTotp(response: ServerResponse, userId: string): void {
    const token = signToken(userId, 'totp-pending', pendingTotpLifetimeSeconds);
    // A user awaiting the second factor must not retain an authenticated session.
    clearCookie(response, sessionCookieName);
    appendSetCookie(
      response,
      serializeCookie(pendingTotpCookieName, token, {
        maxAgeSeconds: pendingTotpLifetimeSeconds,
        path: '/api/auth'
      })
    );
  },

  clearSession(response: ServerResponse): void {
    // Used by /auth/me so an expired session does not cancel a still-valid TOTP challenge.
    clearCookie(response, sessionCookieName);
  },

  clearAuthentication(response: ServerResponse): void {
    // Logout clears every cookie created by the authentication flows.
    clearCookie(response, sessionCookieName);
    clearCookie(response, pendingTotpCookieName, '/api/auth');
    clearCookie(response, googleStateCookieName, '/api/auth/google');
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
    return signToken(payload.sub!, 'csrf', getSessionLifetimeSeconds(), payload.jti);
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

  createGoogleState(response: ServerResponse): string {
    // SameSite=Lax keeps this short-lived state cookie available to Google's top-level callback.
    const state = randomBytes(32).toString('base64url');
    appendSetCookie(
      response,
      serializeCookie(googleStateCookieName, state, {
        maxAgeSeconds: googleStateLifetimeSeconds,
        path: '/api/auth/google'
      })
    );
    return state;
  },

  verifyAndClearGoogleState(request: IncomingMessage, response: ServerResponse, returnedState: string): void {
    // Clear the one-time state before comparison so it cannot be replayed after a successful callback.
    const expectedState = getCookieMap(request)[googleStateCookieName] || '';
    clearCookie(response, googleStateCookieName, '/api/auth/google');

    const expected = Buffer.from(expectedState);
    const returned = Buffer.from(returnedState);
    if (!expected.length || expected.length !== returned.length || !timingSafeEqual(expected, returned)) {
      throw new HttpError(400, 'Invalid Google login state');
    }
  }
};
