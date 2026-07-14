import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { HttpError } from '../errors/http-error.js';
import { userRepository } from '../repositories/user.repository.js';
import type { AuthLoginResponse, TotpSetupResponse, User } from '../types/index.js';
import { decryptSecret, encryptSecret } from './secret-encryption.service.js';

const issuer = 'FixTrack';

function withoutTotpSecrets(user: User): User {
  const { password, failedLoginAttempts, lockedUntil, totpSecret, pendingTotpSecret, ...safeUser } = user;
  return safeUser;
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

  async verifySetup(userId: string, token: string): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user || !user.pendingTotpSecret) {
      throw new HttpError(404, 'TOTP setup was not started for this user');
    }

    const result = verifySync({ token, secret: decryptSecret(user.pendingTotpSecret) });
    if (!result.valid) {
      throw new HttpError(400, 'Invalid authenticator code');
    }

    const updated = await userRepository.update(user.id, {
      totpSecret: user.pendingTotpSecret,
      pendingTotpSecret: undefined,
      totpEnabled: true
    });

    return withoutTotpSecrets(updated || user);
  },

  async verifyLogin(userId: string, token: string): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user || !user.totpSecret || !user.totpEnabled) {
      throw new HttpError(404, 'TOTP is not enabled for this user');
    }

    const result = verifySync({ token, secret: decryptSecret(user.totpSecret) });
    if (!result.valid) {
      throw new HttpError(400, 'Invalid authenticator code');
    }

    return withoutTotpSecrets(user);
  },

  async disable(userId: string): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    const updated = await userRepository.update(user.id, {
      totpSecret: undefined,
      pendingTotpSecret: undefined,
      totpEnabled: false
    });

    return withoutTotpSecrets(updated || user);
  }
};
