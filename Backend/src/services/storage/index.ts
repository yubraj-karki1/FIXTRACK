import { config } from '../../config/index.js';
import { localStorageProvider } from './local-storage.provider.js';
import { s3StorageProvider } from './s3-storage.provider.js';
import type { StorageProvider } from './storage-provider.js';

export const storageProvider: StorageProvider = config.s3Enabled ? s3StorageProvider : localStorageProvider;
export type { StorageProvider, StoredObjectAccess } from './storage-provider.js';
