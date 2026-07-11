import { userRepository } from '../repositories/user.repository.js';
import { HttpError } from '../errors/http-error.js';
import { hashPassword, isPasswordHash, verifyPassword } from './password.service.js';
import type { User } from '../types/index.js';

export const authService = {
  async validateLogin(email: string, password: string): Promise<User> {
    const user = await userRepository.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.password))) {
      throw new HttpError(401, 'Invalid email or password');
    }

    if (user.status !== 'Active') {
      throw new HttpError(403, 'This account is inactive');
    }

    if (!isPasswordHash(user.password)) {
      await userRepository.update(user.id, { password: await hashPassword(password) });
    }

    return user;
  }
};
