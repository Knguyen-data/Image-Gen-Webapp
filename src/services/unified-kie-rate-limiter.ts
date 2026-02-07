/**
 * Unified Token Bucket Rate Limiter for Kie.ai APIs
 * Shared by: Seedream Edit, Seedream Txt2Img, Kling Motion Control
 * Limit: 20 requests per 10 seconds per account
 * HTTP 429 = rejected (not queued)
 */

const BUCKET_SIZE = 20;
const REFILL_INTERVAL_MS = 10000; // 10 seconds

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const bucket: TokenBucket = {
  tokens: BUCKET_SIZE,
  lastRefill: Date.now(),
};

/**
 * Refill tokens based on elapsed time
 */
const refillTokens = (): void => {
  const now = Date.now();
  const elapsed = now - bucket.lastRefill;

  if (elapsed >= REFILL_INTERVAL_MS) {
    const refillCycles = Math.floor(elapsed / REFILL_INTERVAL_MS);
    bucket.tokens = Math.min(BUCKET_SIZE, bucket.tokens + (refillCycles * BUCKET_SIZE));
    bucket.lastRefill = now - (elapsed % REFILL_INTERVAL_MS);
  }
};

/**
 * Check if a request can be made without waiting
 */
export const canMakeRequest = (): boolean => {
  refillTokens();
  return bucket.tokens > 0;
};

/**
 * Get current available tokens (for UI display)
 */
export const getAvailableTokens = (): number => {
  refillTokens();
  return bucket.tokens;
};

/**
 * Get time until next token available (in ms)
 */
export const getTimeUntilNextToken = (): number => {
  refillTokens();
  if (bucket.tokens > 0) return 0;

  const elapsed = Date.now() - bucket.lastRefill;
  return Math.max(0, REFILL_INTERVAL_MS - elapsed);
};

/**
 * Consume a token (call before making request)
 * Returns true if token was consumed, false if bucket empty
 */
export const consumeToken = (): boolean => {
  refillTokens();
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return true;
  }
  return false;
};

/**
 * Wait until a token is available, then consume it
 */
export const waitForSlot = async (): Promise<void> => {
  while (!canMakeRequest()) {
    const waitTime = getTimeUntilNextToken();
    console.log(`[KieRateLimiter] Waiting ${waitTime}ms for rate limit slot`);
    await new Promise(resolve => setTimeout(resolve, Math.max(100, waitTime)));
  }
  consumeToken();
};

/**
 * Reset the bucket (for testing)
 */
export const resetBucket = (): void => {
  bucket.tokens = BUCKET_SIZE;
  bucket.lastRefill = Date.now();
};
