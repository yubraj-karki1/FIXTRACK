//Authentication Service
//Handles login validation, password verification, account locking on failed attempts,
//and password upgrade for non-hashed passwords.
 
import { randomInt } from 'node:crypto';
import { userRepository } from '../repositories/user.repository.js';
import { HttpError } from '../errors/http-error.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import {
  appendPasswordHistory,
  hashPassword,
  isPasswordHash,
  passwordHistoryLimit,
  validatePasswordStrength,
  verifyPassword,
  wasPasswordUsedBefore
} from './password.service.js';
import type { User } from '../types/index.js';

// Security configuration for failed login attempts
const maxFailedLoginAttempts = 5;
const lockDurationMs = 15 * 60 * 1000; // 15 minutes in milliseconds

// Security configuration for the forgot-password flow
const passwordResetCodeLifetimeMs = 15 * 60 * 1000;
const maxPasswordResetAttempts = 5;

function generateResetCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function invalidResetCodeError(): HttpError {
  return new HttpError(400, 'That reset code is invalid or has expired. Request a new one.');
}

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

    // Password expiry is gated by the controller after this returns (issuing a pending-change
    // challenge instead of a full session), the same way TOTP is layered on top of a valid password.

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
  },

  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    // Behave identically whether or not the account exists, so this endpoint cannot be used
    // to discover which emails are registered.
    if (!user || user.status !== 'Active') return;

    const code = generateResetCode();
    await userRepository.update(user.id, {
      passwordResetCodeHash: await hashPassword(code),
      passwordResetExpiresAt: new Date(Date.now() + passwordResetCodeLifetimeMs).toISOString(),
      passwordResetAttempts: 0
    });

    try {
      await notificationService.sendPasswordResetCode(user.email, code);
    } catch (error) {
      console.error(`Failed to send password reset email to ${user.email}:`, error);
    }
    void auditService.record(
      'user.password_reset_requested',
      `${user.name} requested a password reset.`,
      { id: user.id, name: user.name, role: user.role },
      user.id
    );
  },

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.passwordResetCodeHash || !user.passwordResetExpiresAt) {
      throw invalidResetCodeError();
    }

    const isExpired = new Date(user.passwordResetExpiresAt).getTime() <= Date.now();
    const attemptsExhausted = (user.passwordResetAttempts || 0) >= maxPasswordResetAttempts;
    if (isExpired || attemptsExhausted) {
      // A stale or exhausted code must be discarded so a leaked code can't be retried forever.
      await userRepository.update(user.id, {
        passwordResetCodeHash: undefined,
        passwordResetExpiresAt: undefined,
        passwordResetAttempts: undefined
      });
      throw invalidResetCodeError();
    }

    const isCodeValid = await verifyPassword(code, user.passwordResetCodeHash);
    if (!isCodeValid) {
      await userRepository.update(user.id, { passwordResetAttempts: (user.passwordResetAttempts || 0) + 1 });
      throw invalidResetCodeError();
    }

    const passwordValidation = validatePasswordStrength(newPassword, user.email);
    if (!passwordValidation.valid) {
      throw new HttpError(400, passwordValidation.errors.join(' '));
    }

    if (await wasPasswordUsedBefore(newPassword, user.password, user.passwordHistory)) {
      throw new HttpError(400, `You cannot reuse a recent password. 
      Choose one you haven't used in your last ${passwordHistoryLimit} passwords.`);
    }

    await userRepository.update(user.id, {
      password: await hashPassword(newPassword),
      passwordChangedAt: new Date().toISOString(),
      passwordHistory: appendPasswordHistory(user.password, user.passwordHistory),
      passwordResetCodeHash: undefined,
      passwordResetExpiresAt: undefined,
      passwordResetAttempts: undefined,
      // A successful reset is proof of ownership, so also clear any unrelated login lockout.
      failedLoginAttempts: undefined,
      lockedUntil: undefined
    });

    void auditService.record(
      'user.password_reset_completed',
      `${user.name} reset their password.`,
      { id: user.id, name: user.name, role: user.role },
      user.id
    );
  },

  //Replaces a password that failed the expiry check at login. Called only after the
  //controller has verified the caller holds the short-lived pending-password-change cookie.

  async changePasswordAfterExpiry(userId: string, newPassword: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    const passwordValidation = validatePasswordStrength(newPassword, user.email);
    if (!passwordValidation.valid) {
      throw new HttpError(400, passwordValidation.errors.join(' '));
    }

    if (await wasPasswordUsedBefore(newPassword, user.password, user.passwordHistory)) {
      throw new HttpError(400, `You cannot reuse a recent password. Choose one you haven't used in your last ${passwordHistoryLimit} passwords.`);
    }

    await userRepository.update(user.id, {
      password: await hashPassword(newPassword),
      passwordChangedAt: new Date().toISOString(),
      passwordHistory: appendPasswordHistory(user.password, user.passwordHistory),
      failedLoginAttempts: undefined,
      lockedUntil: undefined
    });

    void auditService.record(
      'user.password_reset_completed',
      `${user.name} updated an expired password.`,
      { id: user.id, name: user.name, role: user.role },
      user.id
    );
  }
};
