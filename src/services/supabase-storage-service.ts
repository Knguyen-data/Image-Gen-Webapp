/**
 * Supabase Storage Upload Service
 * Uploads files (base64, URL, blob) to Supabase Storage bucket.
 * Drop-in replacement for r2-upload-service.ts
 */

import { supabase } from './supabase';
import { logger } from './logger';

const BUCKET = 'media';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Get the current user ID, or 'anonymous' if not authenticated.
 */
async function getUserFolder(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
}

/**
 * Get the user's country from their Supabase profile metadata,
 * or detect via locale. Falls back to 'unknown'.
 */
async function getUserCountry(): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const country = user?.user_metadata?.country;
    if (country) return country.toLowerCase();
  } catch { /* ignore */ }

  // Fallback: use browser locale to guess country
  try {
    const locale = navigator.language || navigator.languages?.[0] || '';
    const parts = locale.split('-');
    if (parts.length >= 2) return parts[1].toLowerCase();
  } catch { /* ignore */ }

  return 'unknown';
}

/**
 * Derive a file extension from a MIME type.
 */
function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'application/octet-stream': 'bin',
  };
  return map[mimeType] || mimeType.split('/')[1] || 'bin';
}

/**
 * Build the storage path: {country}/{userId}/{year-month}/{uuid}.{ext}
 */
async function buildPath(mimeType: string, filename?: string): Promise<string> {
  const userId = await getUserFolder();
  const country = await getUserCountry();
  const now = new Date();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const ext = filename
    ? (filename.includes('.') ? filename.split('.').pop()! : extFromMime(mimeType))
    : extFromMime(mimeType);
  const uniqueName = `${crypto.randomUUID()}.${ext}`;
  return `${country}/${userId}/${yearMonth}/${uniqueName}`;
}

/**
 * Upload a file to Supabase Storage with retry logic.
 * Returns the public URL.
 */
async function uploadWithRetry(
  path: string,
  body: Blob | ArrayBuffer | Uint8Array,
  contentType: string
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .upload(path, body, {
          contentType,
          upsert: false,
        });

      if (error) {
        throw new Error(`Supabase upload error: ${error.message}`);
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (err: any) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1); // exponential backoff
        logger.warn('SupabaseStorage', `Upload failed, retrying (${attempt}/${MAX_RETRIES}) after ${delay}ms...`, {
          error: err.message,
          path,
        });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error('Supabase upload: all retries exhausted');
}

/**
 * Upload base64-encoded data to Supabase Storage. Returns the public URL.
 */
export async function uploadBase64ToStorage(
  base64Data: string,
  mimeType: string,
  filename?: string
): Promise<string> {
  logger.debug('SupabaseStorage', 'Uploading base64', { mimeType, hasFilename: !!filename });

  // Strip data URL prefix if present
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

  // Decode base64 to binary
  const binaryStr = atob(raw);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const path = await buildPath(mimeType, filename);
  const url = await uploadWithRetry(path, bytes, mimeType);

  logger.info('SupabaseStorage', 'Base64 upload success', { url: url.slice(0, 80) });
  return url;
}

/**
 * Re-upload a file from a source URL to Supabase Storage. Returns the public URL.
 * Useful for persisting CDN URLs into permanent storage.
 */
export async function uploadUrlToStorage(
  sourceUrl: string,
  filename?: string
): Promise<string> {
  logger.debug('SupabaseStorage', 'Uploading from URL', { sourceUrl: sourceUrl.slice(0, 80) });

  // Fetch the file from the source URL
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch source URL (${response.status}): ${sourceUrl}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || 'application/octet-stream';
  const path = await buildPath(mimeType, filename);
  const url = await uploadWithRetry(path, blob, mimeType);

  logger.info('SupabaseStorage', 'URL upload success', { url: url.slice(0, 80) });
  return url;
}

/**
 * Upload a Blob/File to Supabase Storage. Returns the public URL.
 */
export async function uploadBlobToStorage(
  blob: Blob,
  filename?: string
): Promise<string> {
  logger.debug('SupabaseStorage', 'Uploading blob', { type: blob.type, size: blob.size, hasFilename: !!filename });

  const mimeType = blob.type || 'application/octet-stream';
  const path = await buildPath(mimeType, filename);
  const url = await uploadWithRetry(path, blob, mimeType);

  logger.info('SupabaseStorage', 'Blob upload success', { url: url.slice(0, 80) });
  return url;
}

// ── Backwards-compatible aliases (drop-in for r2-upload-service) ──
export const uploadBase64ToR2 = uploadBase64ToStorage;
export const uploadUrlToR2 = uploadUrlToStorage;
export const uploadBlobToR2 = uploadBlobToStorage;
