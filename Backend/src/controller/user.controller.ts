
//User Controller
//Handles user management endpoints: list all users, create new accounts

import type { ServerResponse } from 'node:http';
import type { CreateUserDto } from '../dtos/user.dto.js';
import { userService } from '../services/user.service.js';
import { sessionService } from '../services/session.service.js';
import { sendJson } from './response.js';
import type { User } from '../types/index.js';

export const userController = {
 
  async list(response: ServerResponse): Promise<void> {
    sendJson<User[]>(response, 200, { data: await userService.getUsers() });
  },

  async create(response: ServerResponse, body: CreateUserDto): Promise<void> {
    // The registration service validates and hashes the password before this point.
    const user = await userService.createUser(body);
    // Registration preserves the existing auto-login UX while creating a real session.
    sessionService.issueSession(response, user.id);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 201, {
      data: user,
      message: 'Account created successfully'
    });
  }
};
