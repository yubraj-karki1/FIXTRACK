// Local Disk Storage Provider
// Default storage backend. Files live in config.uploadDir, a directory that:
//   - Sits outside the project's src/dist trees and is never registered as static content,
//     so there is no URL under which a filename could ever be requested directly.
//   - Is created with restrictive permissions and only ever receives server-generated
//     UUID filenames - the client-supplied original filename is discarded entirely.

import { createReadStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve, sep } from 'node:path';
import { config } from '../../config/index.js';
import { HttpError } from '../../errors/http-error.js';
import type { StorageProvider, StoredObjectAccess } from './storage-provider.js';

const uploadRoot = config.uploadDir;
let rootReady: Promise<void> | null = null;

async function ensureRoot(): Promise<void> {
  if (!rootReady) {
    rootReady = mkdir(uploadRoot, { recursive: true, mode: 0o750 }).then(() => undefined);
  }
  await rootReady;
}

/**
 * Resolves a stored filename against the upload root and verifies the result is still
 * inside that root. Defends against path traversal even though every caller in this
 * codebase only ever passes server-generated UUID names, never client input directly.
 */
function resolveConfined(storedFilename: string): string {
  const resolvedRoot = resolve(uploadRoot) + sep;
  const resolvedPath = resolve(uploadRoot, storedFilename);
  if (!resolvedPath.startsWith(resolvedRoot)) {
    throw new HttpError(400, 'Invalid file reference.');
  }
  return resolvedPath;
}

export const localStorageProvider: StorageProvider = {
  async save(buffer: Buffer, extension: string): Promise<{ storedFilename: string }> {
    await ensureRoot();

    // A handful of retries covers the astronomically unlikely case of a UUID collision;
    // the 'wx' open flag is what actually guarantees an existing file is never overwritten.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const storedFilename = `${randomUUID()}${extension}`;
      const fullPath = resolveConfined(storedFilename);

      try {
        const handle = await open(fullPath, 'wx', 0o640);
        try {
          await handle.writeFile(buffer);
        } finally {
          await handle.close();
        }
        return { storedFilename };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw error;
      }
    }

    throw new HttpError(500, 'Unable to store the uploaded file. Please try again.');
  },

  async getObject(storedFilename: string, mimeType: string): Promise<StoredObjectAccess> {
    const fullPath = resolveConfined(storedFilename);
    try {
      await stat(fullPath);
    } catch {
      throw new HttpError(404, 'File not found.');
    }
    return { stream: createReadStream(fullPath), mimeType };
  },

  async remove(storedFilename: string): Promise<void> {
    const fullPath = resolveConfined(storedFilename);
    await rm(fullPath, { force: true });
  }
};

// Exported for tests / diagnostics only - not used by request handling.
export function _uploadRootPath(): string {
  return join(uploadRoot);
}
