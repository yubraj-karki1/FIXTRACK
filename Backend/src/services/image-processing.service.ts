// Image Processing Service
// Re-encodes every accepted upload with Sharp before it is ever written to disk. This:
//   - Strips EXIF/ICC/IPTC metadata (GPS tags, camera info, embedded comments) because Sharp's
//     output methods omit metadata unless .withMetadata() is explicitly called - it is not.
//   - Discards anything in the original file that is not valid pixel data, since the output
//     is built fresh from the decoded image - polyglot files (e.g. an image with an appended
//     PHP payload) cannot survive re-encoding.
//   - Normalizes the format to a small, predictable set (JPEG or WebP) regardless of what
//     was uploaded, closing off format-specific parser exploits in downstream consumers.

import sharp from 'sharp';
import { OUTPUT_EXTENSION_BY_FORMAT } from '../config/upload.config.js';
import { HttpError } from '../errors/http-error.js';

export interface ProcessedImage {
  buffer: Buffer;
  extension: string;
  mimeType: 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
}

const jpegQuality = 85;
const webpQuality = 85;

export async function reencodeImage(buffer: Buffer): Promise<ProcessedImage> {
  try {
    const pipeline = sharp(buffer, { failOn: 'error' });
    const metadata = await pipeline.metadata();

    // Transparency only survives in WebP; everything else is normalized to JPEG so the
    // server only ever stores two well-understood, broadly compatible output formats.
    const useWebp = Boolean(metadata.hasAlpha);

    const output = useWebp
      ? await pipeline.webp({ quality: webpQuality }).toBuffer({ resolveWithObject: true })
      : await pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer({ resolveWithObject: true });

    return {
      buffer: output.data,
      extension: useWebp ? OUTPUT_EXTENSION_BY_FORMAT.webp : OUTPUT_EXTENSION_BY_FORMAT.jpeg,
      mimeType: useWebp ? 'image/webp' : 'image/jpeg',
      width: output.info.width,
      height: output.info.height
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Never leak Sharp's internal error text (can include library paths) to the client.
    throw new HttpError(400, 'The uploaded image could not be processed. Please try a different file.');
  }
}
