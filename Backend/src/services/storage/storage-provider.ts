// Storage Provider abstraction
// Lets the upload pipeline write/read/delete bytes without caring whether they live on the
// local disk or in a private S3 bucket. Selected once at startup via config.s3Enabled.

import type { Readable } from 'node:stream';

export interface StoredObjectAccess {
  /** Set when the provider streams bytes directly (local disk). */
  stream?: Readable;
  /** Set when the provider hands back a short-lived signed URL instead (S3). */
  redirectUrl?: string;
  mimeType: string;
}

export interface StorageProvider {
  /** Persists the already-validated, already-re-encoded buffer under a fresh UUID-derived key. Never overwrites an existing object. */
  save(buffer: Buffer, extension: string): Promise<{ storedFilename: string }>;
  /** Returns either a readable stream or a signed redirect URL for the given stored key. */
  getObject(storedFilename: string, mimeType: string): Promise<StoredObjectAccess>;
  remove(storedFilename: string): Promise<void>;
}
