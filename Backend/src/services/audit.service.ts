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

// Shared shape for the optional request-derived detail (IP, user agent) attached to an event,
// alongside any event-specific metadata (see upload.service.ts for a pre-existing example).
export type AuditContext = Record<string, string | number>;

const maxListLimit = 200;
const defaultListLimit = 100;

export const auditService = {
  async record(type: AuditEventType, message: string, actor: Actor,
    targetId?: string, metadata?: AuditContext): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      type,
      message,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      targetId,
      createdAt: new Date().toISOString(),
      ...(metadata ? { metadata } : {})
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
