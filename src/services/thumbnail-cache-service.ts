/**
 * Thumbnail Cache Service
 * 
 * Caches generated video thumbnails in IndexedDB to avoid
 * re-downloading videos just to generate thumbnails.
 */

const THUMBNAIL_DB_NAME = 'RAW_STUDIO_THUMBNAIL_DB';
const THUMBNAIL_STORE_NAME = 'thumbnails';
const DB_VERSION = 1;

export interface CachedThumbnail {
  id: string; // video URL hash
  dataUrl: string; // base64 thumbnail
  duration: number; // extracted video duration in seconds
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * Open or create the thumbnail database
 */
async function openThumbnailDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(THUMBNAIL_DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
        const store = db.createObjectStore(THUMBNAIL_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      console.error('Thumbnail DB Error:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Generate a hash for a URL to use as cache key
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'thumb_' + Math.abs(hash).toString(36);
}

/**
 * Get cached thumbnail for a video URL
 */
export async function getCachedThumbnail(videoUrl: string): Promise<CachedThumbnail | null> {
  try {
    const db = await openThumbnailDB();
    const id = hashUrl(videoUrl);

    return new Promise((resolve) => {
      const tx = db.transaction(THUMBNAIL_STORE_NAME, 'readonly');
      const store = tx.objectStore(THUMBNAIL_STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.warn('Failed to get cached thumbnail:', request.error);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Store thumbnail in cache
 */
export async function cacheThumbnail(
  videoUrl: string,
  dataUrl: string,
  duration: number
): Promise<void> {
  try {
    const db = await openThumbnailDB();
    const id = hashUrl(videoUrl);

    const entry: CachedThumbnail = {
      id,
      dataUrl,
      duration,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(THUMBNAIL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(THUMBNAIL_STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Failed to cache thumbnail:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    console.warn('Failed to cache thumbnail:', err);
  }
}

/**
 * Clear old thumbnails to manage storage (keep last N days)
 */
export async function cleanOldThumbnails(maxAgeDays: number = 30): Promise<number> {
  try {
    const db = await openThumbnailDB();
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    let deletedCount = 0;

    return new Promise((resolve) => {
      const tx = db.transaction(THUMBNAIL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(THUMBNAIL_STORE_NAME);
      const index = store.index('createdAt');
      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deletedCount);
      tx.onerror = () => resolve(deletedCount);
    });
  } catch {
    return 0;
  }
}

/**
 * Generate thumbnail from video URL and cache it
 * Returns dataUrl and duration
 */
export function generateThumbnail(
  videoUrl: string,
  onComplete: (dataUrl: string, duration: number) => void,
  onError: () => void
): () => void {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.preload = 'metadata';

  let cancelled = false;

  const handleLoaded = () => {
    if (cancelled) return;
    // Seek to 10% or 1 second, whichever is smaller
    video.currentTime = Math.min(1, video.duration * 0.1);
  };

  const handleSeeked = () => {
    if (cancelled) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const duration = Math.round(video.duration);

      // Cache the result
      cacheThumbnail(videoUrl, dataUrl, duration).catch(() => {});

      onComplete(dataUrl, duration);
    } else {
      onError();
    }

    cleanup();
  };

  const handleError = () => {
    if (cancelled) return;
    onError();
    cleanup();
  };

  const cleanup = () => {
    video.removeEventListener('loadedmetadata', handleLoaded);
    video.removeEventListener('seeked', handleSeeked);
    video.removeEventListener('error', handleError);
    video.src = '';
    video.remove();
  };

  video.addEventListener('loadedmetadata', handleLoaded);
  video.addEventListener('seeked', handleSeeked);
  video.addEventListener('error', handleError);
  video.src = videoUrl;

  // Return cleanup function
  return () => {
    cancelled = true;
    cleanup();
  };
}
