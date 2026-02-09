/**
 * Prompt Library IndexedDB Service
 * Separate database (PROMPT_LIBRARY_DB) to avoid version conflicts with RAW_STUDIO_DB.
 * Two stores: 'folders' and 'prompts'.
 */

import { PromptFolder, SavedPrompt } from '../types/prompt-library';

const DB_NAME = 'PROMPT_LIBRARY_DB';
const DB_VERSION = 1;
const FOLDERS_STORE = 'folders';
const PROMPTS_STORE = 'prompts';
const FAVORITES_FOLDER_ID = 'favorites';

// ─── Database ────────────────────────────────────────────────────────

const openPromptLibraryDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PROMPTS_STORE)) {
        const store = db.createObjectStore(PROMPTS_STORE, { keyPath: 'id' });
        store.createIndex('folderId', 'folderId', { unique: false });
      }
    };

    request.onblocked = () => {
      console.warn('Prompt Library DB upgrade blocked — close other tabs');
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('Prompt Library DB Error:', request.error);
      reject(request.error);
    };
  });
};

/** Ensure the built-in Favorites folder exists on first use */
const ensureDefaultFolders = async (db: IDBDatabase): Promise<void> => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    const countReq = store.count();

    countReq.onsuccess = () => {
      if (countReq.result === 0) {
        store.put({
          id: FAVORITES_FOLDER_ID,
          name: 'Favorites',
          order: 0,
          createdAt: Date.now(),
        } satisfies PromptFolder);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

// ─── Folders ─────────────────────────────────────────────────────────

export const getAllFolders = async (): Promise<PromptFolder[]> => {
  try {
    const db = await openPromptLibraryDB();
    await ensureDefaultFolders(db);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(FOLDERS_STORE, 'readonly');
      const store = tx.objectStore(FOLDERS_STORE);
      const request = store.getAll();

      tx.oncomplete = () => {
        db.close();
        const folders = request.result as PromptFolder[];
        folders.sort((a, b) => a.order - b.order);
        resolve(folders);
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error('Failed to get folders:', error);
    return [];
  }
};

export const createFolder = async (name: string): Promise<PromptFolder> => {
  const db = await openPromptLibraryDB();
  const existing = await getAllFolders();
  const maxOrder = existing.reduce((max, f) => Math.max(max, f.order), 0);

  const folder: PromptFolder = {
    id: crypto.randomUUID(),
    name,
    order: maxOrder + 1,
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    store.put(folder);

    tx.oncomplete = () => { db.close(); resolve(folder); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const renameFolder = async (id: string, name: string): Promise<void> => {
  const db = await openPromptLibraryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      if (getReq.result) {
        store.put({ ...getReq.result, name });
      }
    };

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const deleteFolder = async (id: string): Promise<void> => {
  if (id === FAVORITES_FOLDER_ID) return; // can't delete built-in

  const db = await openPromptLibraryDB();

  // Delete all prompts in this folder first
  const prompts = await getPromptsByFolder(id);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FOLDERS_STORE, PROMPTS_STORE], 'readwrite');
    const folderStore = tx.objectStore(FOLDERS_STORE);
    const promptStore = tx.objectStore(PROMPTS_STORE);

    folderStore.delete(id);
    for (const p of prompts) {
      promptStore.delete(p.id);
    }

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

export const reorderFolders = async (folders: PromptFolder[]): Promise<void> => {
  const db = await openPromptLibraryDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);

    folders.forEach((f, i) => {
      store.put({ ...f, order: i });
    });

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

// ─── Prompts ─────────────────────────────────────────────────────────

export const getAllPrompts = async (): Promise<SavedPrompt[]> => {
  try {
    const db = await openPromptLibraryDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROMPTS_STORE, 'readonly');
      const store = tx.objectStore(PROMPTS_STORE);
      const request = store.getAll();

      tx.oncomplete = () => {
        db.close();
        const results = request.result as SavedPrompt[];
        results.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(results);
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error('Failed to get prompts:', error);
    return [];
  }
};

export const getPromptsByFolder = async (folderId: string): Promise<SavedPrompt[]> => {
  try {
    const db = await openPromptLibraryDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROMPTS_STORE, 'readonly');
      const store = tx.objectStore(PROMPTS_STORE);
      const index = store.index('folderId');
      const request = index.getAll(folderId);

      tx.oncomplete = () => {
        db.close();
        const results = request.result as SavedPrompt[];
        results.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(results);
      };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error('Failed to get prompts by folder:', error);
    return [];
  }
};

export const savePrompt = async (prompt: SavedPrompt): Promise<void> => {
  try {
    const db = await openPromptLibraryDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROMPTS_STORE, 'readwrite');
      const store = tx.objectStore(PROMPTS_STORE);
      store.put(prompt);

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error('Failed to save prompt:', error);
    throw error;
  }
};

export const updatePrompt = async (prompt: SavedPrompt): Promise<void> => {
  return savePrompt({ ...prompt, updatedAt: Date.now() });
};

export const deletePrompt = async (id: string): Promise<void> => {
  try {
    const db = await openPromptLibraryDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROMPTS_STORE, 'readwrite');
      const store = tx.objectStore(PROMPTS_STORE);
      store.delete(id);

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error('Failed to delete prompt:', error);
    throw error;
  }
};

export const toggleFavorite = async (id: string): Promise<void> => {
  try {
    const db = await openPromptLibraryDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROMPTS_STORE, 'readwrite');
      const store = tx.objectStore(PROMPTS_STORE);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (getReq.result) {
          const prompt = getReq.result as SavedPrompt;
          store.put({ ...prompt, isFavorite: !prompt.isFavorite, updatedAt: Date.now() });
        }
      };

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error('Failed to toggle favorite:', error);
    throw error;
  }
};

export const incrementUsedCount = async (id: string): Promise<void> => {
  try {
    const db = await openPromptLibraryDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROMPTS_STORE, 'readwrite');
      const store = tx.objectStore(PROMPTS_STORE);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        if (getReq.result) {
          const prompt = getReq.result as SavedPrompt;
          store.put({ ...prompt, usedCount: prompt.usedCount + 1 });
        }
      };

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error('Failed to increment used count:', error);
  }
};
