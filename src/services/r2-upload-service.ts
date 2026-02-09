/**
 * R2 Media Upload Service
 * Uploads files (base64, URL, blob) to Cloudflare R2 via the r2-media-upload Worker.
 */

import { logger } from './logger';

const R2_WORKER_URL = import.meta.env.VITE_R2_WORKER_URL || '/api/r2';
const MAX_RETRIES = 5; // Increased from 3
const RETRY_DELAY_MS = 3000; // Increased from 2000
const REQUEST_TIMEOUT_MS = 120000; // 2 minutes for large files

interface R2UploadResponse {
  url: string;
  key: string;
}

async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      
      // Retry on server errors (500, 502, 503, 504) or rate limit (429)
      if ([429, 500, 502, 503, 504].includes(response.status)) {
        if (attempt < retries) {
          const delay = RETRY_DELAY_MS * attempt; // Exponential backoff
          logger.warn('R2Upload', `Got ${response.status}, retrying (${attempt}/${retries}) after ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      return response;
    } catch (err: any) {
      const isNetworkError = err.name === 'AbortError' || 
                            err.message?.includes('ERR_CONNECTION_RESET') || 
                            err.message?.includes('fetch') ||
                            err.message?.includes('network');
      
      if (attempt < retries && isNetworkError) {
        const delay = RETRY_DELAY_MS * attempt;
        logger.warn('R2Upload', `Network error, retrying (${attempt}/${retries}) after ${delay}ms...`, { error: err.message });
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error('R2 upload: all retries exhausted');
}

/**
 * Upload base64-encoded data to R2. Returns the public URL.
 */
export async function uploadBase64ToR2(
  base64Data: string,
  mimeType: string,
  filename?: string
): Promise<string> {
  logger.debug('R2Upload', 'Uploading base64', { mimeType, hasFilename: !!filename });

  // Strip data URL prefix if present
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

  const response = await fetchWithRetry(`${R2_WORKER_URL}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: raw, mimeType, filename }),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error('R2Upload', 'Base64 upload failed', { 
      status: response.status, 
      statusText: response.statusText,
      error: err,
      url: `${R2_WORKER_URL}/upload`,
      dataSize: raw.length 
    });
    throw new Error(`R2 upload failed (${response.status}): ${err}`);
  }

  const result: R2UploadResponse = await response.json();
  logger.info('R2Upload', 'Base64 upload success', { url: result.url.slice(0, 80) });
  return result.url;
}

/**
 * Re-upload a file from a source URL to R2. Returns the public R2 URL.
 * Useful for persisting CDN video URLs (e.g. Freepik) into R2.
 */
export async function uploadUrlToR2(
  sourceUrl: string,
  filename?: string
): Promise<string> {
  logger.debug('R2Upload', 'Uploading from URL', { sourceUrl: sourceUrl.slice(0, 80) });

  const response = await fetchWithRetry(`${R2_WORKER_URL}/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: sourceUrl, filename }),
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error('R2Upload', 'URL upload failed', { status: response.status, err });
    throw new Error(`R2 URL upload failed (${response.status}): ${err}`);
  }

  const result: R2UploadResponse = await response.json();
  logger.info('R2Upload', 'URL upload success', { url: result.url.slice(0, 80) });
  return result.url;
}

/**
 * Upload a Blob/File to R2 by converting to base64 first. Returns the public URL.
 */
export async function uploadBlobToR2(
  blob: Blob,
  filename?: string
): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  return uploadBase64ToR2(base64, blob.type || 'application/octet-stream', filename);
}
