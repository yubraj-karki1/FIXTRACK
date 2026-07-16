// JWT Verification

import jwt, { type JwtPayload } from 'jsonwebtoken';
import { HttpError } from '../errors/http-error.js';
import { userRepository } from '../repositories/user.repository.js';
import type { User } from '../types/index.js';
import {
  getJwtAudience,
  getJwtIssuer,
  getValidatedJwtSecret,
  jwtAlgorithm,
  type TokenPurpose
} from '../config/session.config.js';

export interface FixTrackJwtPayload extends JwtPayload {
  purpose: TokenPurpose;
  sessionId?: string;
  // Session-token-only: the account's sessionVersion at issuance time (see verifyAndLoadActiveUser).
  sv?: number;
}

export function verifyToken(token: string | undefined, expectedPurpose: TokenPurpose): FixTrackJwtPayload {
  if (!token) throw new HttpError(401, 'Authentication required');

  try {
    const payload = jwt.verify(token, getValidatedJwtSecret(), {
      algorithms: [jwtAlgorithm],
      audience: getJwtAudience(),
      issuer: getJwtIssuer()
    });

    if (typeof payload === 'string' || payload.purpose !== expectedPurpose || !payload.sub) {
      throw new HttpError(401, 'Invalid authentication session');
    }

    return payload as FixTrackJwtPayload;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'Authentication session is invalid or expired');
  }
}

function withoutPrivateFields(user: User): User {
  const {
    password,
    failedLoginAttempts,
    lockedUntil,
    totpSecret,
    pendingTotpSecret,
    passwordResetCodeHash,
    passwordResetExpiresAt,
    passwordResetAttempts,
    passwordHistory,
    ...safeUser
  } = user;
  return safeUser;
}


export async function verifyAndLoadActiveUser(token: string | undefined):
Promise<{ user: User; payload: FixTrackJwtPayload }> {
  const payload = verifyToken(token, 'session');
  const user = await userRepository.findById(payload.sub!);

  if (!user || user.status !== 'Active') {
    throw new HttpError(401, 'Authentication session is no longer valid');
  }

  // A password reset/change, role change, or MFA disable bumps sessionVersion, so any
  // token signed before that action - including a stolen one - stops working immediately
  // instead of waiting out the full session lifetime.
  if ((payload.sv ?? 0) !== (user.sessionVersion ?? 0)) {
    throw new HttpError(401, 'Authentication session is no longer valid');
  }

  return { user: withoutPrivateFields(user), payload };
}
