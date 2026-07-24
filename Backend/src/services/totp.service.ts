import { randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { HttpError } from '../errors/http-error.js';
import { userRepository } from '../repositories/user.repository.js';
import type { AuditContext } from './audit.service.js';
import { auditService } from './audit.service.js';
import { hashPassword, verifyPassword } from './password.service.js';
import type { AuthLoginResponse, TotpSetupResponse, TotpSetupVerifiedResponse, User } from '../types/index.js';
import { decryptSecret, encryptSecret } from './secret-encryption.service.js';

const issuer = 'FixTrack';
const recoveryCodeCount = 10;

function withoutTotpSecrets(user: User): User {
  const { password, failedLoginAttempts, lockedUntil, totpSecret, pendingTotpSecret, recoveryCodeHashes, ...safeUser } = user;
  return safeUser;
}

function auditActor(user: User): { id: string; name: string; role: User['role'] } {
  return { id: user.id, name: user.name, role: user.role };
}

// Human-typeable, high-entropy single-use codes (5 bytes -> 10 hex chars, e.g. "A1B2C-D3E4F").
function generateRecoveryCodes(): string[] {
  return Array.from({ length: recoveryCodeCount }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-F0-9]/g, '');
}

async function assertCorrectPassword(user: User, currentPassword: string): Promise<void> {
  // These TOTP routes don't run through the express-validator schema pipeline (pre-existing
  // pattern - see routes/index.ts), so a missing/non-string field must be handled here rather
  // than assumed away by the DTO type; bcrypt.compare throws on a non-string input otherwise.
  if (!currentPassword || typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, user.password))) {
    throw new HttpError(401, 'Incorrect password');
  }
}

export const totpService = {
  getLoginResponse(user: User | undefined): AuthLoginResponse {
    if (!user) {
      return { user: null, requiresTotp: false };
    }

    if (user.totpEnabled) {
      return { user: null, requiresTotp: true, userId: user.id };
    }

    return { user: withoutTotpSecrets(user), requiresTotp: false, userId: user.id };
  },

  async beginSetup(userId: string): Promise<TotpSetupResponse> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer, label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    await userRepository.update(user.id, { pendingTotpSecret: encryptSecret(secret) });

    return { userId: user.id, otpauthUrl, qrCodeDataUrl };
  },

  async verifySetup(
    userId: string,
    token: string,
    currentPassword: string,
    context?: AuditContext
  ): Promise<TotpSetupVerifiedResponse> {
    const user = await userRepository.findById(userId);
    if (!user || !user.pendingTotpSecret) {
      throw new HttpError(404, 'TOTP setup was not started for this user');
    }

    await assertCorrectPassword(user, currentPassword);

    const result = verifySync({ token, secret: decryptSecret(user.pendingTotpSecret) });
    if (!result.valid) {
      throw new HttpError(400, 'Invalid authenticator code');
    }

    const recoveryCodes = generateRecoveryCodes();
    // Hash the normalized form (matches what verifyRecoveryCode compares against), not the
    // dashed display format - the dash is presentation-only.
    const recoveryCodeHashes = await Promise.all(recoveryCodes.map((code) => hashPassword(normalizeRecoveryCode(code))));

    const updated = await userRepository.update(user.id, {
      totpSecret: user.pendingTotpSecret,
      pendingTotpSecret: undefined,
      totpEnabled: true,
      recoveryCodeHashes
    });

    void auditService.record('mfa.enabled', `${user.name} enabled two-factor authentication.`, auditActor(user), user.id, context);

    return { user: withoutTotpSecrets(updated || user), recoveryCodes };
  },

  async verifyLogin(userId: string, token: string, context?: AuditContext): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user || !user.totpSecret || !user.totpEnabled) {
      throw new HttpError(404, 'TOTP is not enabled for this user');
    }

    const result = verifySync({ token, secret: decryptSecret(user.totpSecret) });
    if (!result.valid) {
      void auditService.record('mfa.verify_failed', `${user.name} entered an invalid authenticator code.`, auditActor(user), user.id, context);
      throw new HttpError(400, 'Invalid authenticator code');
    }

    return withoutTotpSecrets(user);
  },

  async verifyRecoveryCode(userId: string, recoveryCode: string, context?: AuditContext): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user || !user.totpEnabled || !user.recoveryCodeHashes?.length || typeof recoveryCode !== 'string' || !recoveryCode) {
      throw new HttpError(400, 'Invalid or already used recovery code');
    }

    const normalizedCode = normalizeRecoveryCode(recoveryCode);
    const matchResults = await Promise.all(
      user.recoveryCodeHashes.map((hash) => verifyPassword(normalizedCode, hash))
    );
    const matchedIndex = matchResults.indexOf(true);
    if (matchedIndex === -1) {
      void auditService.record('mfa.verify_failed', `${user.name} entered an invalid recovery code.`, auditActor(user), user.id, context);
      throw new HttpError(400, 'Invalid or already used recovery code');
    }

    const remainingHashes = user.recoveryCodeHashes.filter((_, index) => index !== matchedIndex);
    const updated = await userRepository.update(user.id, { recoveryCodeHashes: remainingHashes });

    void auditService.record(
      'mfa.recovery_used',
      `${user.name} logged in using a two-factor recovery code (${remainingHashes.length} remaining).`,
      auditActor(user),
      user.id,
      context
    );

    return withoutTotpSecrets(updated || user);
  },

  async disable(userId: string, currentPassword: string, context?: AuditContext): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    await assertCorrectPassword(user, currentPassword);

    const updated = await userRepository.update(user.id, {
      totpSecret: undefined,
      pendingTotpSecret: undefined,
      totpEnabled: false,
      recoveryCodeHashes: undefined,
      // Invalidate every session issued before this disable, including a stolen one. The
      // controller reissues a fresh session for this caller after this returns.
      sessionVersion: (user.sessionVersion ?? 0) + 1
    });

    void auditService.record('mfa.disabled', `${user.name} disabled two-factor authentication.`, auditActor(user), user.id, context);

    return withoutTotpSecrets(updated || user);
  }
};
