import type { UserRole } from '../types/index.js';

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: UserRole;
  building: string;
  room: string;
  studentId?: string;
}
