/**
 * Fetch with Timeout Utility
 * Wraps native fetch() with AbortController-based timeout and CORS support.
 * Use this instead of raw fetch() for all network requests to prevent
 * hanging requests and ensure consistent error handling.
 */

const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Fetch wrapper that adds timeout via AbortController and enables CORS.
 *
 * @param url - The URL to fetch
 * @param options - Standard RequestInit options (merged with defaults)
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The fetch Response
 * @throws Error with descriptive message on timeout or network failure
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      mode: options.mode ?? 'cors',
    });
    return response;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate that a URL has an allowed protocol before fetching.
 * Prevents fetching from unexpected protocols (e.g., file://, ftp://).
 *
 * @param url - The URL string to validate
 * @param allowedProtocols - Allowed protocols (default: https, http, blob, data)
 * @throws Error if the URL protocol is not in the allowed list
 */
export function validateUrlProtocol(
  url: string,
  allowedProtocols = ['https:', 'http:', 'blob:', 'data:']
): void {
  const isValid = allowedProtocols.some((proto) => url.startsWith(proto));
  if (!isValid) {
    throw new Error(
      `Invalid URL protocol: ${url.split(':')[0]}. Allowed: ${allowedProtocols.join(', ')}`
    );
  }
}
