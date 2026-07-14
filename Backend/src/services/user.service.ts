//User Service
//Handles user business logic: creation, retrieval, password validation,
//and sensitive data filtering

import { userRepository } from '../repositories/user.repository.js';
import type { CreateUserDto } from '../dtos/user.dto.js';
import { HttpError } from '../errors/http-error.js';
import { hashPassword, validatePasswordStrength } from './password.service.js';
import type { User } from '../types/index.js';

function withoutPrivateFields(user: User): User {
  const { password, failedLoginAttempts, lockedUntil, totpSecret, pendingTotpSecret, ...safeUser } = user;
  return safeUser;
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
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw new HttpError(400, 'Email and password are required');
    }

    // Validate password meets all requirements
    const passwordValidation = validatePasswordStrength(input.password, email);
    if (!passwordValidation.valid) {
      throw new HttpError(400, passwordValidation.errors.join(' '));
    }

    // Check email not already registered
    if (await userRepository.findByEmail(email)) {
      throw new HttpError(409, 'An account with this email already exists');
    }

    // Create new user with hashed password
    const user = await userRepository.create({
      id: `U-${Date.now().toString().slice(-5)}`,
      name: input.name.trim() || 'New Student',
      studentId: input.studentId?.trim(),
      role: input.role,
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
};
