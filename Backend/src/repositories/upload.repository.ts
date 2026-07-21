import { mongo } from '../database/index.js';
import type { UploadRecord } from '../types/index.js';

// Used only when MongoDB is not configured (local/demo mode), mirroring audit.repository.ts.
const fallbackUploads: UploadRecord[] = [];

export const uploadRepository = {
  async create(record: UploadRecord): Promise<UploadRecord> {
    if (mongo.isConnected) {
      await mongo.uploads().insertOne(record);
      return record;
    }

    fallbackUploads.push(record);
    return record;
  },

  async findById(id: string): Promise<UploadRecord | undefined> {
    if (mongo.isConnected) {
      const record = await mongo.uploads().findOne({ id }, { projection: { _id: 0 } });
      return record || undefined;
    }

    return fallbackUploads.find((record) => record.id === id);
  },

  /** The previous upload for a resource is looked up before being replaced, so its file can be deleted. */
  async findByResource(resourceType: UploadRecord['resourceType'], resourceId: string): Promise<UploadRecord | undefined> {
    if (mongo.isConnected) {
      const record = await mongo
        .uploads()
        .findOne({ resourceType, resourceId }, { projection: { _id: 0 }, sort: { createdAt: -1 } });
      return record || undefined;
    }

    return fallbackUploads
      .filter((record) => record.resourceType === resourceType && record.resourceId === resourceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  },

  async deleteById(id: string): Promise<void> {
    if (mongo.isConnected) {
      await mongo.uploads().deleteOne({ id });
      return;
    }

    const index = fallbackUploads.findIndex((record) => record.id === id);
    if (index !== -1) fallbackUploads.splice(index, 1);
  }
};
