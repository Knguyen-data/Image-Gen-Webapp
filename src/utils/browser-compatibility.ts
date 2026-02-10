/**
 * Browser Compatibility Detection Utilities
 * Detects browser capabilities and provides safe fallbacks
 */

export interface BrowserCapabilities {
  videoPosterSupport: boolean;
  videoPreloadSupport: boolean;
  corsEnabled: boolean;
  webpSupport: boolean;
  avifSupport: boolean;
  isModernBrowser: boolean;
}

/**
 * Detect video poster attribute support
 */
function detectVideoPosterSupport(): boolean {
  try {
    const video = document.createElement('video');
    return 'poster' in video;
  } catch {
    return false;
  }
}

/**
 * Detect video preload attribute support
 */
function detectVideoPreloadSupport(): boolean {
  try {
    const video = document.createElement('video');
    return 'preload' in video;
  } catch {
    return false;
  }
}

/**
 * Detect CORS support
 */
function detectCORSSupport(): boolean {
  try {
    return 'crossOrigin' in new Image();
  } catch {
    return false;
  }
}

/**
 * Detect WebP image format support
 */
async function detectWebPSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
  });
}

/**
 * Detect AVIF image format support
 */
async function detectAVIFSupport(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    img.src = 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';
  });
}

/**
 * Check if browser is modern (supports ES6, Promises, Fetch)
 */
function isModernBrowser(): boolean {
  try {
    return (
      typeof Promise !== 'undefined' &&
      typeof fetch !== 'undefined' &&
      typeof Array.prototype.includes !== 'undefined' &&
      typeof Object.assign !== 'undefined'
    );
  } catch {
    return false;
  }
}

// Cache capabilities to avoid repeated detection
let cachedCapabilities: BrowserCapabilities | null = null;

/**
 * Get browser capabilities (cached)
 */
export async function getBrowserCapabilities(): Promise<BrowserCapabilities> {
  if (cachedCapabilities) return cachedCapabilities;

  const [webpSupport, avifSupport] = await Promise.all([
    detectWebPSupport(),
    detectAVIFSupport(),
  ]);

  cachedCapabilities = {
    videoPosterSupport: detectVideoPosterSupport(),
    videoPreloadSupport: detectVideoPreloadSupport(),
    corsEnabled: detectCORSSupport(),
    webpSupport,
    avifSupport,
    isModernBrowser: isModernBrowser(),
  };

  return cachedCapabilities;
}

/**
 * Safe thumbnail URL with format fallback
 * Returns null if browser doesn't support required features
 */
export async function getSafeThumbnailUrl(
  baseUrl: string | null,
  capabilities?: BrowserCapabilities
): Promise<string | null> {
  if (!baseUrl) return null;

  const caps = capabilities || await getBrowserCapabilities();

  // Disable thumbnails on unsupported browsers
  if (!caps.videoPosterSupport || !caps.isModernBrowser) {
    console.warn('[BrowserCompat] Video poster not supported, thumbnails disabled');
    return null;
  }

  // CORS check - if disabled, only allow same-origin thumbnails
  if (!caps.corsEnabled) {
    try {
      const url = new URL(baseUrl);
      const currentOrigin = window.location.origin;
      if (url.origin !== currentOrigin) {
        console.warn('[BrowserCompat] CORS not supported, cross-origin thumbnails disabled');
        return null;
      }
    } catch {
      return null;
    }
  }

  return baseUrl;
}

/**
 * Check if video thumbnail loading should be enabled
 */
export async function shouldEnableThumbnails(): Promise<boolean> {
  const caps = await getBrowserCapabilities();
  return caps.videoPosterSupport && caps.isModernBrowser;
}

/**
 * Log browser compatibility info (dev only)
 */
export async function logBrowserCapabilities(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;

  const caps = await getBrowserCapabilities();
  console.log('[BrowserCompat] Detected capabilities:', caps);
}
