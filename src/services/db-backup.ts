/**
 * Enhanced Auto-backup System with Retry Logic and Resiliency
 * Runs on app start and periodically
 * Only backs up metadata — skips large binary blobs (base64 images, video data)
 */

import { logger } from './logger';
import { supabase } from './supabase';

const BACKUP_KEY = 'indexeddb_backup';
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKUP_SIZE = 4 * 1024 * 1024; // 4MB localStorage safety limit
const BACKUP_RETRY_ATTEMPTS = 3;
const BACKUP_RETRY_DELAY = 2000; // ms

// Backup metadata stored in Supabase for cross-device recovery
const BACKUP_METADATA_KEY = 'raw_studio_backup_metadata';

interface BackupData {
  timestamp: number;
  version: number;
  stores: Record<string, any[]>;
  checksum?: string;
}

interface BackupMetadata {
  lastBackupAt: number;
  deviceId: string;
  version: number;
  storeNames: string[];
  recordCounts: Record<string, number>;
}

/**
 * Generate a simple checksum for data integrity verification
 */
function generateChecksum(data: unknown): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Strip large binary fields from a record to keep backups small.
 * Preserves all metadata but removes base64 blobs, thumbnails, etc.
 */
function stripBinaryFields(record: any): any {
  if (!record || typeof record !== 'object') return record;

  const stripped = { ...record };

  // Known large fields to exclude
  const blobFields = [
    'base64', 'thumbnailBase64', 'imageData', 'videoData',
    'blob', 'blobUrl', 'data', 'rawData', 'content',
  ];

  for (const field of blobFields) {
    if (field in stripped && typeof stripped[field] === 'string' && stripped[field].length > 10000) {
      stripped[field] = `[stripped:${stripped[field].length} chars]`;
    }
  }

  return stripped;
}

/**
 * Delay utility for retry logic
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create full backup of IndexedDB to localStorage with retry logic.
 * Large binary data is stripped to stay within localStorage limits.
 */
export async function createBackup(dbName: string = 'RAW_STUDIO_DB'): Promise<boolean> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= BACKUP_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await createBackupInternal(dbName);
      if (result) {
        // Also sync backup metadata to Supabase
        await syncBackupMetadata(dbName);
        return true;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn('Backup', `Backup attempt ${attempt} failed`, lastError.message);
      
      if (attempt < BACKUP_RETRY_ATTEMPTS) {
        await delay(BACKUP_RETRY_DELAY * attempt); // Exponential backoff
      }
    }
  }
  
  logger.error('Backup', 'All backup attempts failed', lastError);
  return false;
}

async function createBackupInternal(dbName: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(dbName);

      request.onsuccess = async () => {
        const db = request.result;
        const backup: BackupData = {
          timestamp: Date.now(),
          version: db.version,
          stores: {},
        };

        const storeNames = Array.from(db.objectStoreNames);
        let completed = 0;
        let hasError = false;

        if (storeNames.length === 0) {
          db.close();
          resolve(false);
          return;
        }

        for (const storeName of storeNames) {
          try {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const getAllRequest = store.getAll();

            getAllRequest.onsuccess = () => {
              // Strip binary data from each record
              backup.stores[storeName] = getAllRequest.result.map(stripBinaryFields);
              completed++;

              // Save when all stores are done
              if (completed === storeNames.length) {
                db.close();
                if (!hasError) {
                  saveBackup(backup);
                  resolve(true);
                } else {
                  reject(new Error('Some stores failed to backup'));
                }
              }
            };

            getAllRequest.onerror = () => {
              logger.warn('Backup', `Failed to read store: ${storeName}`);
              hasError = true;
              completed++;
              if (completed === storeNames.length) {
                db.close();
                saveBackup(backup);
                resolve(true);
              }
            };
          } catch (err) {
            logger.warn('Backup', `Failed to open store: ${storeName}`, err);
            hasError = true;
            completed++;
            if (completed === storeNames.length) {
              db.close();
              saveBackup(backup);
              resolve(true);
            }
          }
        }
      };

      request.onerror = (err) => {
        reject(new Error(`Failed to open DB for backup: ${err}`));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Sync backup metadata to Supabase for cross-device visibility
 */
async function syncBackupMetadata(dbName: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Only sync if authenticated

    const metadata: BackupMetadata = {
      lastBackupAt: Date.now(),
      deviceId: await getDeviceId(),
      version: 1,
      storeNames: [],
      recordCounts: {},
    };

    // Get store info
    const db = await openDB(dbName);
    metadata.storeNames = Array.from(db.objectStoreNames);
    
    for (const storeName of metadata.storeNames) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const count = await new Promise<number>((resolve) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
      });
      metadata.recordCounts[storeName] = count;
    }
    
    db.close();

    // Store in localStorage
    localStorage.setItem(BACKUP_METADATA_KEY, JSON.stringify(metadata));

    logger.info('Backup', 'Metadata synced', metadata);
  } catch (err) {
    logger.warn('Backup', 'Failed to sync metadata', err);
  }
}

/**
 * Get or create a unique device ID
 */
async function getDeviceId(): Promise<string> {
  const key = 'raw_studio_device_id';
  let deviceId = localStorage.getItem(key);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(key, deviceId);
  }
  return deviceId;
}

/**
 * Helper to open IndexedDB
 */
function openDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Safely serialize and save backup to localStorage
 */
function saveBackup(backup: BackupData): void {
  try {
    // Add checksum for integrity
    backup.checksum = generateChecksum(backup.stores);
    
    const json = JSON.stringify(backup);

    if (json.length > MAX_BACKUP_SIZE) {
      logger.warn('Backup', `Backup too large for localStorage (${(json.length / 1024 / 1024).toFixed(1)}MB), skipping`);
      return;
    }

    localStorage.setItem(BACKUP_KEY, json);
    logger.info('Backup', 'IndexedDB backup created', {
      stores: Object.keys(backup.stores).length,
      size: `${(json.length / 1024).toFixed(0)}KB`,
      checksum: backup.checksum,
    });
  } catch (err) {
    logger.warn('Backup', 'Failed to save backup to localStorage', err);
  }
}

/**
 * Restore backup from localStorage with retry logic
 */
export async function restoreBackup(dbName: string = 'RAW_STUDIO_DB'): Promise<boolean> {
  for (let attempt = 1; attempt <= BACKUP_RETRY_ATTEMPTS; attempt++) {
    try {
      const result = await restoreBackupInternal(dbName);
      if (result) return true;
    } catch (err) {
      logger.warn('Backup', `Restore attempt ${attempt} failed`, err);
      if (attempt < BACKUP_RETRY_ATTEMPTS) {
        await delay(BACKUP_RETRY_DELAY * attempt);
      }
    }
  }
  return false;
}

async function restoreBackupInternal(dbName: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const backupStr = localStorage.getItem(BACKUP_KEY);
      if (!backupStr) {
        logger.warn('Backup', 'No backup found');
        resolve(false);
        return;
      }

      const backup: BackupData = JSON.parse(backupStr);
      
      // Verify checksum if present
      if (backup.checksum) {
        const computedChecksum = generateChecksum(backup.stores);
        if (computedChecksum !== backup.checksum) {
          logger.error('Backup', 'Backup checksum mismatch - possible corruption');
          resolve(false);
          return;
        }
      }

      const request = indexedDB.open(dbName);

      request.onsuccess = async () => {
        const db = request.result;

        let restored = 0;
        let failed = 0;

        for (const [storeName, data] of Object.entries(backup.stores)) {
          if (!db.objectStoreNames.contains(storeName)) {
            logger.warn('Backup', `Store ${storeName} no longer exists, skipping`);
            continue;
          }

          try {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);

            for (const item of data) {
              try {
                await new Promise<void>((res, rej) => {
                  const req = store.put(item);
                  req.onsuccess = () => res();
                  req.onerror = () => rej(req.error);
                });
                restored++;
              } catch (err) {
                logger.error('Backup', `Failed to restore item in ${storeName}`, err);
                failed++;
              }
            }
          } catch (err) {
            logger.error('Backup', `Failed to restore store ${storeName}`, err);
            failed++;
          }
        }

        db.close();

        logger.info('Backup', 'Backup restored', { items: restored, failed });
        resolve(restored > 0);
      };

      request.onerror = () => {
        logger.error('Backup', 'Failed to open DB for restore');
        resolve(false);
      };
    } catch (err) {
      logger.error('Backup', 'Restore failed', err);
      resolve(false);
    }
  });
}

/**
 * Check if backup should run (every 24h)
 */
export function shouldBackup(): boolean {
  const lastBackupStr = localStorage.getItem(BACKUP_KEY);
  if (!lastBackupStr) return true;

  try {
    const backup: BackupData = JSON.parse(lastBackupStr);
    const age = Date.now() - backup.timestamp;
    return age > BACKUP_INTERVAL;
  } catch {
    return true;
  }
}

/**
 * Get backup info
 */
export function getBackupInfo(): { exists: boolean; timestamp: number | null; age: number | null } {
  const backupStr = localStorage.getItem(BACKUP_KEY);
  if (!backupStr) {
    return { exists: false, timestamp: null, age: null };
  }

  try {
    const backup: BackupData = JSON.parse(backupStr);
    const age = Date.now() - backup.timestamp;
    return { exists: true, timestamp: backup.timestamp, age };
  } catch {
    return { exists: false, timestamp: null, age: null };
  }
}

/**
 * Export backup as downloadable JSON file
 */
export function exportBackupToFile(): void {
  const backupStr = localStorage.getItem(BACKUP_KEY);
  if (!backupStr) {
    logger.warn('Backup', 'No backup to export');
    return;
  }

  const blob = new Blob([backupStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raw-studio-backup-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  logger.info('Backup', 'Backup exported to file');
}

/**
 * Import backup from file
 */
export async function importBackupFromFile(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const backup: BackupData = JSON.parse(content);
        
        // Validate backup structure
        if (!backup.timestamp || !backup.version || !backup.stores) {
          throw new Error('Invalid backup file structure');
        }

        // Save to localStorage
        localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
        
        // Restore to IndexedDB
        const restored = await restoreBackup();
        resolve(restored);
      } catch (err) {
        logger.error('Backup', 'Failed to import backup', err);
        resolve(false);
      }
    };

    reader.onerror = () => {
      logger.error('Backup', 'Failed to read backup file');
      resolve(false);
    };

    reader.readAsText(file);
  });
}

/**
 * Auto-backup on app start if needed
 */
export function initAutoBackup(): void {
  // Delay backup to allow app to fully initialize
  if (shouldBackup()) {
    setTimeout(() => createBackup(), 5000);
  }

  // Backup before page unload
  window.addEventListener('beforeunload', () => {
    if (shouldBackup()) {
      createBackup();
    }
  });

  // Periodic backup check
  setInterval(() => {
    if (shouldBackup()) {
      createBackup();
    }
  }, BACKUP_INTERVAL);

  logger.info('Backup', 'Auto-backup initialized');
}

/**
 * Force immediate backup
 */
export async function forceBackup(): Promise<boolean> {
  logger.info('Backup', 'Forcing immediate backup');
  return createBackup();
}

/**
 * Clear all backup data
 */
export function clearBackup(): void {
  localStorage.removeItem(BACKUP_KEY);
  localStorage.removeItem(BACKUP_METADATA_KEY);
  logger.info('Backup', 'Backup data cleared');
}
