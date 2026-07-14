import type { IncomingMessage } from 'node:http';
import { HttpError } from '../errors/http-error.js';
import { sessionService } from '../services/session.service.js';
import type { User, UserRole } from '../types/index.js';

export async function requireAuthenticatedUser(request: IncomingMessage): Promise<User> {
  return sessionService.getAuthenticatedUser(request);
}

export async function requireRole(request: IncomingMessage, ...allowedRoles: UserRole[]): Promise<User> {
  const user = await requireAuthenticatedUser(request);
  if (!allowedRoles.includes(user.role)) {
    throw new HttpError(403, `${allowedRoles.join(' or ')} access required`);
  }
  return user;
}
