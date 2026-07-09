import type { ServerResponse } from 'node:http';
import type { CreateUserDto } from '../dtos/user.dto.js';
import { userService } from '../services/user.service.js';
import { sendJson } from './response.js';
import type { User } from '../types/index.js';

export const userController = {
  async list(response: ServerResponse): Promise<void> {
    sendJson<User[]>(response, 200, { data: await userService.getUsers() });
  },

  async create(response: ServerResponse, body: CreateUserDto): Promise<void> {
    const user = await userService.createUser(body);
    sendJson<User>(response, 201, {
      data: user,
      message: 'Account created successfully'
    });
  }
};
