import { OAuth2Client } from 'google-auth-library';
import { config } from '../config/index.js';
import { HttpError } from '../errors/http-error.js';
import { userService } from './user.service.js';
import type { User } from '../types/index.js';

const scopes = ['openid', 'email', 'profile'];

function getClient(): OAuth2Client {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new HttpError(500, 'Google login is not configured');
  }

  return new OAuth2Client(config.googleClientId, config.googleClientSecret, config.googleCallbackUrl);
}

export const googleAuthService = {
  getAuthUrl(): string {
    return getClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account',
      scope: scopes
    });
  },

  async verifyCallback(code: string): Promise<User> {
    if (!code) {
      throw new HttpError(400, 'Google authorization code is missing');
    }

    const client = getClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new HttpError(400, 'Google did not return an identity token');
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.googleClientId
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new HttpError(400, 'Google account did not provide an email address');
    }

    return userService.findOrCreateGoogleUser({
      name: payload.name || payload.email.split('@')[0],
      email: payload.email
    });
  }
};
