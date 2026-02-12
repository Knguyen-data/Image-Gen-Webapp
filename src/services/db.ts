import { Run } from "../types";

const DB_NAME = 'RAW_STUDIO_DB';
const STORE_NAME = 'runs';

// Crash Recovery Types
export interface PendingRequest {
  id?: number;
  requestId: string;           // UUID
  type: 'kling' | 'veo' | 'freepik' | 'amt';
  taskId: string;
  prompt: string;
  params: any;                 // Generation parameters as JSON

  status: 'queued' | 'in-progress' | 'polling' | 'completed' | 'failed';
  progress: string;

  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  lastPolledAt?: number;

  resultUrl?: string;
  r2Url?: string;
  error?: string;

  retryCount: number;
  maxRetries: number;
}

export interface CostRecord {
  id?: number;
  requestId: string;
  provider: string;
  action: string;
  creditsConsumed: number;
  timestamp: number;
  recovered: boolean;
}

/**
 * Get the current database version dynamically.
 * This handles version mismatches when DB was upgraded by other code.
 */
const getCurrentDbVersion = (): Promise<number> => {
  return new Promise((resolve) => {
    // First, try to open without version to get current version
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => {
      // Database doesn't exist yet, start at version 1
      resolve(1);
    };
  });
};

/**
 * Open Database Connection with automatic version handling.
 * CRITICAL: Never force version increment - only add missing tables without upgrade.
 * This prevents data loss from version changes.
 */
export const openDB = async (): Promise<IDBDatabase> => {
  const currentVersion = await getCurrentDbVersion();
  
  // NEVER force version increment - use current version
  // Only increment if we're at 0 (brand new DB)
  const newVersion = currentVersion === 0 ? 1 : currentVersion;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, newVersion);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // Create runs table (if doesn't exist)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }

      // Create crash recovery tables (if don't exist)
      // NOTE: These are added WITHOUT version increment to preserve data
      if (!db.objectStoreNames.contains('pendingRequests')) {
        const pendingStore = db.createObjectStore('pendingRequests', {
          keyPath: 'id',
          autoIncrement: true
        });
        pendingStore.createIndex('requestId', 'requestId', { unique: true });
        pendingStore.createIndex('taskId', 'taskId', { unique: false });
        pendingStore.createIndex('status', 'status', { unique: false });
        pendingStore.createIndex('createdAt', 'createdAt', { unique: false });
        pendingStore.createIndex('type', 'type', { unique: false });
      }

      if (!db.objectStoreNames.contains('costRecords')) {
        const costStore = db.createObjectStore('costRecords', {
          keyPath: 'id',
          autoIncrement: true
        });
        costStore.createIndex('requestId', 'requestId', { unique: false });
        costStore.createIndex('timestamp', 'timestamp', { unique: false });
        costStore.createIndex('recovered', 'recovered', { unique: false });
      }

      // Create video collections and saved payloads tables (version 3)
      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains('videoCollections')) {
          const collectionsStore = db.createObjectStore('videoCollections', {
            keyPath: 'id',
            autoIncrement: true
          });
          collectionsStore.createIndex('collectionId', 'collectionId', { unique: true });
          collectionsStore.createIndex('name', 'name', { unique: false });
          collectionsStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('savedPayloads')) {
          const payloadsStore = db.createObjectStore('savedPayloads', {
            keyPath: 'id',
            autoIncrement: true
          });
          payloadsStore.createIndex('payloadId', 'payloadId', { unique: true });
          payloadsStore.createIndex('provider', 'provider', { unique: false });
          payloadsStore.createIndex('status', 'status', { unique: false });
          payloadsStore.createIndex('savedAt', 'savedAt', { unique: false });
        }
      }
    };

    request.onblocked = () => {
      console.warn("DB upgrade blocked — close other tabs using this app");
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        window.location.reload();
      };
      resolve(db);
    };
    request.onerror = () => {
      console.error("IndexedDB Error:", request.error);

      // If version error, try to recover by deleting and recreating
      if (request.error?.name === 'VersionError') {
        console.warn("Version mismatch detected. Attempting recovery...");
        handleVersionMismatch().then(resolve).catch(reject);
      } else {
        reject(request.error);
      }
    };
  });
};

/**
 * Handle version mismatch by deleting old database and creating fresh.
 * This loses data but ensures the app works.
 */
const handleVersionMismatch = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    console.warn("Deleting old database due to version mismatch...");
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

    deleteRequest.onblocked = () => {
      console.warn("DB delete blocked — close other tabs using this app");
    };

    deleteRequest.onsuccess = () => {
      console.log("Old database deleted. Creating new database...");
      const request = indexedDB.open(DB_NAME, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };

    deleteRequest.onerror = () => {
      console.error("Failed to delete old database");
      reject(deleteRequest.error);
    };
  });
};

// Save a new run or update an existing one
export const saveRunToDB = async (run: Run): Promise<void> => {
  try {
    const db = await openDB();

    // Check if store exists before transaction
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      console.warn('Object store not found, reinitializing database...');
      db.close();
      await handleVersionMismatch();
      return saveRunToDB(run);
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(run);

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    // Detect quota exceeded
    if (
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
       error.code === 22 ||
       error.message?.toLowerCase().includes('quota'))
    ) {
      console.error('IndexedDB quota exceeded:', error);
      throw new Error('QUOTA_EXCEEDED');
    }
    console.error("Failed to save to DB:", error);
    throw error;
  }
};

// Get all runs
export const getAllRunsFromDB = async (): Promise<Run[]> => {
  try {
    const db = await openDB();

    // Check if store exists before transaction
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      console.warn('Object store not found, reinitializing database...');
      db.close();
      await handleVersionMismatch();
      return [];
    }

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      tx.oncomplete = () => {
        db.close();
        const results = request.result as Run[];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      tx.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (error) {
    console.error("Failed to fetch from DB:", error);
    return [];
  }
};

// Delete a run by ID
export const deleteRunFromDB = async (id: string): Promise<void> => {
  const db = await openDB();

  // Check if store exists before transaction
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    console.warn('Object store not found, skipping delete');
    db.close();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

// ============ Pending Requests CRUD ============

export const savePendingRequest = async (request: PendingRequest): Promise<number> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('pendingRequests')) {
    console.warn('pendingRequests store not found');
    db.close();
    throw new Error('Database schema not upgraded');
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingRequests', 'readwrite');
    const store = tx.objectStore('pendingRequests');
    const addRequest = store.add(request);

    addRequest.onsuccess = () => {
      resolve(addRequest.result as number);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const updatePendingRequest = async (
  id: number,
  updates: Partial<PendingRequest>
): Promise<void> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('pendingRequests')) {
    console.warn('pendingRequests store not found');
    db.close();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingRequests', 'readwrite');
    const store = tx.objectStore('pendingRequests');
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as PendingRequest;
      if (existing) {
        const updated = { ...existing, ...updates, id };
        store.put(updated);
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const getPendingRequestByRequestId = async (
  requestId: string
): Promise<PendingRequest | undefined> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('pendingRequests')) {
    console.warn('pendingRequests store not found');
    db.close();
    return undefined;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingRequests', 'readonly');
    const store = tx.objectStore('pendingRequests');
    const index = store.index('requestId');
    const getRequest = index.get(requestId);

    getRequest.onsuccess = () => {
      resolve(getRequest.result as PendingRequest | undefined);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const getAllPendingRequests = async (): Promise<PendingRequest[]> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('pendingRequests')) {
    console.warn('pendingRequests store not found');
    db.close();
    return [];
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingRequests', 'readonly');
    const store = tx.objectStore('pendingRequests');
    const index = store.index('status');

    // Get requests with pending statuses
    const statuses: Array<'queued' | 'in-progress' | 'polling'> = ['queued', 'in-progress', 'polling'];
    const results: PendingRequest[] = [];
    let completed = 0;

    statuses.forEach((status) => {
      const range = IDBKeyRange.only(status);
      const cursorRequest = index.openCursor(range);

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value as PendingRequest);
          cursor.continue();
        } else {
          completed++;
          if (completed === statuses.length) {
            resolve(results);
          }
        }
      };
    });

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const deletePendingRequest = async (id: number): Promise<void> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('pendingRequests')) {
    console.warn('pendingRequests store not found');
    db.close();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('pendingRequests', 'readwrite');
    const store = tx.objectStore('pendingRequests');
    store.delete(id);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

// ============ Cost Records CRUD ============

export const saveCostRecord = async (record: CostRecord): Promise<number> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('costRecords')) {
    console.warn('costRecords store not found');
    db.close();
    throw new Error('Database schema not upgraded');
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('costRecords', 'readwrite');
    const store = tx.objectStore('costRecords');
    const addRequest = store.add(record);

    addRequest.onsuccess = () => {
      resolve(addRequest.result as number);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

// ============ Video Collections CRUD ============

export interface VideoCollection {
  id?: number;
  collectionId: string;
  name: string;
  description?: string;
  videoIds: string[];
  createdAt: number;
  updatedAt: number;
  tags: string[];
  thumbnail?: string;
}

export const saveVideoCollection = async (collection: VideoCollection): Promise<number> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('videoCollections')) {
    console.warn('videoCollections store not found');
    db.close();
    throw new Error('Database schema not upgraded');
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('videoCollections', 'readwrite');
    const store = tx.objectStore('videoCollections');
    const addRequest = store.add(collection);

    addRequest.onsuccess = () => {
      resolve(addRequest.result as number);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const getAllVideoCollections = async (): Promise<VideoCollection[]> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('videoCollections')) {
    console.warn('videoCollections store not found');
    db.close();
    return [];
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('videoCollections', 'readonly');
    const store = tx.objectStore('videoCollections');
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result as VideoCollection[];
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const deleteVideoCollection = async (collectionId: string): Promise<void> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('videoCollections')) {
    console.warn('videoCollections store not found');
    db.close();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('videoCollections', 'readwrite');
    const store = tx.objectStore('videoCollections');
    const index = store.index('collectionId');
    const getRequest = index.getKey(collectionId);

    getRequest.onsuccess = () => {
      const key = getRequest.result;
      if (key) {
        store.delete(key);
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

// ============ Saved Payloads CRUD ============

export interface SavedPayload {
  id?: number;
  payloadId: string;
  name?: string;
  provider: 'veo' | 'kling' | 'freepik' | 'seedream';
  params: any;
  savedAt: number;
  failureReason?: string;
  originalError?: string;
  retryCount: number;
  lastRetryAt?: number;
  status: 'pending' | 'retrying' | 'succeeded' | 'permanently-failed';
  resultVideoId?: string;
}

export const saveSavedPayload = async (payload: SavedPayload): Promise<number> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('savedPayloads')) {
    console.warn('savedPayloads store not found');
    db.close();
    throw new Error('Database schema not upgraded');
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('savedPayloads', 'readwrite');
    const store = tx.objectStore('savedPayloads');
    const addRequest = store.add(payload);

    addRequest.onsuccess = () => {
      resolve(addRequest.result as number);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const getAllSavedPayloads = async (): Promise<SavedPayload[]> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('savedPayloads')) {
    console.warn('savedPayloads store not found');
    db.close();
    return [];
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('savedPayloads', 'readonly');
    const store = tx.objectStore('savedPayloads');
    const request = store.getAll();

    request.onsuccess = () => {
      const results = request.result as SavedPayload[];
      results.sort((a, b) => b.savedAt - a.savedAt);
      resolve(results);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const getSavedPayloadByPayloadId = async (payloadId: string): Promise<SavedPayload | undefined> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('savedPayloads')) {
    console.warn('savedPayloads store not found');
    db.close();
    return undefined;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('savedPayloads', 'readonly');
    const store = tx.objectStore('savedPayloads');
    const index = store.index('payloadId');
    const getRequest = index.get(payloadId);

    getRequest.onsuccess = () => {
      resolve(getRequest.result as SavedPayload | undefined);
    };

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const updateSavedPayload = async (
  id: number,
  updates: Partial<SavedPayload>
): Promise<void> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('savedPayloads')) {
    console.warn('savedPayloads store not found');
    db.close();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('savedPayloads', 'readwrite');
    const store = tx.objectStore('savedPayloads');
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as SavedPayload;
      if (existing) {
        const updated = { ...existing, ...updates, id };
        store.put(updated);
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

export const deleteSavedPayloadByPayloadId = async (payloadId: string): Promise<void> => {
  const db = await openDB();

  if (!db.objectStoreNames.contains('savedPayloads')) {
    console.warn('savedPayloads store not found');
    db.close();
    return;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction('savedPayloads', 'readwrite');
    const store = tx.objectStore('savedPayloads');
    const index = store.index('payloadId');
    const getRequest = index.getKey(payloadId);

    getRequest.onsuccess = () => {
      const key = getRequest.result;
      if (key) {
        store.delete(key);
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};
