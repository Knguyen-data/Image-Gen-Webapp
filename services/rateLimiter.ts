/**
 * Configuration for rate limit retry behavior
 */
export interface RateLimitConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

/**
 * Default retry configuration for rate limiting
 */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  maxRetries: 3,
  baseDelayMs: 2000,     // Start with 2s
  maxDelayMs: 30000,     // Cap at 30s
};

/**
 * Wraps an async function with exponential backoff retry for rate limit errors (429)
 *
 * @param fn - Async function to execute
 * @param config - Retry configuration
 * @returns Result of successful execution
 * @throws Last error if all retries fail
 */
export const withRateLimitRetry = async <T>(
  fn: () => Promise<T>,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if error is rate limit related
      const isRateLimitError =
        error.status === 429 ||
        error.statusCode === 429 ||
        error.message?.toLowerCase().includes('rate limit') ||
        error.message?.toLowerCase().includes('quota exceeded') ||
        error.message?.toLowerCase().includes('too many requests');

      if (isRateLimitError && attempt < config.maxRetries - 1) {
        // Calculate exponential backoff delay
        const delay = Math.min(
          config.baseDelayMs * Math.pow(2, attempt),
          config.maxDelayMs
        );

        console.warn(
          `Rate limit error (attempt ${attempt + 1}/${config.maxRetries}), ` +
          `waiting ${delay}ms before retry...`
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        // Non-rate-limit error or last retry, throw immediately
        throw lastError;
      }
    }
  }

  // All retries exhausted
  throw lastError!;
};
