import { Run } from "../types";

const DB_NAME = 'RAW_STUDIO_DB';
const STORE_NAME = 'runs';

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
 * Detects existing version and opens at that version to avoid VersionError.
 */
export const openDB = async (): Promise<IDBDatabase> => {
  const currentVersion = await getCurrentDbVersion();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, currentVersion);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      // Ensure the object store exists
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onblocked = () => {
      console.warn("DB upgrade blocked — close other tabs using this app");
    };

    request.onsuccess = () => resolve(request.result);
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
