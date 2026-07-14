import type { UpdateFilter } from 'mongodb';
import { database, mongo, saveComplaints } from '../database/index.js';
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
  },

  async create(complaint: Complaint): Promise<Complaint> {
    if (mongo.isConnected) {
      await mongo.complaints().insertOne(complaint);
      return complaint;
    }

    database.complaints.push(complaint);
    saveComplaints();
    return complaint;
  },

  async update(id: string, updates: Partial<Complaint>): Promise<Complaint | undefined> {
    if (mongo.isConnected) {
      const update: UpdateFilter<Complaint> = { $set: updates };
      await mongo.complaints().updateOne({ id }, update);
      return this.findById(id);
    }

    const complaint = database.complaints.find((item) => item.id === id);
    if (!complaint) return undefined;
    Object.assign(complaint, updates);
    saveComplaints();
    return complaint;
  }
};
