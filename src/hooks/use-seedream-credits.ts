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
    if (!apiKey || !spicyModeEnabled) {
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
  }, [apiKey, spicyModeEnabled]);

  // Auto-fetch on spicy mode activation or API key change
  useEffect(() => {
    if (spicyModeEnabled && apiKey) {
      refresh();
    } else {
      setCredits(null);
      setError(null);
    }
  }, [spicyModeEnabled, apiKey, refresh]);

  return {
    credits,
    loading,
    error,
    isLow: credits !== null && credits < 10,
    isCritical: credits !== null && credits < 3,
    refresh,
  };
};
