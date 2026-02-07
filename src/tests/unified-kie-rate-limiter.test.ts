import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canMakeRequest,
  consumeToken,
  getAvailableTokens,
  resetBucket,
  waitForSlot,
} from '../services/unified-kie-rate-limiter';

describe('unified-kie-rate-limiter', () => {
  beforeEach(() => {
    vi.clearAllTimers();
    resetBucket();
  });

  describe('canMakeRequest', () => {
    it('should return true when tokens are available', () => {
      resetBucket();
      expect(canMakeRequest()).toBe(true);
    });

    it('should return false when bucket is empty', () => {
      resetBucket();
      // Consume all 20 tokens
      for (let i = 0; i < 20; i++) {
        consumeToken();
      }
      expect(canMakeRequest()).toBe(false);
    });
  });

  describe('consumeToken', () => {
    it('should decrement token count', () => {
      resetBucket();
      const initialTokens = getAvailableTokens();
      const result = consumeToken();

      expect(result).toBe(true);
      expect(getAvailableTokens()).toBe(initialTokens - 1);
    });

    it('should return false when no tokens available', () => {
      resetBucket();
      // Consume all tokens
      for (let i = 0; i < 20; i++) {
        consumeToken();
      }

      const result = consumeToken();
      expect(result).toBe(false);
    });

    it('should not go below zero tokens', () => {
      resetBucket();
      // Try to consume more than available
      for (let i = 0; i < 25; i++) {
        consumeToken();
      }

      expect(getAvailableTokens()).toBe(0);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return current token count', () => {
      resetBucket();
      expect(getAvailableTokens()).toBe(20);

      consumeToken();
      expect(getAvailableTokens()).toBe(19);

      consumeToken();
      expect(getAvailableTokens()).toBe(18);
    });
  });

  describe('resetBucket', () => {
    it('should reset tokens to full capacity', () => {
      resetBucket();
      // Consume some tokens
      for (let i = 0; i < 10; i++) {
        consumeToken();
      }

      expect(getAvailableTokens()).toBe(10);

      resetBucket();
      expect(getAvailableTokens()).toBe(20);
    });
  });

  describe('token bucket behavior', () => {
    it('should allow 20 requests', () => {
      resetBucket();

      for (let i = 0; i < 20; i++) {
        expect(consumeToken()).toBe(true);
      }

      expect(getAvailableTokens()).toBe(0);
    });

    it('should block 21st request', () => {
      resetBucket();

      // Consume all 20 tokens
      for (let i = 0; i < 20; i++) {
        consumeToken();
      }

      // 21st request should be blocked
      expect(canMakeRequest()).toBe(false);
      expect(consumeToken()).toBe(false);
    });

    it('should refill tokens after interval', () => {
      vi.useFakeTimers();
      resetBucket();

      // Consume all tokens
      for (let i = 0; i < 20; i++) {
        consumeToken();
      }

      expect(getAvailableTokens()).toBe(0);

      // Advance time by 10 seconds (refill interval)
      vi.advanceTimersByTime(10000);

      // Tokens should be refilled
      expect(getAvailableTokens()).toBe(20);

      vi.useRealTimers();
    });

    it('should refill tokens proportionally to elapsed time', () => {
      vi.useFakeTimers();
      resetBucket();

      // Consume all tokens
      for (let i = 0; i < 20; i++) {
        consumeToken();
      }

      // Advance time by 5 seconds (half the refill interval)
      vi.advanceTimersByTime(5000);

      // No refill yet (need full 10 seconds)
      expect(getAvailableTokens()).toBe(0);

      // Advance another 5 seconds to complete the interval
      vi.advanceTimersByTime(5000);

      // Now should be refilled
      expect(getAvailableTokens()).toBe(20);

      vi.useRealTimers();
    });

    it('should handle partial refill cycles', () => {
      vi.useFakeTimers();
      resetBucket();

      // Consume 10 tokens
      for (let i = 0; i < 10; i++) {
        consumeToken();
      }

      expect(getAvailableTokens()).toBe(10);

      // Advance by 10 seconds
      vi.advanceTimersByTime(10000);

      // Should refill to max (20), not add 20 more
      expect(getAvailableTokens()).toBe(20);

      vi.useRealTimers();
    });
  });

  describe('waitForSlot', () => {
    it('should resolve immediately when tokens available', async () => {
      resetBucket();

      const startTokens = getAvailableTokens();
      await waitForSlot();

      // Should consume one token
      expect(getAvailableTokens()).toBe(startTokens - 1);
    });

    it('should wait when no tokens available', async () => {
      vi.useFakeTimers();
      resetBucket();

      // Consume all tokens
      for (let i = 0; i < 20; i++) {
        consumeToken();
      }

      const waitPromise = waitForSlot();

      // Fast-forward time
      vi.advanceTimersByTime(10000);

      await waitPromise;

      // Should have consumed one token after refill
      expect(getAvailableTokens()).toBe(19);

      vi.useRealTimers();
    });
  });
});
