
//User Controller
//Handles user management endpoints: list all users, create new accounts

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminUpdateUserDto, CreatePrivilegedUserDto, CreateUserDto, UpdateProfileDto } from '../dtos/user.dto.js';
import { getClientIp } from '../middlewares/rate-limit.middleware.js';
import { userService } from '../services/user.service.js';
import { sessionService } from '../services/session.service.js';
import { sendJson } from './response.js';
import type { Complaint, User } from '../types/index.js';

function requestContext(request: IncomingMessage): { ip: string; userAgent: string } {
  return { ip: getClientIp(request), userAgent: String(request.headers['user-agent'] || '') };
}

function csvEscape(value: string | number | undefined): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function complaintsToCsv(complaints: Complaint[]): string {
  const columns: Array<keyof Complaint> = ['id', 'title', 'category', 'priority', 'status', 'building', 'room', 'submitted', 'description'];
  const rows = complaints.map((complaint) => columns.map((column) => csvEscape(complaint[column] as string | number)).join(','));
  return [columns.join(','), ...rows].join('\n');
}

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

  async updateProfile(request: IncomingMessage, response: ServerResponse, userId: string, body: UpdateProfileDto): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: await userService.updateProfile(userId, body, requestContext(request)),
      message: 'Profile updated successfully'
    });
  },

  async exportData(request: IncomingMessage, response: ServerResponse, userId: string, format: 'json' | 'csv'): Promise<void> {
    const { profile, complaints } = await userService.exportUserData(userId, requestContext(request));
    response.setHeader('Cache-Control', 'no-store');

    if (format === 'csv') {
      response.writeHead(200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="fixtrack-export.csv"'
      });
      response.end(`Profile\nid,name,email,role,building,room\n${[profile.id, profile.name, profile.email, profile.role, profile.building, profile.room].map((value) => csvEscape(value)).join(',')}\n\nComplaints\n${complaintsToCsv(complaints)}`);
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="fixtrack-export.json"'
    });
    response.end(JSON.stringify({ profile, complaints }, null, 2));
  },

  async adminUpdate(response: ServerResponse, actor: User, userId: string, body: AdminUpdateUserDto): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    sendJson<User>(response, 200, {
      data: await userService.adminUpdateUser(actor, userId, body),
      message: 'User updated successfully'
    });
  }
};
