import type { UserRole } from '../types/index.js';

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  phone: string;
  building: string;
  room: string;
  studentId?: string;
}

/** Input accepted only by the authenticated administrator user-creation route. */
export interface CreatePrivilegedUserDto extends CreateUserDto {
  role: Exclude<UserRole, 'Student'>;
}

export interface UpdateProfileDto {
  name: string;
  phone: string;
  building: string;
  room: string;
}

export interface AdminUpdateUserDto {
  role?: UserRole;
  status?: 'Active' | 'Inactive';
}
