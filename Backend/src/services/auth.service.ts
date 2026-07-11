import { userRepository } from '../repositories/user.repository.js';
import { HttpError } from '../errors/http-error.js';
import { hashPassword, isPasswordHash, verifyPassword } from './password.service.js';
import type { User } from '../types/index.js';

const maxFailedLoginAttempts = 5;
const lockDurationMs = 15 * 60 * 1000;

function getActiveLock(user: User): Date | null {
  if (!user.lockedUntil) return null;

  const lockedUntil = new Date(user.lockedUntil);
  if (Number.isNaN(lockedUntil.getTime()) || lockedUntil.getTime() <= Date.now()) {
    return null;
  }

  return lockedUntil;
}

function getRetryAfterSeconds(lockedUntil: Date): string {
  return String(Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
}

export const authService = {
  async validateLogin(email: string, password: string): Promise<User> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new HttpError(401, 'Invalid email or password');
    }

    const activeLock = getActiveLock(user);
    if (activeLock) {
      throw new HttpError(423, 'Account is locked. Please try again after 15 minutes.', {
        'Retry-After': getRetryAfterSeconds(activeLock)
      });
    }

    const wasLockExpired = Boolean(user.lockedUntil);
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      const failedLoginAttempts = (wasLockExpired ? 0 : user.failedLoginAttempts || 0) + 1;

      if (failedLoginAttempts >= maxFailedLoginAttempts) {
        const lockedUntil = new Date(Date.now() + lockDurationMs);
        await userRepository.update(user.id, {
          failedLoginAttempts,
          lockedUntil: lockedUntil.toISOString()
        });
        throw new HttpError(423, 'Too many failed login attempts. Account is locked for 15 minutes.', {
          'Retry-After': getRetryAfterSeconds(lockedUntil)
        });
      }

      await userRepository.update(user.id, {
        failedLoginAttempts,
        lockedUntil: undefined
      });
      throw new HttpError(401, `Invalid email or password. ${maxFailedLoginAttempts - failedLoginAttempts} attempts remaining.`);
    }

    if (user.status !== 'Active') {
      throw new HttpError(403, 'This account is inactive');
    }

    const updates: Partial<User> = {
      failedLoginAttempts: undefined,
      lockedUntil: undefined
    };

    if (!isPasswordHash(user.password)) {
      updates.password = await hashPassword(password);
    }

    return (await userRepository.update(user.id, updates)) || user;
  }
};
