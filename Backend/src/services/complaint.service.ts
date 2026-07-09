import { HttpError } from '../errors/http-error.js';
import { complaintRepository } from '../repositories/complaint.repository.js';
import type { Complaint } from '../types/index.js';

export const complaintService = {
  async getComplaints(): Promise<Complaint[]> {
    return complaintRepository.findAll();
  },

  async getComplaintById(id: string): Promise<Complaint> {
    const complaint = await complaintRepository.findById(id);
    if (!complaint) {
      throw new HttpError(404, 'Complaint not found');
    }
    return complaint;
  }
};
