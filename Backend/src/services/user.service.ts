import { userRepository } from '../repositories/user.repository.js';
import type { CreateUserDto } from '../dtos/user.dto.js';
import { HttpError } from '../errors/http-error.js';
import type { User } from '../types/index.js';

function withoutPrivateFields(user: User): User {
  const { password, totpSecret, pendingTotpSecret, ...safeUser } = user;
  return safeUser;
}

export const userService = {
  async getUsers(): Promise<User[]> {
    const users = await userRepository.findAll();
    return users.map(withoutPrivateFields);
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    return userRepository.findByEmail(email);
  },

  async createUser(input: CreateUserDto): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (!email || !input.password) {
      throw new HttpError(400, 'Email and password are required');
    }

    if (await userRepository.findByEmail(email)) {
      throw new HttpError(409, 'An account with this email already exists');
    }

    const user = await userRepository.create({
      id: `U-${Date.now().toString().slice(-5)}`,
      name: input.name.trim() || 'New Student',
      studentId: input.studentId?.trim(),
      role: input.role,
      email,
      password: input.password,
      phone: input.phone.trim(),
      building: input.building,
      room: input.room.trim(),
      status: 'Active',
      totpEnabled: false
    });

    return withoutPrivateFields(user);
  },

  async findOrCreateGoogleUser(input: { name: string; email: string }): Promise<User> {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      throw new HttpError(400, 'Google account did not provide an email address');
    }

    const existing = await userRepository.findByEmail(email);
    if (existing) {
      return withoutPrivateFields(existing);
    }

    const user = await userRepository.create({
      id: `U-${Date.now().toString().slice(-5)}`,
      name: input.name.trim() || email.split('@')[0],
      role: 'Student',
      email,
      password: `google:${Date.now()}`,
      phone: '',
      building: 'Maple Hall',
      room: '-',
      status: 'Active',
      totpEnabled: false
    });

    return withoutPrivateFields(user);
  }
};
