import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchCreditBalance,
  getCreditBalanceWithStatus,
} from '../services/seedream-credit-service';

describe('seedream-credit-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('fetchCreditBalance', () => {
    it('should return balance on success', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 50.5,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const balance = await fetchCreditBalance('test-api-key');

      expect(balance).toBe(50.5);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.kie.ai/api/v1/chat/credit',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test-api-key',
          },
        })
      );
    });

    it('should throw on auth error (401)', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        fetchCreditBalance('invalid-key')
      ).rejects.toThrow('Authentication failed. Please check your Kie.ai API key.');
    });

    it('should throw on non-ok response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        fetchCreditBalance('test-key')
      ).rejects.toThrow('Failed to fetch credits: 500 Internal Server Error');
    });

    it('should throw on non-200 code in response', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 500,
          msg: 'Internal error',
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(
        fetchCreditBalance('test-key')
      ).rejects.toThrow('Failed to fetch credits: Internal error');
    });

    it('should handle zero balance', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 0,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const balance = await fetchCreditBalance('test-api-key');
      expect(balance).toBe(0);
    });
  });

  describe('getCreditBalanceWithStatus', () => {
    it('should return normal status for high balance', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 50,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await getCreditBalanceWithStatus('test-api-key');

      expect(result).toEqual({
        balance: 50,
        isLow: false,
        isCritical: false,
      });
    });

    it('should return low status when balance < 10', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 5,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await getCreditBalanceWithStatus('test-api-key');

      expect(result).toEqual({
        balance: 5,
        isLow: true,
        isCritical: false,
      });
    });

    it('should return critical status when balance < 3', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 2,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await getCreditBalanceWithStatus('test-api-key');

      expect(result).toEqual({
        balance: 2,
        isLow: true,
        isCritical: true,
      });
    });

    it('should handle exact threshold values', async () => {
      // Test balance = 10 (boundary)
      let mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 10,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      let result = await getCreditBalanceWithStatus('test-api-key');
      expect(result.isLow).toBe(false);

      // Test balance = 9.99 (just below)
      mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 9.99,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      result = await getCreditBalanceWithStatus('test-api-key');
      expect(result.isLow).toBe(true);

      // Test balance = 3 (boundary)
      mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 3,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      result = await getCreditBalanceWithStatus('test-api-key');
      expect(result.isCritical).toBe(false);

      // Test balance = 2.99 (just below)
      mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 2.99,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      result = await getCreditBalanceWithStatus('test-api-key');
      expect(result.isCritical).toBe(true);
    });

    it('should handle zero balance as critical', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          code: 200,
          data: 0,
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const result = await getCreditBalanceWithStatus('test-api-key');

      expect(result).toEqual({
        balance: 0,
        isLow: true,
        isCritical: true,
      });
    });
  });
});
