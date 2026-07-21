// S3 Storage Provider (optional)
// Activated with UPLOAD_S3_ENABLED=true. Objects are written with a private ACL to a bucket
// that must have S3 Block Public Access enabled - nothing is ever exposed directly. Reads are
// served through short-lived, time-limited signed URLs (config.s3SignedUrlTtlSeconds) rather
// than public object URLs, so access still flows through this server's own authorization
// checks (see upload.controller.ts) before a client ever receives a link to the bytes.

import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/index.js';
import { HttpError } from '../../errors/http-error.js';
import type { StorageProvider, StoredObjectAccess } from './storage-provider.js';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({ region: config.s3Region });
  }
  return client;
}

export const s3StorageProvider: StorageProvider = {
  async save(buffer: Buffer, extension: string): Promise<{ storedFilename: string }> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const storedFilename = `${randomUUID()}${extension}`;

      try {
        await getClient().send(
          new PutObjectCommand({
            Bucket: config.s3Bucket,
            Key: storedFilename,
            Body: buffer,
            ACL: 'private',
            // Conditional write: refuses to overwrite an object that already exists at this key.
            IfNoneMatch: '*'
          })
        );
        return { storedFilename };
      } catch (error) {
        const name = (error as { name?: string }).name;
        if (name === 'PreconditionFailed') continue;
        throw error;
      }
    }

    throw new HttpError(500, 'Unable to store the uploaded file. Please try again.');
  },

  async getObject(storedFilename: string, mimeType: string): Promise<StoredObjectAccess> {
    const command = new GetObjectCommand({ Bucket: config.s3Bucket, Key: storedFilename });
    const redirectUrl = await getSignedUrl(getClient(), command, { expiresIn: config.s3SignedUrlTtlSeconds });
    return { redirectUrl, mimeType };
  },

  async remove(storedFilename: string): Promise<void> {
    await getClient().send(new DeleteObjectCommand({ Bucket: config.s3Bucket, Key: storedFilename }));
  }
};
