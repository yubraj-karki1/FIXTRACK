// Upload Middleware
// Wraps Multer for the raw Node http server used by this backend (see security.middleware.ts
// for the same pattern applied to Helmet). Multer only needs a readable-stream `req` and a
// callback - it has no hard dependency on Express - so it works unmodified here.
//
// Design choices, each mapped to an OWASP File Upload Cheat Sheet control:
//   - `memoryStorage`: nothing touches disk until the buffer has passed every validation,
//     scan, and re-encode step in upload.service.ts. There is no partial/invalid file to
//     clean up on failure because one is never written in the first place.
//   - `limits.fileSize`: busboy aborts the stream once the byte limit is exceeded, so an
//     oversized payload is rejected early instead of being buffered in full first.
//   - `limits.files`: exactly one file per request.
//   - `fileFilter`: a first, cheap rejection based on the client-declared MIME type and the
//     original filename's extension. This is defense in depth only - the authoritative check
//     is the magic-number + Sharp-decode validation in file-validation.service.ts, which runs
//     after this middleware on the buffered file.

import type { IncomingMessage, ServerResponse } from 'node:http';
import multer from 'multer';
import { config } from '../config/index.js';
import { ALLOWED_MIME_TYPES, DANGEROUS_EXTENSIONS, uploadLimits } from '../config/upload.config.js';
import { HttpError } from '../errors/http-error.js';

export interface UploadRequest extends IncomingMessage {
  file?: Express.Multer.File;
  body?: Record<string, string>;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: uploadLimits.maxFiles,
    fields: 1,
    fieldNameSize: uploadLimits.maxFieldNameSize,
    fieldSize: uploadLimits.maxFieldSize
  },
  fileFilter(_request, file, callback) {
    if (DANGEROUS_EXTENSIONS.test(file.originalname)) {
      callback(new HttpError(400, 'This file type is not allowed.'));
      return;
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as (typeof ALLOWED_MIME_TYPES)[number])) {
      callback(new HttpError(415, 'Only JPEG, PNG, or WebP images are allowed.'));
      return;
    }
    callback(null, true);
  }
});

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return new HttpError(413, `Image must be ${Math.floor(config.maxUploadBytes / (1024 * 1024))} MB or smaller.`);
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return new HttpError(400, 'Only a single image file is accepted.');
    }
    return new HttpError(400, 'The upload could not be processed.');
  }

  // Never leak the underlying (potentially path- or library-revealing) error message.
  return new HttpError(400, 'The upload could not be processed.');
}

/** Parses a single `fieldName` multipart file (plus any accompanying text fields) from the raw request. */
export function parseSingleUpload(fieldName: string) {
  const middleware = upload.single(fieldName);
  return (request: IncomingMessage, response: ServerResponse): Promise<UploadRequest> =>
    new Promise((resolve, reject) => {
      middleware(request as never, response as never, (error?: unknown) => {
        if (error) {
          reject(toHttpError(error));
          return;
        }
        resolve(request as UploadRequest);
      });
    });
}
