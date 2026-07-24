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
      // A field set to `undefined` (e.g. clearing staffUserId on unassign) must be $unset -
      // the MongoDB driver silently drops undefined values from $set, so without this split
      // an "unassign" update would validate and return 200 but never actually clear the field.
      const fieldsToSet = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined)) as Partial<Complaint>;
      const fieldsToUnset = Object.fromEntries(Object.entries(updates).filter(([, value]) => value === undefined).map(([key]) => [key, '' as const]));
      const update: UpdateFilter<Complaint> = {
        ...(Object.keys(fieldsToSet).length ? { $set: fieldsToSet } : {}),
        ...(Object.keys(fieldsToUnset).length ? { $unset: fieldsToUnset } : {})
      };
      await mongo.complaints().updateOne({ id }, update);
      return this.findById(id);
    }

    const complaint = database.complaints.find((item) => item.id === id);
    if (!complaint) return undefined;
    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined) {
        delete complaint[key as keyof Complaint];
        return;
      }

      Object.assign(complaint, { [key]: value });
    });
    saveComplaints();
    return complaint;
  }
};
