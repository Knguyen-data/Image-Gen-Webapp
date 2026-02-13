/**
 * React Hook for Seedream Credit Balance Management
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchCreditBalance } from '../services/seedream-credit-service';

export interface UseSeedreamCreditsResult {
  credits: number | null;
  loading: boolean;
  error: string | null;
  isLow: boolean;
  isCritical: boolean;
  refresh: () => Promise<void>;
}

export const useSeedreamCredits = (
  apiKey: string | null,
  spicyModeEnabled: boolean
): UseSeedreamCreditsResult => {
  const [credits, setCredits] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!apiKey) {
      setCredits(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const balance = await fetchCreditBalance(apiKey);
      setCredits(balance);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch credits';
      setError(message);
      console.error('[useSeedreamCredits] Error:', message);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  // Auto-fetch whenever API key exists (works for both spicy mode and video mode)
  useEffect(() => {
    let cancelled = false;

    if (apiKey) {
      setLoading(true);
      setError(null);
      fetchCreditBalance(apiKey)
        .then((balance) => {
          if (!cancelled) setCredits(balance);
        })
        .catch((err) => {
          if (!cancelled) {
            const message = err instanceof Error ? err.message : 'Failed to fetch credits';
            setError(message);
            console.error('[useSeedreamCredits] Error:', message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setCredits(null);
      setError(null);
    }

    return () => { cancelled = true; };
  }, [apiKey]);

  return {
    credits,
    loading,
    error,
    isLow: credits !== null && credits < 10,
    isCritical: credits !== null && credits < 3,
    refresh,
  };
};
