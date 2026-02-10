// Auto-backup system to prevent data loss
// Runs on app start and periodically
// Only backs up metadata — skips large binary blobs (base64 images, video data)

import { logger } from './logger';

const BACKUP_KEY = 'indexeddb_backup';
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKUP_SIZE = 4 * 1024 * 1024; // 4MB localStorage safety limit

interface BackupData {
  timestamp: number;
  version: number;
  stores: Record<string, any[]>;
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
 * Create full backup of IndexedDB to localStorage.
 * Large binary data is stripped to stay within localStorage limits.
 */
export async function createBackup(dbName: string = 'RAW_STUDIO_DB'): Promise<void> {
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

      if (storeNames.length === 0) {
        db.close();
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
              saveBackup(backup);
            }
          };

          getAllRequest.onerror = () => {
            logger.warn('Backup', `Failed to read store: ${storeName}`);
            completed++;
            if (completed === storeNames.length) {
              saveBackup(backup);
            }
          };
        } catch (err) {
          logger.warn('Backup', `Failed to open store: ${storeName}`, err);
          completed++;
          if (completed === storeNames.length) {
            saveBackup(backup);
          }
        }
      }

      db.close();
    };

    request.onerror = (err) => {
      logger.error('Backup', 'Failed to open DB for backup', err);
    };
  } catch (err) {
    logger.error('Backup', 'Backup failed', err);
  }
}

/**
 * Safely serialize and save backup to localStorage
 */
function saveBackup(backup: BackupData): void {
  try {
    const json = JSON.stringify(backup);

    if (json.length > MAX_BACKUP_SIZE) {
      logger.warn('Backup', `Backup too large for localStorage (${(json.length / 1024 / 1024).toFixed(1)}MB), skipping`);
      return;
    }

    localStorage.setItem(BACKUP_KEY, json);
    logger.info('Backup', 'IndexedDB backup created', {
      stores: Object.keys(backup.stores).length,
      size: `${(json.length / 1024).toFixed(0)}KB`,
    });
  } catch (err) {
    logger.warn('Backup', 'Failed to save backup to localStorage', err);
    // Don't try downloadBackup — if stringify failed, it'll fail there too
  }
}

/**
 * Restore backup from localStorage
 */
export async function restoreBackup(dbName: string = 'RAW_STUDIO_DB'): Promise<boolean> {
  try {
    const backupStr = localStorage.getItem(BACKUP_KEY);
    if (!backupStr) {
      logger.warn('Backup', 'No backup found');
      return false;
    }

    const backup: BackupData = JSON.parse(backupStr);

    const request = indexedDB.open(dbName);

    return new Promise((resolve) => {
      request.onsuccess = async () => {
        const db = request.result;

        let restored = 0;

        for (const [storeName, data] of Object.entries(backup.stores)) {
          if (!db.objectStoreNames.contains(storeName)) {
            logger.warn('Backup', `Store ${storeName} no longer exists, skipping`);
            continue;
          }

          const tx = db.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);

          for (const item of data) {
            try {
              await store.put(item);
              restored++;
            } catch (err) {
              logger.error('Backup', `Failed to restore item in ${storeName}`, err);
            }
          }
        }

        db.close();

        logger.info('Backup', 'Backup restored', { items: restored });
        resolve(true);
      };

      request.onerror = () => {
        logger.error('Backup', 'Failed to open DB for restore');
        resolve(false);
      };
    });
  } catch (err) {
    logger.error('Backup', 'Restore failed', err);
    return false;
  }
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
 * Auto-backup on app start if needed
 */
export function initAutoBackup(): void {
  if (shouldBackup()) {
    setTimeout(() => createBackup(), 5000);
  }

  window.addEventListener('beforeunload', () => {
    if (shouldBackup()) {
      createBackup();
    }
  });
}
