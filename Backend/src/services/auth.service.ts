
//Authentication Service
//Handles login validation, password verification, account locking on failed attempts,
//and password upgrade for non-hashed passwords.
 
import { userRepository } from '../repositories/user.repository.js';
import { HttpError } from '../errors/http-error.js';
import { auditService } from './audit.service.js';
import { hashPassword, isPasswordHash, verifyPassword } from './password.service.js';
import type { User } from '../types/index.js';

// Security configuration for failed login attempts
const maxFailedLoginAttempts = 5;
const lockDurationMs = 15 * 60 * 1000; // 15 minutes in milliseconds

//Checks if user account is currently locked due to failed login attempts
//Returns null if no active lock, otherwise returns the lock expiration date

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

    // Check if account is locked from failed attempts
    const activeLock = getActiveLock(user);
    if (activeLock) {
      throw new HttpError(423, 'Account is locked. Please try again after 15 minutes.', {
        'Retry-After': getRetryAfterSeconds(activeLock)
      });
    }

    // Track failed login attempts and lock account if threshold exceeded
    const wasLockExpired = Boolean(user.lockedUntil);
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      const failedLoginAttempts = (wasLockExpired ? 0 : user.failedLoginAttempts || 0) + 1;

      // Lock account after max failed attempts
      if (failedLoginAttempts >= maxFailedLoginAttempts) {
        const lockedUntil = new Date(Date.now() + lockDurationMs);
        await userRepository.update(user.id, {
          failedLoginAttempts,
          lockedUntil: lockedUntil.toISOString()
        });
        void auditService.record(
          'user.account_locked',
          `Account locked for ${user.email} after ${failedLoginAttempts} failed login attempts.`,
          { id: user.id, name: user.name, role: user.role },
          user.id
        );
        throw new HttpError(423, 'Too many failed login attempts. Account is locked for 15 minutes.', {
          'Retry-After': getRetryAfterSeconds(lockedUntil)
        });
      }

      // Record failed attempt and clear any prior lock
      await userRepository.update(user.id, {
        failedLoginAttempts,
        lockedUntil: undefined
      });
      void auditService.record(
        'user.login_failed',
        `Failed login attempt for ${user.email}.`,
        { id: user.id, name: user.name, role: user.role },
        user.id
      );
      throw new HttpError(401, `Invalid email or password. ${maxFailedLoginAttempts - failedLoginAttempts} attempts remaining.`);
    }

    // Verify account is active
    if (user.status !== 'Active') {
      throw new HttpError(403, 'This account is inactive');
    }

    // Clear failed login attempts and lock on successful login
    const updates: Partial<User> = {
      failedLoginAttempts: undefined,
      lockedUntil: undefined
    };

    // Upgrade legacy non-hashed passwords to bcrypt on successful login
    if (!isPasswordHash(user.password)) {
      updates.password = await hashPassword(password);
    }

    const updatedUser = (await userRepository.update(user.id, updates)) || user;
    void auditService.record(
      'user.login_success',
      `${updatedUser.name} logged in.`,
      { id: updatedUser.id, name: updatedUser.name, role: updatedUser.role },
      updatedUser.id
    );
    return updatedUser;
  }
};
