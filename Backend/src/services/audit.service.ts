// Audit Service
// Records a best-effort activity trail (logins, registrations, complaint and user
// management actions) for the admin activity log. Never blocks or fails the action
// it is recording for.

import { randomUUID } from 'node:crypto';
import { auditRepository } from '../repositories/audit.repository.js';
import type { AuditEvent, AuditEventType, User } from '../types/index.js';

interface Actor {
  id?: string;
  name: string;
  role?: User['role'];
}

const maxListLimit = 200;
const defaultListLimit = 100;

export const auditService = {
  async record(type: AuditEventType, message: string, actor: Actor, 
    targetId?: string): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      type,
      message,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      targetId,
      createdAt: new Date().toISOString()
    };

    try {
      await auditRepository.create(event);
    } catch (error) {
      console.error('Failed to record audit event:', error);
    }
  },

  async list(limit = defaultListLimit): Promise<AuditEvent[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || defaultListLimit, 1), maxListLimit);
    return auditRepository.findRecent(boundedLimit);
  }
};
