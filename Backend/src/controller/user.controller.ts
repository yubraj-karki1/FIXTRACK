
//User Controller
//Handles user management endpoints: list all users, create new accounts

import type { ServerResponse } from 'node:http';
import type { AdminUpdateUserDto, CreatePrivilegedUserDto, CreateUserDto, UpdateProfileDto } from '../dtos/user.dto.js';
import { userService } from '../services/user.service.js';
import { sessionService } from '../services/session.service.js';
import { sendJson } from './response.js';
import type { User } from '../types/index.js';

export const userController = {
 
  async list(response: ServerResponse): Promise<void> {
    sendJson<User[]>(response, 200, { data: await userService.getUsers() });
  },

  async detail(response: ServerResponse, userId: string): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, { data: await userService.getUserById(userId) });
  },

  async create(response: ServerResponse, body: CreateUserDto): Promise<void> {
    // The registration service validates and hashes the password before this point.
    const user = await userService.createUser(body);
    // Registration preserves the existing auto-login UX while creating a real session.
    sessionService.issueSession(response, user);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 201, {
      data: user,
      message: 'Account created successfully'
    });
  },

  async createPrivileged(response: ServerResponse, body: CreatePrivilegedUserDto, actor: User): Promise<void> {
    // Creating another user must not replace the administrator's current session.
    const user = await userService.createPrivilegedUser(body, actor);
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 201, {
      data: user,
      message: 'Privileged account created successfully'
    });
  },

  async updateProfile(response: ServerResponse, userId: string, body: UpdateProfileDto): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: await userService.updateProfile(userId, body),
      message: 'Profile updated successfully'
    });
  },

  async adminUpdate(response: ServerResponse, actor: User, userId: string, body: AdminUpdateUserDto): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: await userService.adminUpdateUser(actor, userId, body),
      message: 'User updated successfully'
    });
  }
};
