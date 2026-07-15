import { mongo } from '../database/index.js';
import type { AuditEvent } from '../types/index.js';

const fallbackLimit = 500;
const fallbackEvents: AuditEvent[] = [];

export const auditRepository = {
  async create(event: AuditEvent): Promise<void> {
    if (mongo.isConnected) {
      await mongo.auditEvents().insertOne(event);
      return;
    }

    fallbackEvents.unshift(event);
    fallbackEvents.length = Math.min(fallbackEvents.length, fallbackLimit);
  },

  async findRecent(limit: number): Promise<AuditEvent[]> {
    if (mongo.isConnected) {
      return mongo.auditEvents().find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray();
    }

    return fallbackEvents.slice(0, limit);
  }
};
