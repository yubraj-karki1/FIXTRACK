import type { IncomingMessage, ServerResponse } from 'node:http';
import { applicationController } from '../controller/application.controller.js';
import { authController } from '../controller/auth.controller.js';
import { complaintController } from '../controller/complaint.controller.js';
import { sendJson } from '../controller/response.js';
import { userController } from '../controller/user.controller.js';
import type { LoginRequestDto, TotpSetupRequestDto, TotpVerifyRequestDto } from '../dtos/auth.dto.js';
import type { CreateUserDto } from '../dtos/user.dto.js';
import { HttpError } from '../errors/http-error.js';
import { readJsonBody } from './body.js';

export async function handleRoutes(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  try {
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      applicationController.health(response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/users') {
      await userController.list(response);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/users') {
      const body = await readJsonBody<CreateUserDto>(request);
      await userController.create(response, body);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/login') {
      const body = await readJsonBody<LoginRequestDto>(request);
      await authController.login(response, body);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/google') {
      authController.googleLogin(response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/google/callback') {
      await authController.googleCallback(response, url.searchParams.get('code') || '');
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/totp/setup') {
      const body = await readJsonBody<TotpSetupRequestDto>(request);
      await authController.setupTotp(response, body.userId);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/totp/verify-setup') {
      const body = await readJsonBody<TotpVerifyRequestDto>(request);
      await authController.verifyTotpSetup(response, body.userId, body.token);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/totp/verify-login') {
      const body = await readJsonBody<TotpVerifyRequestDto>(request);
      await authController.verifyTotpLogin(response, body.userId, body.token);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/totp/disable') {
      const body = await readJsonBody<TotpSetupRequestDto>(request);
      await authController.disableTotp(response, body.userId);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/complaints') {
      await complaintController.list(response);
      return;
    }

    const complaintMatch = url.pathname.match(/^\/api\/complaints\/([^/]+)$/);
    if (request.method === 'GET' && complaintMatch) {
      await complaintController.detail(response, complaintMatch[1]);
      return;
    }

    throw new HttpError(404, 'Route not found');
  } catch (error) {
    if (error instanceof HttpError) {
      if (request.method === 'GET' && url.pathname.startsWith('/api/auth/google')) {
        const redirectUrl = new URL('http://localhost:3000/login');
        redirectUrl.searchParams.set('googleError', error.message);
        response.writeHead(302, { Location: redirectUrl.toString() });
        response.end();
        return;
      }

      sendJson(response, error.statusCode, { data: null, message: error.message });
      return;
    }

    sendJson(response, 500, { data: null, message: 'Internal server error' });
  }
}
