import type { ServerResponse } from 'node:http';
import { complaintService } from '../services/complaint.service.js';
import { sendJson } from './response.js';
import type { Complaint } from '../types/index.js';

export const complaintController = {
  async list(response: ServerResponse): Promise<void> {
    sendJson<Complaint[]>(response, 200, { data: await complaintService.getComplaints() });
  },

  async detail(response: ServerResponse, id: string): Promise<void> {
    sendJson<Complaint>(response, 200, { data: await complaintService.getComplaintById(id) });
  }
};
