import { database, mongo } from '../database/index.js';
import type { Complaint } from '../types/index.js';

export const complaintRepository = {
  async findAll(): Promise<Complaint[]> {
    if (mongo.isConnected) {
      return mongo.complaints().find({}, { projection: { _id: 0 } }).toArray();
    }

    return database.complaints;
  },

  async findById(id: string): Promise<Complaint | undefined> {
    if (mongo.isConnected) {
      const complaint = await mongo.complaints().findOne({ id }, { projection: { _id: 0 } });
      return complaint || undefined;
    }

    return database.complaints.find((complaint) => complaint.id === id);
  }
};
