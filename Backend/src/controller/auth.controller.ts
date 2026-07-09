import type { ServerResponse } from 'node:http';
import { config } from '../config/index.js';
import { authService } from '../services/auth.service.js';
import { googleAuthService } from '../services/google-auth.service.js';
import { totpService } from '../services/totp.service.js';
import { sendJson } from './response.js';
import type { LoginRequestDto } from '../dtos/auth.dto.js';
import type { AuthLoginResponse, TotpSetupResponse, User } from '../types/index.js';

export const authController = {
  googleLogin(response: ServerResponse): void {
    response.writeHead(302, { Location: googleAuthService.getAuthUrl() });
    response.end();
  },

  async googleCallback(response: ServerResponse, code: string): Promise<void> {
    const user = await googleAuthService.verifyCallback(code);
    const encodedUser = Buffer.from(JSON.stringify(user)).toString('base64url');
    const redirectUrl = new URL(config.googleSuccessRedirect);
    redirectUrl.searchParams.set('googleUser', encodedUser);
    redirectUrl.searchParams.set('next', '/student');

    response.writeHead(302, { Location: redirectUrl.toString() });
    response.end();
  },

  async login(response: ServerResponse, credentials: LoginRequestDto): Promise<void> {
    const user = await authService.validateLogin(credentials.email, credentials.password);
    const loginResponse = totpService.getLoginResponse(user);
    sendJson<AuthLoginResponse>(response, 200, {
      data: loginResponse,
      message: loginResponse.requiresTotp ? 'Two-factor authentication required' : 'Logged in successfully'
    });
  },

  async setupTotp(response: ServerResponse, userId: string): Promise<void> {
    const setup = await totpService.beginSetup(userId);
    sendJson<TotpSetupResponse>(response, 200, {
      data: setup,
      message: 'Scan this QR code with your authenticator app'
    });
  },

  async verifyTotpSetup(response: ServerResponse, userId: string, token: string): Promise<void> {
    const user = await totpService.verifySetup(userId, token);
    sendJson<User>(response, 200, {
      data: user,
      message: 'Two-factor authentication enabled'
    });
  },

  async verifyTotpLogin(response: ServerResponse, userId: string, token: string): Promise<void> {
    const user = await totpService.verifyLogin(userId, token);
    sendJson<User>(response, 200, {
      data: user,
      message: 'Two-factor authentication verified'
    });
  },

  async disableTotp(response: ServerResponse, userId: string): Promise<void> {
    const user = await totpService.disable(userId);
    sendJson<User>(response, 200, {
      data: user,
      message: 'Two-factor authentication disabled'
    });
  }
};
