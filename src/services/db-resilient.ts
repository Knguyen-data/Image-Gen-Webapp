/**
 * Resilient Database Operations Service
 * Wraps IndexedDB operations with retry logic, offline queueing, and conflict resolution
 * Ensures data integrity even during network issues or storage failures
 */

import { logger } from './logger';
import { getSyncService, type SyncEntityType, type SyncOperation } from './supabase-sync-service';
import type { Run } from '../types';

// Operation types for queue
interface QueuedOperation {
  id: string;
  type: 'save' | 'delete' | 'update';
  store: string;
  data: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  resolve: (value: boolean) => void;
  reject: (reason: Error) => void;
}

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 500, // ms
  OFFLINE_QUEUE_KEY: 'raw_studio_offline_queue',
  DB_NAME: 'RAW_STUDIO_DB',
  STORE_NAME: 'runs',
};

// In-memory operation queue for offline support
let operationQueue: QueuedOperation[] = [];
let isProcessingQueue = false;
let dbConnection: IDBDatabase | null = null;

/**
 * Initialize the resilient DB service
 */
export function initResilientDB(): void {
  loadOfflineQueue();
  setupNetworkListeners();
  logger.info('ResilientDB', 'Initialized');
}

/**
 * Setup network state listeners
 */
function setupNetworkListeners(): void {
  window.addEventListener('online', () => {
    logger.info('ResilientDB', 'Back online, processing queued operations');
    processOfflineQueue();
  });
}

/**
 * Load queued operations from localStorage
 */
function loadOfflineQueue(): void {
  try {
    const stored = localStorage.getItem(CONFIG.OFFLINE_QUEUE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Note: We can't restore promise callbacks, so we just log these
      logger.info('ResilientDB', `Loaded ${parsed.length} queued operations from storage`);
    }
  } catch (err) {
    logger.warn('ResilientDB', 'Failed to load offline queue', err);
  }
}

/**
 * Save queued operations to localStorage
 */
function saveOfflineQueue(): void {
  try {
    // Only save serializable data (without promise callbacks)
    const serializable = operationQueue.map(op => ({
      id: op.id,
      type: op.type,
      store: op.store,
      data: op.data,
      timestamp: op.timestamp,
      retryCount: op.retryCount,
      maxRetries: op.maxRetries,
    }));
    localStorage.setItem(CONFIG.OFFLINE_QUEUE_KEY, JSON.stringify(serializable));
  } catch (err) {
    logger.warn('ResilientDB', 'Failed to save offline queue', err);
  }
}

/**
 * Get database connection with retry
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbConnection) return dbConnection;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CONFIG.DB_NAME);

    request.onsuccess = () => {
      dbConnection = request.result;
      
      // Handle connection closing
      dbConnection.onclose = () => {
        dbConnection = null;
      };
      
      resolve(dbConnection);
    };

    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
        db.createObjectStore(CONFIG.STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

/**
 * Execute operation with retry logic
 */
async function executeWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = CONFIG.MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      if (attempt < maxRetries) {
        const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
        logger.warn('ResilientDB', `${operationName} attempt ${attempt} failed, retrying in ${delay}ms`, lastError.message);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if error is recoverable
 */
function isRecoverableError(error: unknown): boolean {
  if (error instanceof DOMException) {
    // Quota exceeded is not recoverable with retry
    if (error.name === 'QuotaExceededError') return false;
    // Version errors need DB reset, not retry
    if (error.name === 'VersionError') return false;
    // Transaction inactive might be transient
    if (error.name === 'TransactionInactiveError') return true;
  }
  // Network errors are recoverable
  if (error instanceof TypeError && String(error).includes('network')) return true;
  
  return true;
}

/**
 * Resilient save operation
 */
export async function resilientSaveRun(run: Run): Promise<boolean> {
  return executeWithRetry(async () => {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(CONFIG.STORE_NAME, 'readwrite');
        const store = tx.objectStore(CONFIG.STORE_NAME);
        const request = store.put(run);

        request.onsuccess = () => {
          logger.debug('ResilientDB', `Saved run ${run.id}`);
          
          // Queue for Supabase sync
          try {
            const syncService = getSyncService();
            syncService.enqueue('runs', 'create', run.id, run);
          } catch (err) {
            logger.warn('ResilientDB', 'Failed to queue for sync', err);
          }
          
          resolve(true);
        };

        request.onerror = () => reject(request.error);
        
        tx.onerror = () => reject(tx.error);
      } catch (err) {
        reject(err);
      }
    });
  }, 'Save run');
}

/**
 * Resilient delete operation
 */
export async function resilientDeleteRun(id: string): Promise<boolean> {
  return executeWithRetry(async () => {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(CONFIG.STORE_NAME, 'readwrite');
        const store = tx.objectStore(CONFIG.STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => {
          logger.debug('ResilientDB', `Deleted run ${id}`);
          
          // Queue for Supabase sync
          try {
            const syncService = getSyncService();
            syncService.enqueue('runs', 'delete', id, { id });
          } catch (err) {
            logger.warn('ResilientDB', 'Failed to queue delete for sync', err);
          }
          
          resolve(true);
        };

        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }, 'Delete run');
}

/**
 * Resilient get all runs
 */
export async function resilientGetAllRuns(): Promise<Run[]> {
  return executeWithRetry(async () => {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(CONFIG.STORE_NAME, 'readonly');
        const store = tx.objectStore(CONFIG.STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
          const results = request.result as Run[];
          results.sort((a, b) => b.createdAt - a.createdAt);
          resolve(results);
        };

        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }, 'Get all runs');
}

/**
 * Resilient get single run
 */
export async function resilientGetRun(id: string): Promise<Run | null> {
  return executeWithRetry(async () => {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction(CONFIG.STORE_NAME, 'readonly');
        const store = tx.objectStore(CONFIG.STORE_NAME);
        const request = store.get(id);

        request.onsuccess = () => {
          resolve(request.result as Run || null);
        };

        request.onerror = () => reject(request.error);
      } catch (err) {
        reject(err);
      }
    });
  }, 'Get run');
}

/**
 * Process offline operation queue
 */
async function processOfflineQueue(): Promise<void> {
  if (isProcessingQueue || operationQueue.length === 0) return;
  
  isProcessingQueue = true;
  logger.info('ResilientDB', `Processing ${operationQueue.length} queued operations`);

  const failed: QueuedOperation[] = [];

  for (const op of operationQueue) {
    try {
      switch (op.type) {
        case 'save':
          await resilientSaveRun(op.data as Run);
          break;
        case 'delete':
          await resilientDeleteRun((op.data as { id: string }).id);
          break;
      }
      op.resolve(true);
    } catch (err) {
      op.retryCount++;
      if (op.retryCount < op.maxRetries) {
        failed.push(op);
      } else {
        op.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  operationQueue = failed;
  saveOfflineQueue();
  isProcessingQueue = false;

  if (failed.length > 0) {
    logger.warn('ResilientDB', `${failed.length} operations still failing`);
  }
}

/**
 * Queue operation for offline processing
 */
function queueOperation(
  type: 'save' | 'delete',
  data: unknown
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const op: QueuedOperation = {
      id: crypto.randomUUID(),
      type,
      store: CONFIG.STORE_NAME,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: CONFIG.MAX_RETRIES,
      resolve,
      reject,
    };

    operationQueue.push(op);
    saveOfflineQueue();
    
    logger.info('ResilientDB', `Queued ${type} operation for offline processing`);
  });
}

/**
 * Bulk save with transaction safety
 */
export async function resilientBulkSave(runs: Run[]): Promise<{ success: number; failed: number }> {
  const db = await getDB();
  
  return new Promise((resolve) => {
    const tx = db.transaction(CONFIG.STORE_NAME, 'readwrite');
    let success = 0;
    let failed = 0;
    let completed = 0;

    for (const run of runs) {
      const request = tx.objectStore(CONFIG.STORE_NAME).put(run);
      
      request.onsuccess = () => {
        success++;
        completed++;
        if (completed === runs.length) {
          resolve({ success, failed });
        }
      };
      
      request.onerror = () => {
        failed++;
        completed++;
        if (completed === runs.length) {
          resolve({ success, failed });
        }
      };
    }

    tx.onerror = () => {
      logger.error('ResilientDB', 'Bulk save transaction failed');
      resolve({ success, failed: runs.length - success });
    };
  });
}

/**
 * Verify data integrity
 */
export async function verifyDataIntegrity(): Promise<{
  healthy: boolean;
  issues: string[];
  totalRecords: number;
}> {
  const issues: string[] = [];
  
  try {
    const runs = await resilientGetAllRuns();
    
    // Check for corrupted records
    let corruptedCount = 0;
    for (const run of runs) {
      if (!run.id || !run.createdAt) {
        corruptedCount++;
      }
    }
    
    if (corruptedCount > 0) {
      issues.push(`${corruptedCount} corrupted records found`);
    }
    
    return {
      healthy: corruptedCount === 0,
      issues,
      totalRecords: runs.length,
    };
  } catch (err) {
    return {
      healthy: false,
      issues: [`Failed to verify: ${err}`],
      totalRecords: 0,
    };
  }
}

/**
 * Repair corrupted data
 */
export async function repairData(): Promise<{ repaired: number; removed: number }> {
  let repaired = 0;
  let removed = 0;
  
  try {
    const runs = await resilientGetAllRuns();
    
    for (const run of runs) {
      let needsUpdate = false;
      
      // Fix missing ID
      if (!run.id) {
        run.id = crypto.randomUUID();
        needsUpdate = true;
      }
      
      // Fix missing createdAt
      if (!run.createdAt) {
        run.createdAt = Date.now();
        needsUpdate = true;
      }
      
      // Fix missing images array
      if (!run.images) {
        run.images = [];
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await resilientSaveRun(run);
        repaired++;
      }
    }
    
    logger.info('ResilientDB', `Repaired ${repaired} records, removed ${removed}`);
    return { repaired, removed };
  } catch (err) {
    logger.error('ResilientDB', 'Repair failed', err);
    return { repaired, removed };
  }
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
  runs: number;
  estimatedSize: string;
  quota?: { used: number; total: number };
}> {
  const runs = await resilientGetAllRuns();
  
  // Estimate size (rough calculation)
  const sample = JSON.stringify(runs.slice(0, 10));
  const avgSize = sample.length / Math.min(runs.length, 10);
  const estimatedBytes = runs.length * avgSize;
  
  let quotaInfo;
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      quotaInfo = {
        used: estimate.usage || 0,
        total: estimate.quota || 0,
      };
    } catch {
      // Ignore
    }
  }
  
  return {
    runs: runs.length,
    estimatedSize: `${(estimatedBytes / 1024 / 1024).toFixed(2)} MB`,
    quota: quotaInfo,
  };
}

/**
 * Clear all data (use with caution!)
 */
export async function clearAllData(): Promise<boolean> {
  try {
    const db = await getDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CONFIG.STORE_NAME, 'readwrite');
      const store = tx.objectStore(CONFIG.STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        logger.info('ResilientDB', 'All data cleared');
        resolve(true);
      };

      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    logger.error('ResilientDB', 'Clear failed', err);
    return false;
  }
}

// Export service object
export const resilientDB = {
  init: initResilientDB,
  saveRun: resilientSaveRun,
  deleteRun: resilientDeleteRun,
  getAllRuns: resilientGetAllRuns,
  getRun: resilientGetRun,
  bulkSave: resilientBulkSave,
  verifyIntegrity: verifyDataIntegrity,
  repair: repairData,
  getStats: getStorageStats,
  clearAll: clearAllData,
};

export default resilientDB;
