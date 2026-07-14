import type { ServerResponse } from 'node:http';
import type { CreateComplaintDto, UpdateComplaintDto } from '../dtos/complaint.dto.js';
import { complaintService } from '../services/complaint.service.js';
import type { Complaint, User } from '../types/index.js';
import { sendJson } from './response.js';

export const complaintController = {
  async list(response: ServerResponse, user: User): Promise<void> {
    response.setHeader('Cache-Control', 'private, no-store');
    sendJson<Complaint[]>(response, 200, { data: await complaintService.getComplaints(user) });
  },

  async detail(response: ServerResponse, id: string, user: User): Promise<void> {
    response.setHeader('Cache-Control', 'private, no-store');
    sendJson<Complaint>(response, 200, { data: await complaintService.getComplaintById(id, user) });
  },

  async create(response: ServerResponse, body: CreateComplaintDto, user: User): Promise<void> {
    sendJson<Complaint>(response, 201, {
      data: await complaintService.createComplaint(body, user),
      message: 'Complaint submitted successfully'
    });
  },

  async update(response: ServerResponse, id: string, body: UpdateComplaintDto, user: User): Promise<void> {
    sendJson<Complaint>(response, 200, {
      data: await complaintService.updateComplaint(id, body, user),
      message: 'Complaint updated successfully'
    });
  }
};
