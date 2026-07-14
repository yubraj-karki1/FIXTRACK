//User Service
//Handles user business logic: creation, retrieval, password validation,
//and sensitive data filtering

import { userRepository } from '../repositories/user.repository.js';
import type { AdminUpdateUserDto, CreatePrivilegedUserDto, CreateUserDto, UpdateProfileDto } from '../dtos/user.dto.js';
import { HttpError } from '../errors/http-error.js';
import { hashPassword, validatePasswordStrength } from './password.service.js';
import type { User, UserRole } from '../types/index.js';

function withoutPrivateFields(user: User): User {
  const { password, failedLoginAttempts, lockedUntil, totpSecret, pendingTotpSecret, ...safeUser } = user;
  return safeUser;
}

async function createUserWithRole(input: CreateUserDto, role: UserRole): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    throw new HttpError(400, 'Email and password are required');
  }

  const passwordValidation = validatePasswordStrength(input.password, email);
  if (!passwordValidation.valid) {
    throw new HttpError(400, passwordValidation.errors.join(' '));
  }

  if (await userRepository.findByEmail(email)) {
    throw new HttpError(409, 'An account with this email already exists');
  }

  const user = await userRepository.create({
    id: `U-${Date.now().toString().slice(-5)}`,
    name: input.name.trim() || (role === 'Student' ? 'New Student' : 'New User'),
    studentId: input.studentId?.trim(),
    role,
    email,
    password: await hashPassword(input.password),
    phone: input.phone.trim(),
    building: input.building,
    room: input.room.trim(),
    status: 'Active',
    totpEnabled: false
  });

  return withoutPrivateFields(user);
}

export const userService = {
  async getUsers(): Promise<User[]> {
    const users = await userRepository.findAll();
    return users.map(withoutPrivateFields);
  },

// Finds user by email address
//Used internally for login validation and duplicate checking
   
  async getUserByEmail(email: string): Promise<User | undefined> {
    return userRepository.findByEmail(email);
  },

  async createUser(input: CreateUserDto): Promise<User> {
    // This is the only service used by public registration. Client-supplied roles are ignored.
    return createUserWithRole(input, 'Student');
  },

  async createPrivilegedUser(input: CreatePrivilegedUserDto): Promise<User> {
    // Route-level session and Administrator checks are required before this method is called.
    return createUserWithRole(input, input.role);
  },

  async updateProfile(userId: string, input: UpdateProfileDto): Promise<User> {
    const updated = await userRepository.update(userId, {
      name: input.name.trim(),
      phone: input.phone.trim(),
      building: input.building.trim(),
      room: input.room.trim()
    });
    if (!updated) throw new HttpError(404, 'User not found');
    return withoutPrivateFields(updated);
  },

  async adminUpdateUser(actorId: string, userId: string, input: AdminUpdateUserDto): Promise<User> {
    if (actorId === userId && (input.role !== undefined || input.status === 'Inactive')) {
      throw new HttpError(400, 'Administrators cannot change their own role or deactivate their own account');
    }
    if (input.role === undefined && input.status === undefined) {
      throw new HttpError(400, 'A role or account status update is required');
    }

    const updated = await userRepository.update(userId, {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    });
    if (!updated) throw new HttpError(404, 'User not found');
    return withoutPrivateFields(updated);
  }
};
