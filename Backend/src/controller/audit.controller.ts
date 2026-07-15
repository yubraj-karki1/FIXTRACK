import type { ServerResponse } from 'node:http';
import { auditService } from '../services/audit.service.js';
import { sendJson } from './response.js';
import type { AuditEvent } from '../types/index.js';

export const auditController = {
  async list(response: ServerResponse, limit?: string): Promise<void> {
    response.setHeader('Cache-Control', 'no-store');
    const events = await auditService.list(limit ? Number(limit) : undefined);
    sendJson<AuditEvent[]>(response, 200, { data: events });
  }
};
