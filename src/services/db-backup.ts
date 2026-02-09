// Auto-backup system to prevent data loss
// Runs on app start and periodically

import { logger } from './logger';

const BACKUP_KEY = 'indexeddb_backup';
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

interface BackupData {
  timestamp: number;
  version: number;
  stores: Record<string, any[]>;
}

/**
 * Create full backup of IndexedDB to localStorage
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
      
      // Backup each object store
      for (const storeName of Array.from(db.objectStoreNames)) {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          backup.stores[storeName] = getAllRequest.result;
          
          // Save to localStorage when all stores done
          if (Object.keys(backup.stores).length === db.objectStoreNames.length) {
            try {
              localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
              logger.info('Backup', 'IndexedDB backup created', {
                stores: Object.keys(backup.stores).length,
                size: JSON.stringify(backup).length,
              });
            } catch (err) {
              logger.error('Backup', 'Failed to save backup to localStorage', err);
              // Try to save to downloadable file instead
              downloadBackup(backup);
            }
          }
        };
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
 * Download backup as JSON file
 */
function downloadBackup(backup: BackupData): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `indexeddb-backup-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  URL.revokeObjectURL(url);
  
  logger.info('Backup', 'Backup downloaded as file');
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
    setTimeout(() => createBackup(), 5000); // Wait 5s after app start
  }
  
  // Backup before page unload (if data changed)
  window.addEventListener('beforeunload', () => {
    if (shouldBackup()) {
      createBackup();
    }
  });
}
