import { ReferenceVideo, GeneratedVideo } from "../types";
import { uploadUrlToStorage } from "./supabase-storage-service";
import { fetchWithTimeout } from "../utils/fetch-with-timeout";

const VIDEO_DB_NAME = 'RAW_STUDIO_VIDEO_DB';
const VIDEO_STORE_NAME = 'videos';
const GENERATED_VIDEO_STORE_NAME = 'generated_videos';

/**
 * IndexedDB service for storing video files.
 * Videos are stored as blobs with metadata.
 */

/**
 * Check if the video DB needs a version upgrade (missing object stores).
 * Opens without version to inspect existing stores, then determines target version.
 */
const getVideoDbOpenParams = (): Promise<{ version: number; needsUpgrade: boolean }> => {
  return new Promise((resolve) => {
    const request = indexedDB.open(VIDEO_DB_NAME);

    request.onsuccess = () => {
      const db = request.result;
      const version = db.version;
      const hasVideoStore = db.objectStoreNames.contains(VIDEO_STORE_NAME);
      const hasGeneratedStore = db.objectStoreNames.contains(GENERATED_VIDEO_STORE_NAME);
      db.close();

      if (hasVideoStore && hasGeneratedStore) {
        // Both stores exist — open at current version, no upgrade needed
        resolve({ version, needsUpgrade: false });
      } else {
        // Missing stores — bump version to trigger onupgradeneeded
        resolve({ version: version + 1, needsUpgrade: true });
      }
    };

    request.onerror = () => {
      // DB doesn't exist yet — version 1 will trigger onupgradeneeded
      resolve({ version: 1, needsUpgrade: true });
    };
  });
};

export const openVideoDB = async (): Promise<IDBDatabase> => {
  const { version, needsUpgrade } = await getVideoDbOpenParams();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VIDEO_DB_NAME, version);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
        db.createObjectStore(VIDEO_STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(GENERATED_VIDEO_STORE_NAME)) {
        db.createObjectStore(GENERATED_VIDEO_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onblocked = () => {
      console.warn("Video DB upgrade blocked — close other tabs using this app");
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error("Video IndexedDB Error:", request.error);
      reject(request.error);
    };
  });
};

/**
 * Save video file to IndexedDB.
 * Stores the actual File object which contains the blob data.
 */
export interface StoredVideo {
  id: string;
  file: File;
  duration?: number;
  createdAt: number;
}

export const saveVideoToDB = async (video: ReferenceVideo): Promise<void> => {
  try {
    const db = await openVideoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VIDEO_STORE_NAME);

      // Convert File to Blob for Safari compatibility (Safari can't serialize File objects)
      const blob = new Blob([video.file], { type: video.file.type });

      const storedVideo: StoredVideo = {
        id: video.id,
        file: blob as File,
        duration: video.duration,
        createdAt: Date.now()
      };

      const request = store.put(storedVideo);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (error) {
    console.error("Failed to save video to DB:", error);
    throw error;
  }
};

/**
 * Get video from IndexedDB by ID.
 * Returns the stored video with File object.
 */
export const getVideoFromDB = async (id: string): Promise<StoredVideo | null> => {
  try {
    const db = await openVideoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE_NAME, 'readonly');
      const store = tx.objectStore(VIDEO_STORE_NAME);
      const request = store.get(id);

      tx.oncomplete = () => { db.close(); resolve(request.result || null); };
      tx.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (error) {
    console.error("Failed to get video from DB:", error);
    return null;
  }
};

/**
 * Get all videos from IndexedDB.
 */
export const getAllVideosFromDB = async (): Promise<StoredVideo[]> => {
  try {
    const db = await openVideoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE_NAME, 'readonly');
      const store = tx.objectStore(VIDEO_STORE_NAME);
      const request = store.getAll();

      tx.oncomplete = () => {
        db.close();
        const results = request.result as StoredVideo[];
        results.sort((a, b) => b.createdAt - a.createdAt);
        resolve(results);
      };
      tx.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (error) {
    console.error("Failed to fetch videos from DB:", error);
    return [];
  }
};

/**
 * Delete video from IndexedDB.
 */
export const deleteVideoFromDB = async (id: string): Promise<void> => {
  const db = await openVideoDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
    const store = tx.objectStore(VIDEO_STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
};

/**
 * Convert stored video back to ReferenceVideo type.
 * Creates a new blob URL for preview.
 */
export const storedVideoToReferenceVideo = (stored: StoredVideo): ReferenceVideo => {
  return {
    id: stored.id,
    file: stored.file,
    previewUrl: URL.createObjectURL(stored.file),
    duration: stored.duration
  };
};

// ============================================
// Generated Video Storage (for video gallery)
// ============================================

/**
 * Interface for storing generated videos (from Kling API)
 * Stores video blob locally to persist across sessions
 * Also stores Supabase URL for real HTTP access
 */
export interface StoredGeneratedVideo {
  id: string;
  sceneId: string;
  videoBlob: Blob;
  thumbnailBlob?: Blob;
  duration: number;
  prompt: string;
  createdAt: number;
  status: 'pending' | 'generating' | 'success' | 'failed';
  error?: string;
  supabaseUrl?: string; // Real HTTP URL from Supabase Storage (avoids blob URL issues)
}

/**
 * Save generated video to IndexedDB.
 * Also uploads to Supabase Storage for persistence and real HTTP URLs.
 */
export const saveGeneratedVideoToDB = async (video: GeneratedVideo): Promise<void> => {
  try {
    if (video.status !== 'success' || !video.url) {
      return;
    }

    // Upload to Supabase Storage to get a real HTTP URL (avoids blob URL HEAD errors)
    let supabaseUrl: string | undefined;
    try {
      supabaseUrl = await uploadUrlToStorage(video.url, `video-${video.id}.mp4`);
      console.log('[IndexedDB] Uploaded to Supabase:', supabaseUrl.slice(0, 60) + '...');
    } catch (e) {
      console.warn('[IndexedDB] Failed to upload to Supabase, using blob URL:', e);
    }

    const videoResponse = await fetchWithTimeout(video.url);
    const videoBlob = await videoResponse.blob();

    let thumbnailBlob: Blob | undefined;
    if (video.thumbnailUrl) {
      try {
        const thumbResponse = await fetchWithTimeout(video.thumbnailUrl);
        thumbnailBlob = await thumbResponse.blob();
      } catch (e) {
        console.warn('Failed to fetch thumbnail:', e);
      }
    }

    const db = await openVideoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(GENERATED_VIDEO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(GENERATED_VIDEO_STORE_NAME);

      const stored: StoredGeneratedVideo = {
        id: video.id,
        sceneId: video.sceneId,
        videoBlob,
        thumbnailBlob,
        duration: video.duration,
        prompt: video.prompt,
        createdAt: video.createdAt,
        status: video.status,
        error: video.error,
        supabaseUrl // Store the real HTTP URL for use in video editor
      };

      store.put(stored);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error("Failed to save generated video to DB:", error);
    throw error;
  }
};

/**
 * Get all generated videos from IndexedDB.
 * Converts stored blobs back to URLs.
 */
export const getAllGeneratedVideosFromDB = async (): Promise<GeneratedVideo[]> => {
  try {
    const db = await openVideoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(GENERATED_VIDEO_STORE_NAME, 'readonly');
      const store = tx.objectStore(GENERATED_VIDEO_STORE_NAME);
      const request = store.getAll();

      tx.oncomplete = () => {
        db.close();
        const results = request.result as StoredGeneratedVideo[];
        results.sort((a, b) => b.createdAt - a.createdAt);

        const videos: GeneratedVideo[] = results.map(stored => ({
          id: stored.id,
          sceneId: stored.sceneId,
          // Use Supabase URL if available (real HTTP URL), otherwise blob URL
          url: stored.supabaseUrl || URL.createObjectURL(stored.videoBlob),
          thumbnailUrl: stored.thumbnailBlob ? URL.createObjectURL(stored.thumbnailBlob) : undefined,
          duration: stored.duration,
          prompt: stored.prompt,
          createdAt: stored.createdAt,
          status: stored.status,
          error: stored.error,
          supabaseUrl: stored.supabaseUrl
        }));

        resolve(videos);
      };
      tx.onerror = () => { db.close(); reject(request.error); };
    });
  } catch (error) {
    console.error("Failed to fetch generated videos from DB:", error);
    return [];
  }
};

/**
 * Delete generated video from IndexedDB.
 */
export const deleteGeneratedVideoFromDB = async (id: string): Promise<void> => {
  try {
    const db = await openVideoDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(GENERATED_VIDEO_STORE_NAME, 'readwrite');
      const store = tx.objectStore(GENERATED_VIDEO_STORE_NAME);
      store.delete(id);

      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch (error) {
    console.error("Failed to delete generated video from DB:", error);
    throw error;
  }
};
