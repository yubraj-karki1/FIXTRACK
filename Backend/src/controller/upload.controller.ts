// Upload Controller
// Thin HTTP layer over upload.service: parses the multipart request, enforces per-user
// concurrency limits, delegates authorization to the owning domain service (user/complaint),
// and streams file bytes back only after re-checking authorization against the DB record.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { sanitizeCaption } from '../dtos/upload.dto.js';
import { HttpError } from '../errors/http-error.js';
import { acquireUploadSlot, getClientIp, releaseUploadSlot } from '../middlewares/rate-limit.middleware.js';
import { parseSingleUpload } from '../middlewares/upload.middleware.js';
import { canAccessComplaint, complaintService } from '../services/complaint.service.js';
import { storageProvider } from '../services/storage/index.js';
import { logUploadRejected, uploadService } from '../services/upload.service.js';
import { userService } from '../services/user.service.js';
import type { UploadResourceType, User } from '../types/index.js';
import { sendJson } from './response.js';

async function withUploadSlot<T>(userId: string, action: () => Promise<T>): Promise<T> {
  acquireUploadSlot(userId);
  try {
    return await action();
  } finally {
    releaseUploadSlot(userId);
  }
}

/**
 * Runs the multipart parse step and logs an upload.rejected audit event on failure - this
 * covers rejections Multer's own fileFilter/size-limit produces (disallowed MIME type,
 * dangerous filename, oversized payload) before upload.service.processAndStore ever runs,
 * so every rejected attempt is recorded, not only ones that reached the validation pipeline.
 */
async function parseOrLogRejection(
  parse: () => ReturnType<ReturnType<typeof parseSingleUpload>>,
  context: { actor: User; resourceType: UploadResourceType; resourceId: string; ip: string }
): ReturnType<ReturnType<typeof parseSingleUpload>> {
  try {
    return await parse();
  } catch (error) {
    const reason = error instanceof HttpError ? error.message : 'unexpected server error';
    await logUploadRejected({ ...context, sizeBytes: 0, mimeType: 'unknown' }, reason);
    throw error;
  }
}

export const uploadController = {
  async uploadAvatar(request: IncomingMessage, response: ServerResponse, actor: User): Promise<void> {
    await withUploadSlot(actor.id, async () => {
      const parsed = await parseOrLogRejection(() => parseSingleUpload('avatar')(request, response), {
        actor,
        resourceType: 'profile',
        resourceId: actor.id,
        ip: getClientIp(request)
      });
      if (!parsed.file) throw new HttpError(400, 'An image file is required.');

      const record = await uploadService.processAndStore({
        buffer: parsed.file.buffer,
        declaredMimeType: parsed.file.mimetype,
        originalName: parsed.file.originalname,
        resourceType: 'profile',
        resourceId: actor.id,
        actor,
        ip: getClientIp(request)
      });

      const updatedUser = await userService.setAvatarUpload(actor.id, record.id);
      response.setHeader('Cache-Control', 'no-store');
      sendJson<User>(response, 200, { data: updatedUser, message: 'Profile image updated successfully' });
    });
  },

  async uploadComplaintImage(request: IncomingMessage, response: ServerResponse, actor: User, complaintId: string): Promise<void> {
    // Authorize before ever touching the multipart stream, so a user with no rights to this
    // complaint cannot even spend server resources decoding/scanning a file for it.
    await complaintService.assertCanReplaceImage(complaintId, actor);

    await withUploadSlot(actor.id, async () => {
      const parsed = await parseOrLogRejection(() => parseSingleUpload('image')(request, response), {
        actor,
        resourceType: 'complaint',
        resourceId: complaintId,
        ip: getClientIp(request)
      });
      if (!parsed.file) throw new HttpError(400, 'An image file is required.');
      const caption = sanitizeCaption(parsed.body?.caption);

      const record = await uploadService.processAndStore({
        buffer: parsed.file.buffer,
        declaredMimeType: parsed.file.mimetype,
        originalName: parsed.file.originalname,
        resourceType: 'complaint',
        resourceId: complaintId,
        caption,
        actor,
        ip: getClientIp(request)
      });

      const updated = await complaintService.attachImage(complaintId, record.id, `/api/uploads/${record.id}`, caption);
      response.setHeader('Cache-Control', 'no-store');
      sendJson(response, 200, { data: updated, message: 'Complaint image updated successfully' });
    });
  },

  /** Streams a stored file's bytes, or redirects to a signed URL for the S3 backend - only after re-verifying access. */
  async streamUpload(response: ServerResponse, uploadId: string, actor: User): Promise<void> {
    const record = await uploadService.getForAuthorizedAccess(uploadId);

    if (record.resourceType === 'profile') {
      if (actor.id !== record.resourceId && actor.role !== 'Administrator') {
        // 404, not 403: do not confirm that an upload id belongs to some other user.
        throw new HttpError(404, 'File not found.');
      }
    } else {
      // Complaint image access follows the exact same rules as viewing the complaint itself.
      const complaint = await complaintService.getComplaintById(record.resourceId, actor);
      if (!canAccessComplaint(actor, complaint)) throw new HttpError(404, 'File not found.');
    }

    const access = await storageProvider.getObject(record.storedFilename, record.mimeType);

    if (access.redirectUrl) {
      response.writeHead(302, { Location: access.redirectUrl, 'Cache-Control': 'private, no-store' });
      response.end();
      return;
    }

    response.writeHead(200, {
      'Content-Type': access.mimeType,
      'Content-Length': record.sizeBytes,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline'
    });

    access.stream!.on('error', () => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
    access.stream!.pipe(response);
  }
};
