//User Service
//Handles user business logic: creation, retrieval, password validation,
//and sensitive data filtering

import { userRepository } from '../repositories/user.repository.js';
import { complaintRepository } from '../repositories/complaint.repository.js';
import type { AdminUpdateUserDto, CreatePrivilegedUserDto, CreateUserDto, UpdateProfileDto } from '../dtos/user.dto.js';
import { HttpError } from '../errors/http-error.js';
import { auditService, type AuditContext } from './audit.service.js';
import { hashPassword, validatePasswordStrength } from './password.service.js';
import type { Complaint, User, UserRole } from '../types/index.js';

function withoutPrivateFields(user: User): User {
  const {
    password,
    failedLoginAttempts,
    lockedUntil,
    totpSecret,
    pendingTotpSecret,
    passwordResetCodeHash,
    passwordResetExpiresAt,
    passwordResetAttempts,
    passwordHistory,
    ...safeUser
  } = user;
  return {
    ...safeUser,
    // The file itself is only ever reachable through the authenticated streaming route.
    avatarUrl: safeUser.avatarUploadId ? `/api/uploads/${safeUser.avatarUploadId}` : undefined
  };
}

async function createUserWithRole(input: CreateUserDto, role: UserRole): Promise<User> {
  const email = input.email.trim().toLowerCase();
  if (!email || !input.password) {
    throw new HttpError(400, 'Email and password are required');
  }

  const passwordValidation = validatePasswordStrength(input.password, email, input.name);
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
    passwordChangedAt: new Date().toISOString(),
    phone: input.phone.trim(),
    building: input.building,
    room: input.room.trim(),
    status: 'Active',
    totpEnabled: false
  });

  return withoutPrivateFields(user);
}

function roleLabel(role: UserRole): string {
  return role === 'Maintenance Staff' ? 'a Maintenance Staff' : `an ${role}`;
}

export const userService = {
  async getUsers(): Promise<User[]> {
    const users = await userRepository.findAll();
    return users.map(withoutPrivateFields);
  },

  async getUserById(userId: string): Promise<User> {
    const user = await userRepository.findById(userId);
    if (!user) throw new HttpError(404, 'User not found');
    return withoutPrivateFields(user);
  },

// Finds user by email address
//Used internally for login validation and duplicate checking
   
  async getUserByEmail(email: string): Promise<User | undefined> {
    return userRepository.findByEmail(email);
  },

  async createUser(input: CreateUserDto): Promise<User> {
    // This is the only service used by public registration. Client-supplied roles are ignored.
    const user = await createUserWithRole(input, 'Student');
    void auditService.record('user.registered', `${user.name} registered as a Student.`, { id: user.id, name: user.name, role: user.role }, user.id);
    return user;
  },

  async createPrivilegedUser(input: CreatePrivilegedUserDto, actor: User): Promise<User> {
    // Route-level session and Administrator checks are required before this method is called.
    const user = await createUserWithRole(input, input.role);
    void auditService.record(
      'user.privileged_created',
      `${actor.name} created ${roleLabel(user.role)} account for ${user.name}.`,
      { id: actor.id, name: actor.name, role: actor.role },
      user.id
    );
    return user;
  },

  async updateProfile(userId: string, input: UpdateProfileDto, context?: AuditContext): Promise<User> {
    const updated = await userRepository.update(userId, {
      name: input.name.trim(),
      phone: input.phone.trim(),
      building: input.building.trim(),
      room: input.room.trim()
    });
    if (!updated) throw new HttpError(404, 'User not found');
    void auditService.record(
      'user.profile_updated',
      `${updated.name} updated their profile.`,
      { id: updated.id, name: updated.name, role: updated.role },
      updated.id,
      context
    );
    return withoutPrivateFields(updated);
  },

  async adminUpdateUser(actor: User, userId: string, input: AdminUpdateUserDto): Promise<User> {
    if (actor.id === userId && (input.role !== undefined || input.status === 'Inactive')) {
      throw new HttpError(400, 'Administrators cannot change their own role or deactivate their own account');
    }
    if (input.role === undefined && input.status === undefined) {
      throw new HttpError(400, 'A role or account status update is required');
    }

    const target = await userRepository.findById(userId);
    if (!target) throw new HttpError(404, 'User not found');

    const updated = await userRepository.update(userId, {
      ...(input.role !== undefined
        // A role change alters what the account is authorized to do, so any session issued
        // under the old role must stop working immediately rather than at natural expiry.
        ? { role: input.role, sessionVersion: (target.sessionVersion ?? 0) + 1 }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {})
    });
    if (!updated) throw new HttpError(404, 'User not found');

    const auditActor = { id: actor.id, name: actor.name, role: actor.role };
    if (input.role !== undefined) {
      void auditService.record('user.role_changed', `${actor.name} changed ${updated.name}'s role to ${input.role}.`, auditActor, updated.id);
    }
    if (input.status !== undefined) {
      void auditService.record(
        'user.status_changed',
        `${actor.name} ${input.status === 'Active' ? 'activated' : 'deactivated'} ${updated.name}'s account.`,
        auditActor,
        updated.id
      );
    }

    return withoutPrivateFields(updated);
  },

  /** Called only after upload.service has fully validated, scanned, and stored the new file. */
  async setAvatarUpload(userId: string, uploadId: string): Promise<User> {
    const updated = await userRepository.update(userId, { avatarUploadId: uploadId });
    if (!updated) throw new HttpError(404, 'User not found');
    return withoutPrivateFields(updated);
  },

  /**
   * Self-service export of the caller's own data: their profile plus complaints they
   * personally filed. Deliberately filters by studentUserId directly rather than reusing
   * complaintService.getComplaints, which for a Staff/Admin caller returns complaints
   * assigned to or visible to them - the wrong scope for a "my data" export.
   */
  async exportUserData(userId: string, context?: AuditContext): Promise<{ profile: User; complaints: Complaint[] }> {
    const user = await userRepository.findById(userId);
    if (!user) throw new HttpError(404, 'User not found');

    const allComplaints = await complaintRepository.findAll();
    const ownComplaints = allComplaints.filter((complaint) => complaint.studentUserId === userId);

    void auditService.record(
      'user.data_exported',
      `${user.name} exported their personal data.`,
      { id: user.id, name: user.name, role: user.role },
      user.id,
      context
    );

    return { profile: withoutPrivateFields(user), complaints: ownComplaints };
  }
};
