/**
 * React Hook for Supabase Sync
 * Provides sync state, manual sync triggers, and queue management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getSyncService, 
  type SyncState, 
  type SyncQueueEntry,
  type SyncConfig 
} from '../services/supabase-sync-service';

interface UseSupabaseSyncReturn {
  // State
  state: SyncState;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: number | null;
  
  // Actions
  sync: () => Promise<{ success: number; failed: number }>;
  startAutoSync: () => void;
  stopAutoSync: () => void;
  clearQueue: () => void;
  
  // Queue inspection
  queue: SyncQueueEntry[];
  failedEntries: SyncQueueEntry[];
  
  // Configuration
  updateConfig: (config: Partial<SyncConfig>) => void;
}

export function useSupabaseSync(): UseSupabaseSyncReturn {
  const syncServiceRef = useRef(getSyncService());
  const [state, setState] = useState<SyncState>(syncServiceRef.current.getState());
  const [queue, setQueue] = useState<SyncQueueEntry[]>([]);

  // Subscribe to sync state changes
  useEffect(() => {
    const syncService = syncServiceRef.current;
    
    // Initial state
    setState(syncService.getState());
    setQueue(syncService.getQueue());
    
    // Subscribe to changes
    const unsubscribe = syncService.subscribe((newState) => {
      setState(newState);
      setQueue(syncService.getQueue());
    });

    return unsubscribe;
  }, []);

  // Manual sync trigger
  const sync = useCallback(async () => {
    return syncServiceRef.current.sync();
  }, []);

  // Auto sync controls
  const startAutoSync = useCallback(() => {
    syncServiceRef.current.startAutoSync();
  }, []);

  const stopAutoSync = useCallback(() => {
    syncServiceRef.current.stopAutoSync();
  }, []);

  // Clear queue
  const clearQueue = useCallback(() => {
    syncServiceRef.current.clearQueue();
  }, []);

  // Update config
  const updateConfig = useCallback((config: Partial<SyncConfig>) => {
    syncServiceRef.current.updateConfig(config);
  }, []);

  // Derived state
  const failedEntries = queue.filter(e => e.status === 'failed');

  return {
    state,
    isOnline: state.isOnline,
    isSyncing: state.isSyncing,
    pendingCount: state.pendingCount,
    failedCount: state.failedCount,
    lastSyncAt: state.lastSyncAt,
    sync,
    startAutoSync,
    stopAutoSync,
    clearQueue,
    queue,
    failedEntries,
    updateConfig,
  };
}

export default useSupabaseSync;
