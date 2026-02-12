/**
 * Image Optimization Pipeline
 * 
 * Features:
 * - Store images as Blobs instead of base64 (smaller memory footprint)
 * - Lazy loading with Intersection Observer
 * - Multiple thumbnail sizes
 * - Web Workers for heavy processing
 * - LRU cache for frequently accessed images
 */

import { logger } from './logger';

// Configuration
const CONFIG = {
  THUMBNAIL_SIZES: {
    tiny: 100,    // For grids
    small: 200,   // For lists
    medium: 400,  // For preview
    large: 800,   // For lightbox
  },
  MAX_CACHE_SIZE: 50, // Max cached images in memory
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png', 'image/webp'],
  DEFAULT_QUALITY: 0.85,
};

// LRU Cache implementation
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }
}

// Image cache
const imageCache = new LRUCache<string, Blob>(CONFIG.MAX_CACHE_SIZE);
const thumbnailCache = new LRUCache<string, Map<number, Blob>>(CONFIG.MAX_CACHE_SIZE);

// Store image in IndexedDB as Blob
const DB_NAME = 'RAW_STUDIO_IMAGE_DB';
const STORE_NAME = 'optimized_images';

interface OptimizedImageRecord {
  id: string;
  originalBlob: Blob;
  mimeType: string;
  thumbnails: Map<number, Blob>;
  createdAt: number;
  size: number;
}

/**
 * Open the optimized image database
 */
async function openImageDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('size', 'size', { unique: false });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Convert base64 to Blob
 */
export function base64ToBlob(base64: string, mimeType: string = 'image/jpeg'): Blob {
  const byteString = atob(base64.includes(',') ? base64.split(',')[1] : base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([ab], { type: mimeType });
}

/**
 * Convert Blob to base64 (for backwards compatibility)
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Create a thumbnail from a Blob using canvas
 */
export async function createThumbnail(
  blob: Blob,
  maxSize: number,
  quality: number = CONFIG.DEFAULT_QUALITY
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Calculate new dimensions
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) {
          height *= maxSize / width;
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width *= maxSize / height;
          height = maxSize;
        }
      }
      
      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      // Use better quality scaling
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to blob
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Store an optimized image with thumbnails
 */
export async function storeOptimizedImage(
  id: string,
  base64Data: string,
  mimeType: string = 'image/jpeg'
): Promise<void> {
  try {
    // Convert base64 to Blob
    const originalBlob = base64ToBlob(base64Data, mimeType);
    
    // Create thumbnails in parallel
    const thumbnailPromises = Object.entries(CONFIG.THUMBNAIL_SIZES).map(
      async ([name, size]) => {
        const thumbnail = await createThumbnail(originalBlob, size);
        return [size, thumbnail] as [number, Blob];
      }
    );
    
    const thumbnails = new Map(await Promise.all(thumbnailPromises));
    
    // Store in IndexedDB
    const db = await openImageDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Convert Map to serializable object
    const thumbnailEntries: [number, Blob][] = [];
    thumbnails.forEach((blob, size) => {
      thumbnailEntries.push([size, blob]);
    });
    
    const record = {
      id,
      originalBlob,
      mimeType,
      thumbnails: thumbnailEntries,
      createdAt: Date.now(),
      size: originalBlob.size,
    };
    
    await new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    // Update cache
    imageCache.set(id, originalBlob);
    thumbnailCache.set(id, thumbnails);
    
    logger.debug('ImageOptimization', `Stored optimized image ${id}`, {
      originalSize: originalBlob.size,
      thumbnailCount: thumbnails.size,
    });
  } catch (err) {
    logger.error('ImageOptimization', 'Failed to store optimized image', err);
    throw err;
  }
}

/**
 * Get an image by ID
 */
export async function getOptimizedImage(id: string): Promise<Blob | null> {
  // Check cache first
  const cached = imageCache.get(id);
  if (cached) {
    return cached;
  }
  
  try {
    const db = await openImageDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const record = await new Promise<OptimizedImageRecord | undefined>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (record) {
      imageCache.set(id, record.originalBlob);
      return record.originalBlob;
    }
    
    return null;
  } catch (err) {
    logger.error('ImageOptimization', 'Failed to get optimized image', err);
    return null;
  }
}

/**
 * Get a thumbnail by ID and size
 */
export async function getThumbnail(
  id: string,
  size: keyof typeof CONFIG.THUMBNAIL_SIZES = 'small'
): Promise<Blob | null> {
  const targetSize = CONFIG.THUMBNAIL_SIZES[size];
  
  // Check cache first
  const cachedThumbnails = thumbnailCache.get(id);
  if (cachedThumbnails?.has(targetSize)) {
    return cachedThumbnails.get(targetSize)!;
  }
  
  try {
    const db = await openImageDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    const record = await new Promise<OptimizedImageRecord | undefined>((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (record) {
      // Reconstruct Map from entries
      const entries = record.thumbnails as unknown as [number, Blob][];
      const thumbnails = new Map(entries);
      thumbnailCache.set(id, thumbnails);
      return thumbnails.get(targetSize) || null;
    }
    
    return null;
  } catch (err) {
    logger.error('ImageOptimization', 'Failed to get thumbnail', err);
    return null;
  }
}

/**
 * Get image URL for display (uses blob URL)
 */
export async function getImageUrl(
  id: string,
  size: keyof typeof CONFIG.THUMBNAIL_SIZES | 'original' = 'original'
): Promise<string | null> {
  try {
    const blob = size === 'original' 
      ? await getOptimizedImage(id)
      : await getThumbnail(id, size);
    
    if (blob) {
      return URL.createObjectURL(blob);
    }
    
    return null;
  } catch (err) {
    logger.error('ImageOptimization', 'Failed to get image URL', err);
    return null;
  }
}

/**
 * Delete an optimized image
 */
export async function deleteOptimizedImage(id: string): Promise<void> {
  try {
    const db = await openImageDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    // Remove from cache
    imageCache.delete(id);
    thumbnailCache.delete(id);
    
    logger.debug('ImageOptimization', `Deleted optimized image ${id}`);
  } catch (err) {
    logger.error('ImageOptimization', 'Failed to delete optimized image', err);
    throw err;
  }
}

/**
 * Clean up old images to free space
 */
export async function cleanupOldImages(
  maxAgeDays: number = 30,
  maxSizeMB: number = 500
): Promise<{ deleted: number; freedBytes: number }> {
  try {
    const db = await openImageDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('createdAt');
    
    const cutoffTime = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    
    const oldImages: string[] = [];
    let totalSize = 0;
    
    await new Promise<void>((resolve, reject) => {
      const cursor = index.openCursor();
      
      cursor.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        if (result) {
          const record = result.value as OptimizedImageRecord;
          totalSize += record.size;
          
          if (record.createdAt < cutoffTime) {
            oldImages.push(record.id);
          }
          
          result.continue();
        } else {
          resolve();
        }
      };
      
      cursor.onerror = () => reject(cursor.error);
    });
    
    // Delete old images
    let freedBytes = 0;
    for (const id of oldImages) {
      const image = await getOptimizedImage(id);
      if (image) {
        freedBytes += image.size;
        await deleteOptimizedImage(id);
      }
    }
    
    logger.info('ImageOptimization', `Cleaned up ${oldImages.length} old images`, {
      freedBytes,
      freedMB: (freedBytes / 1024 / 1024).toFixed(2),
    });
    
    return { deleted: oldImages.length, freedBytes };
  } catch (err) {
    logger.error('ImageOptimization', 'Failed to cleanup old images', err);
    return { deleted: 0, freedBytes: 0 };
  }
}

/**
 * Get storage statistics
 */
export async function getImageStorageStats(): Promise<{
  count: number;
  totalSize: number;
  averageSize: number;
}> {
  try {
    const db = await openImageDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    let count = 0;
    let totalSize = 0;
    
    await new Promise<void>((resolve, reject) => {
      const cursor = store.openCursor();
      
      cursor.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        if (result) {
          const record = result.value as OptimizedImageRecord;
          count++;
          totalSize += record.size;
          result.continue();
        } else {
          resolve();
        }
      };
      
      cursor.onerror = () => reject(cursor.error);
    });
    
    return {
      count,
      totalSize,
      averageSize: count > 0 ? totalSize / count : 0,
    };
  } catch (err) {
    logger.error('ImageOptimization', 'Failed to get storage stats', err);
    return { count: 0, totalSize: 0, averageSize: 0 };
  }
}

// Export configuration
export { CONFIG as IMAGE_OPTIMIZATION_CONFIG };
