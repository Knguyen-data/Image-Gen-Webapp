/**
 * React Hook for Resilient Database Operations
 * Provides resilient save/load operations with error handling and retry logic
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { Run } from '../types';
import {
  resilientSaveRun,
  resilientDeleteRun,
  resilientGetAllRuns,
  resilientGetRun,
  resilientBulkSave,
  verifyDataIntegrity,
  repairData,
  getStorageStats,
  initResilientDB,
} from '../services/db-resilient';

interface UseResilientDBReturn {
  // State
  runs: Run[];
  isLoading: boolean;
  error: Error | null;
  stats: {
    runs: number;
    estimatedSize: string;
    quota?: { used: number; total: number };
  } | null;
  integrity: {
    healthy: boolean;
    issues: string[];
    totalRecords: number;
  } | null;
  
  // Actions
  loadRuns: () => Promise<void>;
  saveRun: (run: Run) => Promise<boolean>;
  deleteRun: (id: string) => Promise<boolean>;
  getRun: (id: string) => Promise<Run | null>;
  bulkSave: (runs: Run[]) => Promise<{ success: number; failed: number }>;
  refresh: () => Promise<void>;
  
  // Maintenance
  verifyIntegrity: () => Promise<void>;
  repair: () => Promise<{ repaired: number; removed: number }>;
  getStats: () => Promise<void>;
}

export function useResilientDB(): UseResilientDBReturn {
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [stats, setStats] = useState<UseResilientDBReturn['stats']>(null);
  const [integrity, setIntegrity] = useState<UseResilientDBReturn['integrity']>(null);
  const initialized = useRef(false);

  // Initialize on first use
  useEffect(() => {
    if (!initialized.current) {
      initResilientDB();
      initialized.current = true;
    }
  }, []);

  // Load all runs
  const loadRuns = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await resilientGetAllRuns();
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Save a run
  const saveRun = useCallback(async (run: Run): Promise<boolean> => {
    setError(null);
    
    try {
      const success = await resilientSaveRun(run);
      if (success) {
        setRuns(prev => {
          const exists = prev.find(r => r.id === run.id);
          if (exists) {
            return prev.map(r => r.id === run.id ? run : r);
          }
          return [run, ...prev];
        });
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }, []);

  // Delete a run
  const deleteRun = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    
    try {
      const success = await resilientDeleteRun(id);
      if (success) {
        setRuns(prev => prev.filter(r => r.id !== id));
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }, []);

  // Get a single run
  const getRun = useCallback(async (id: string): Promise<Run | null> => {
    try {
      return await resilientGetRun(id);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }, []);

  // Bulk save runs
  const bulkSave = useCallback(async (newRuns: Run[]): Promise<{ success: number; failed: number }> => {
    setError(null);
    
    try {
      const result = await resilientBulkSave(newRuns);
      await loadRuns(); // Refresh the list
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return { success: 0, failed: newRuns.length };
    }
  }, [loadRuns]);

  // Refresh data
  const refresh = useCallback(async () => {
    await loadRuns();
  }, [loadRuns]);

  // Verify data integrity
  const checkIntegrity = useCallback(async () => {
    try {
      const result = await verifyDataIntegrity();
      setIntegrity(result);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  // Repair data
  const repair = useCallback(async (): Promise<{ repaired: number; removed: number }> => {
    try {
      const result = await repairData();
      await loadRuns(); // Refresh after repair
      return result;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      return { repaired: 0, removed: 0 };
    }
  }, [loadRuns]);

  // Get storage stats
  const loadStats = useCallback(async () => {
    try {
      const data = await getStorageStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  return {
    runs,
    isLoading,
    error,
    stats,
    integrity,
    loadRuns,
    saveRun,
    deleteRun,
    getRun,
    bulkSave,
    refresh,
    verifyIntegrity: checkIntegrity,
    repair,
    getStats: loadStats,
  };
}

export default useResilientDB;
