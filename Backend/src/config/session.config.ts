// Session Configuration

import { HttpError } from '../errors/http-error.js';
import { config } from './index.js';
export type TokenPurpose = 'session' | 'totp-pending' | 'password-pending' | 'csrf';

export const jwtAlgorithm = 'HS256' as const;

export const sessionCookieName = 'fixtrack_session';
export const sessionCookiePath = '/';

export const pendingTotpCookieName = 'fixtrack_totp_pending';
export const pendingTotpLifetimeSeconds = 5 * 60;

export const pendingPasswordCookieName = 'fixtrack_password_pending';
export const pendingPasswordLifetimeSeconds = 10 * 60;


export const pendingCookiePath = '/api/auth';

export const cookieSecurity = {
  httpOnly: true,
  sameSite: 'Lax' as const,
  get secure(): boolean {
    return config.isProduction;
  }
};

export function getJwtIssuer(): string {
  return config.jwtIssuer;
}

export function getJwtAudience(): string {
  return config.jwtAudience;
}
export function getValidatedJwtSecret(): string {
  if (Buffer.byteLength(config.jwtSecret, 'utf8') < 32) {
    throw new HttpError(500, 'JWT_SECRET must contain at least 32 characters');
  }

  return config.jwtSecret;
}

export function getValidatedSessionLifetimeSeconds(): number {
  if (!Number.isSafeInteger(config.jwtExpiresInSeconds) || config.jwtExpiresInSeconds <= 0) {
    throw new HttpError(500, 'JWT_EXPIRES_IN_SECONDS must be a positive integer');
  }

  return config.jwtExpiresInSeconds;
}
