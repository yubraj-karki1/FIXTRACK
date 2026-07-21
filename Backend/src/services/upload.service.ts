// Upload Service
// Orchestrates the full secure pipeline for a single image upload, in order:
//   1. Allow-list + magic-number + decodability + dimension validation (file-validation.service).
//   2. Malware scan of the original bytes (malware-scan.service).
//   3. Re-encode with Sharp - strips metadata, normalizes format (image-processing.service).
//   4. Write to private storage under a fresh UUID name (services/storage).
//   5. Persist metadata and audit-log the outcome.
//
// Nothing is written to disk/S3 until every check above has passed, so there is no partial
// or invalid file to clean up on failure - the failure path is simply "throw before step 4".

import { randomUUID } from 'node:crypto';
import { HttpError } from '../errors/http-error.js';
import { uploadRepository } from '../repositories/upload.repository.js';
import { storageProvider } from './storage/index.js';
import { validateImageBuffer } from './file-validation.service.js';
import { reencodeImage } from './image-processing.service.js';
import { scanBufferForMalware } from './malware-scan.service.js';
import { auditService } from './audit.service.js';
import type { UploadRecord, UploadResourceType, User } from '../types/index.js';

export interface UploadRequestInput {
  buffer: Buffer;
  declaredMimeType: string;
  originalName: string;
  resourceType: UploadResourceType;
  resourceId: string;
  caption?: string;
  actor: User;
  ip: string;
}

function auditActor(user: User): { id: string; name: string; role: User['role'] } {
  return { id: user.id, name: user.name, role: user.role };
}

interface RejectionContext {
  actor: User;
  resourceType: UploadResourceType;
  resourceId: string;
  ip: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Logs an upload.rejected event. Exported separately from processAndStore so
 * upload.controller.ts can also log a request that never made it past Multer's own
 * fileFilter/size-limit rejection (e.g. a disallowed MIME type or a dangerous filename) -
 * every rejected attempt is recorded, not just ones that reached the validation pipeline.
 */
export async function logUploadRejected(context: RejectionContext, reason: string): Promise<void> {
  void auditService.record(
    'upload.rejected',
    `${context.actor.name} attempted to upload an image for ${context.resourceType} ${context.resourceId}: ${reason}.`,
    auditActor(context.actor),
    context.resourceId,
    { ip: context.ip, sizeBytes: context.sizeBytes, mimeType: context.mimeType, result: 'failure' }
  );
}

async function logOutcome(
  input: UploadRequestInput,
  result: 'success' | 'failure',
  reason: string
): Promise<void> {
  void auditService.record(
    result === 'success' ? 'upload.succeeded' : 'upload.rejected',
    `${input.actor.name} ${result === 'success' ? 'uploaded' : 'attempted to upload'} an image for ${input.resourceType} ${input.resourceId}: ${reason}.`,
    auditActor(input.actor),
    input.resourceId,
    {
      ip: input.ip,
      sizeBytes: input.buffer.length,
      mimeType: input.declaredMimeType,
      result
    }
  );
}

/** Deletes the file backing a resource's previous upload record, if any, once it has been superseded. */
async function cleanupPreviousUpload(resourceType: UploadResourceType, resourceId: string): Promise<void> {
  const previous = await uploadRepository.findByResource(resourceType, resourceId);
  if (!previous) return;

  try {
    await storageProvider.remove(previous.storedFilename);
  } catch (error) {
    // Losing the ability to delete an orphaned file is not worth failing the new upload over.
    console.error('Failed to remove superseded upload file:', error);
  }
  await uploadRepository.deleteById(previous.id);
}

export const uploadService = {
  async processAndStore(input: UploadRequestInput): Promise<UploadRecord> {
    try {
      await validateImageBuffer(input.buffer, input.declaredMimeType, input.originalName);
      await scanBufferForMalware(input.buffer);
      const processed = await reencodeImage(input.buffer);

      const { storedFilename } = await storageProvider.save(processed.buffer, processed.extension);

      const record: UploadRecord = {
        id: randomUUID(),
        ownerUserId: input.actor.id,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        storedFilename,
        mimeType: processed.mimeType,
        sizeBytes: processed.buffer.length,
        width: processed.width,
        height: processed.height,
        caption: input.caption,
        createdAt: new Date().toISOString()
      };

      await cleanupPreviousUpload(input.resourceType, input.resourceId);
      await uploadRepository.create(record);
      await logOutcome(input, 'success', 'validated, scanned, and stored');

      return record;
    } catch (error) {
      const reason = error instanceof HttpError ? error.message : 'unexpected server error';
      await logOutcome(input, 'failure', reason);
      throw error;
    }
  },

  async getForAuthorizedAccess(uploadId: string): Promise<UploadRecord> {
    const record = await uploadRepository.findById(uploadId);
    if (!record) throw new HttpError(404, 'File not found.');
    return record;
  }
};
