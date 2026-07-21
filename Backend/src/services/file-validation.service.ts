// File Validation Service
// Verifies that an uploaded buffer really is one of the allowed image types before it is
// ever re-encoded or written to disk. Two independent signals are required to agree:
//   1. The MIME type the client declared in the multipart request.
//   2. The file's magic number (binary signature), sniffed directly from the bytes.
// The original filename/extension is never trusted for this decision (OWASP File Upload
// Cheat Sheet: "do not rely on the Content-Type header or file extension").

import { fileTypeFromBuffer } from 'file-type';
import sharp, { type Metadata } from 'sharp';
import { config } from '../config/index.js';
import { ALLOWED_MIME_TYPES, ALLOWED_SNIFFED_MIME_TYPES, DANGEROUS_EXTENSIONS } from '../config/upload.config.js';
import { HttpError } from '../errors/http-error.js';

export interface ValidatedImage {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

// A single generic message for every rejection reason. The real reason is only ever logged
// server-side (see upload.service.ts) - never returned to the client (OWASP: no internal detail).
const genericRejection = 'The uploaded file could not be accepted. Please upload a JPEG, PNG, or WebP image under 5 MB.';

export function assertSafeOriginalName(originalName: string): void {
  if (DANGEROUS_EXTENSIONS.test(originalName)) {
    throw new HttpError(400, genericRejection);
  }
}

export function assertDeclaredMimeType(declaredMimeType: string): void {
  if (!ALLOWED_MIME_TYPES.includes(declaredMimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new HttpError(415, genericRejection);
  }
}

/**
 * Confirms the buffer's actual binary signature matches an allowed image type, and that it
 * agrees with what the client declared. A mismatch (e.g. an .exe renamed to photo.jpg, or a
 * polyglot file) is rejected outright - this is what stops content-type spoofing.
 */
export async function assertMagicNumberMatches(buffer: Buffer, declaredMimeType: string): Promise<string> {
  const sniffed = await fileTypeFromBuffer(buffer);

  if (!sniffed || !ALLOWED_SNIFFED_MIME_TYPES.has(sniffed.mime)) {
    throw new HttpError(400, genericRejection);
  }

  // image/jpeg has two accepted magic-number variants (JFIF/Exif) that file-type both
  // reports as "image/jpeg", so a straight equality check against the declared type is safe.
  if (sniffed.mime !== declaredMimeType) {
    throw new HttpError(400, genericRejection);
  }

  return sniffed.mime;
}

/**
 * Decodes the image with Sharp to confirm it is well-formed (not truncated/corrupted) and
 * within the maximum allowed pixel dimensions. Sharp fully parses the codec-level structure,
 * which catches malformed files that a magic-number check alone would miss.
 */
export async function assertDecodableAndWithinDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  let metadata: Metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).metadata();
  } catch {
    throw new HttpError(400, 'The uploaded image is corrupted or not a valid image file.');
  }

  const { width, height } = metadata;
  if (!width || !height) {
    throw new HttpError(400, 'The uploaded image is corrupted or not a valid image file.');
  }

  if (width > config.maxImageDimension || height > config.maxImageDimension) {
    throw new HttpError(
      400,
      `Image dimensions must not exceed ${config.maxImageDimension}x${config.maxImageDimension} pixels.`
    );
  }

  return { width, height };
}

/** Runs the full validation chain and returns the confirmed dimensions. Throws HttpError on any failure. */
export async function validateImageBuffer(buffer: Buffer, declaredMimeType: string, originalName: string): Promise<ValidatedImage> {
  assertSafeOriginalName(originalName);
  assertDeclaredMimeType(declaredMimeType);
  const confirmedMimeType = await assertMagicNumberMatches(buffer, declaredMimeType);
  const { width, height } = await assertDecodableAndWithinDimensions(buffer);

  return { buffer, mimeType: confirmedMimeType, width, height };
}
