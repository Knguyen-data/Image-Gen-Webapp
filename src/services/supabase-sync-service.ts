/**
 * Supabase Sync Service
 * Provides bidirectional sync between IndexedDB (local) and Supabase (cloud)
 * with offline support, retry logic, and conflict resolution.
 */

import { supabase } from './supabase';
import { logger } from './logger';
import type { Database } from '../types/supabase';
import type { Run } from '../types';

// Sync operation types
export type SyncEntityType = 'runs' | 'settings' | 'videoCollections' | 'pendingRequests';
export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncStatus = 'pending' | 'syncing' | 'completed' | 'failed' | 'conflict';

// Sync queue entry for offline support
export interface SyncQueueEntry {
  id: string;
  entityType: SyncEntityType;
  operation: SyncOperation;
  localId: string;
  data: unknown;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  status: SyncStatus;
  error?: string;
  resolvedAt?: number;
}

// Sync state tracking
export interface SyncState {
  lastSyncAt: number | null;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
}

// Conflict resolution strategy
export type ConflictStrategy = 'local-wins' | 'remote-wins' | 'newest-wins' | 'manual';

// Sync configuration
export interface SyncConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number; // ms
  batchSize: number;
  conflictStrategy: ConflictStrategy;
  maxRetries: number;
  retryDelay: number; // ms
}

const DEFAULT_CONFIG: SyncConfig = {
  enabled: true,
  autoSync: true,
  syncInterval: 30000, // 30 seconds
  batchSize: 50,
  conflictStrategy: 'newest-wins',
  maxRetries: 3,
  retryDelay: 5000,
};

// In-memory sync queue (backed by localStorage for persistence)
const SYNC_QUEUE_KEY = 'raw_studio_sync_queue';
const SYNC_STATE_KEY = 'raw_studio_sync_state';

class SupabaseSyncService {
  private config: SyncConfig;
  private syncIntervalId: number | null = null;
  private listeners: Set<(state: SyncState) => void> = new Set();
  private syncQueue: SyncQueueEntry[] = [];
  private state: SyncState = {
    lastSyncAt: null,
    isOnline: navigator.onLine,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
  };

  constructor(config: Partial<SyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadQueue();
    this.loadState();
    this.setupNetworkListeners();
    
    if (this.config.autoSync && this.config.enabled) {
      this.startAutoSync();
    }
  }

  // ==================== Configuration ====================

  updateConfig(config: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (this.config.autoSync && !this.syncIntervalId) {
      this.startAutoSync();
    } else if (!this.config.autoSync && this.syncIntervalId) {
      this.stopAutoSync();
    }
  }

  getConfig(): SyncConfig {
    return { ...this.config };
  }

  // ==================== Network State ====================

  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.state.isOnline = true;
      this.notifyListeners();
      logger.info('SyncService', 'Back online, triggering sync');
      this.sync();
    });

    window.addEventListener('offline', () => {
      this.state.isOnline = false;
      this.notifyListeners();
      logger.warn('SyncService', 'Gone offline, queuing operations');
    });
  }

  isOnline(): boolean {
    return this.state.isOnline;
  }

  // ==================== Queue Management ====================

  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(SYNC_QUEUE_KEY);
      if (stored) {
        this.syncQueue = JSON.parse(stored);
        this.updateStateFromQueue();
      }
    } catch (err) {
      logger.error('SyncService', 'Failed to load sync queue', err);
    }
  }

  private saveQueue(): void {
    try {
      localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(this.syncQueue));
      this.updateStateFromQueue();
    } catch (err) {
      logger.error('SyncService', 'Failed to save sync queue', err);
    }
  }

  private loadState(): void {
    try {
      const stored = localStorage.getItem(SYNC_STATE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = { ...this.state, ...parsed };
      }
    } catch (err) {
      logger.error('SyncService', 'Failed to load sync state', err);
    }
  }

  private saveState(): void {
    try {
      localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({
        lastSyncAt: this.state.lastSyncAt,
      }));
    } catch (err) {
      logger.error('SyncService', 'Failed to save sync state', err);
    }
  }

  private updateStateFromQueue(): void {
    this.state.pendingCount = this.syncQueue.filter(q => q.status === 'pending').length;
    this.state.failedCount = this.syncQueue.filter(q => q.status === 'failed').length;
    this.notifyListeners();
  }

  // ==================== Queue Operations ====================

  enqueue(
    entityType: SyncEntityType,
    operation: SyncOperation,
    localId: string,
    data: unknown
  ): string {
    const entry: SyncQueueEntry = {
      id: crypto.randomUUID(),
      entityType,
      operation,
      localId,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      status: 'pending',
    };

    this.syncQueue.push(entry);
    this.saveQueue();
    
    logger.debug('SyncService', `Enqueued ${operation} for ${entityType}:${localId}`);
    
    // Trigger immediate sync if online
    if (this.state.isOnline && !this.state.isSyncing) {
      this.sync();
    }
    
    return entry.id;
  }

  removeFromQueue(entryId: string): void {
    this.syncQueue = this.syncQueue.filter(e => e.id !== entryId);
    this.saveQueue();
  }

  clearQueue(): void {
    this.syncQueue = [];
    this.saveQueue();
    logger.info('SyncService', 'Sync queue cleared');
  }

  getQueue(): SyncQueueEntry[] {
    return [...this.syncQueue];
  }

  getPendingEntries(): SyncQueueEntry[] {
    return this.syncQueue.filter(e => e.status === 'pending');
  }

  getFailedEntries(): SyncQueueEntry[] {
    return this.syncQueue.filter(e => e.status === 'failed');
  }

  // ==================== Sync Operations ====================

  async sync(): Promise<{ success: number; failed: number }> {
    if (!this.config.enabled) {
      logger.debug('SyncService', 'Sync disabled, skipping');
      return { success: 0, failed: 0 };
    }

    if (!this.state.isOnline) {
      logger.debug('SyncService', 'Offline, skipping sync');
      return { success: 0, failed: 0 };
    }

    if (this.state.isSyncing) {
      logger.debug('SyncService', 'Sync already in progress');
      return { success: 0, failed: 0 };
    }

    this.state.isSyncing = true;
    this.notifyListeners();

    const pending = this.getPendingEntries();
    if (pending.length === 0) {
      this.state.isSyncing = false;
      this.notifyListeners();
      return { success: 0, failed: 0 };
    }

    logger.info('SyncService', `Starting sync of ${pending.length} items`);
    
    let success = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < pending.length; i += this.config.batchSize) {
      const batch = pending.slice(i, i + this.config.batchSize);
      
      await Promise.all(batch.map(async (entry) => {
        try {
          await this.processEntry(entry);
          entry.status = 'completed';
          entry.resolvedAt = Date.now();
          success++;
        } catch (err) {
          entry.retryCount++;
          if (entry.retryCount >= entry.maxRetries) {
            entry.status = 'failed';
            entry.error = err instanceof Error ? err.message : 'Unknown error';
            failed++;
          } else {
            entry.status = 'pending'; // Will retry
          }
        }
      }));
    }

    // Clean up completed entries
    this.syncQueue = this.syncQueue.filter(e => e.status !== 'completed');
    this.saveQueue();
    
    this.state.lastSyncAt = Date.now();
    this.state.isSyncing = false;
    this.saveState();
    this.notifyListeners();

    logger.info('SyncService', `Sync completed: ${success} success, ${failed} failed`);
    
    return { success, failed };
  }

  private async processEntry(entry: SyncQueueEntry): Promise<void> {
    switch (entry.entityType) {
      case 'runs':
        await this.syncRun(entry);
        break;
      case 'settings':
        await this.syncSettings(entry);
        break;
      case 'videoCollections':
        await this.syncVideoCollection(entry);
        break;
      default:
        throw new Error(`Unknown entity type: ${entry.entityType}`);
    }
  }

  // ==================== Entity-Specific Sync ====================

  private async syncRun(entry: SyncQueueEntry): Promise<void> {
    const run = entry.data as Run;
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const dbRun: Database['public']['Tables']['generations']['Insert'] = {
      user_id: user.id,
      run_id: run.id,
      prompt: run.finalPrompt || run.promptRaw,
      model: 'unknown', // Model info is in settingsSnapshot
      image_count: run.images?.length || 0,
      status: 'completed',
      settings_snapshot: (run.settingsSnapshot || {}) as any,
      thumbnail_url: run.images?.[0]?.thumbnailBase64 || null,
    };

    const { error } = await supabase
      .from('generations')
      .upsert(dbRun, { onConflict: 'run_id' });

    if (error) {
      throw new Error(`Failed to sync run: ${error.message}`);
    }
  }

  private async syncSettings(entry: SyncQueueEntry): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: user.id,
        settings: entry.data as any,
        updated_at: new Date().toISOString(),
      } as any, { onConflict: 'user_id' });

    if (error) {
      throw new Error(`Failed to sync settings: ${error.message}`);
    }
  }

  private async syncVideoCollection(entry: SyncQueueEntry): Promise<void> {
    // Video collections are stored in IndexedDB only for now
    // Can be extended to sync to Supabase if needed
    logger.debug('SyncService', 'Video collection sync not implemented yet');
  }

  // ==================== Pull from Cloud ====================

  async pullRuns(since?: number): Promise<Run[]> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    let query = supabase
      .from('generations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (since) {
      const sinceDate = new Date(since).toISOString();
      query = query.gt('created_at', sinceDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to pull runs: ${error.message}`);
    }

    // Map Supabase rows to local Run type
    return (data || []).map(row => this.mapDbRunToLocal(row));
  }

  async pullSettings(): Promise<unknown | null> {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      throw new Error('User not authenticated');
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // No rows
      throw new Error(`Failed to pull settings: ${error.message}`);
    }

    return data?.settings || null;
  }

  private mapDbRunToLocal(row: Database['public']['Tables']['generations']['Row']): Run {
    const settings = row.settings_snapshot as Record<string, unknown> || {};
    
    return {
      id: row.run_id,
      name: row.prompt.slice(0, 50),
      createdAt: new Date(row.created_at).getTime(),
      promptRaw: row.prompt,
      fixedBlockUsed: false,
      finalPrompt: row.prompt,
      settingsSnapshot: settings as any,
      images: [], // Images not stored in Supabase, only metadata
    };
  }

  // ==================== Auto Sync ====================

  startAutoSync(): void {
    if (this.syncIntervalId) return;
    
    this.syncIntervalId = window.setInterval(() => {
      if (this.state.isOnline && !this.state.isSyncing) {
        this.sync();
      }
    }, this.config.syncInterval);
    
    logger.info('SyncService', `Auto-sync started (${this.config.syncInterval}ms interval)`);
  }

  stopAutoSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      logger.info('SyncService', 'Auto-sync stopped');
    }
  }

  // ==================== State Listeners ====================

  getState(): SyncState {
    return { ...this.state };
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state); // Initial state
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener({ ...this.state });
      } catch (err) {
        logger.error('SyncService', 'Listener error', err);
      }
    }
  }

  // ==================== Logging to Supabase ====================

  async logToSupabase(
    level: 'debug' | 'info' | 'warn' | 'error',
    context: string,
    message: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Only log errors and warnings to Supabase to avoid spam
      if (level === 'debug' || level === 'info') {
        return;
      }

      const { error } = await supabase
        .from('usage_logs')
        .insert({
          user_id: user?.id || 'anonymous',
          provider: 'app',
          action: `log:${level}`,
          credits_consumed: 0,
          metadata: {
            context,
            message,
            ...metadata,
            userAgent: navigator.userAgent,
            timestamp: Date.now(),
          },
        });

      if (error) {
        logger.warn('SyncService', 'Failed to log to Supabase', error);
      }
    } catch (err) {
      // Silent fail - don't break the app if logging fails
      logger.warn('SyncService', 'Exception logging to Supabase', err);
    }
  }
}

// Singleton instance
let syncServiceInstance: SupabaseSyncService | null = null;

export function getSyncService(config?: Partial<SyncConfig>): SupabaseSyncService {
  if (!syncServiceInstance) {
    syncServiceInstance = new SupabaseSyncService(config);
  } else if (config) {
    syncServiceInstance.updateConfig(config);
  }
  return syncServiceInstance;
}

export function resetSyncService(): void {
  if (syncServiceInstance) {
    syncServiceInstance.stopAutoSync();
    syncServiceInstance = null;
  }
}

// Export singleton methods for convenience
export const syncService = {
  get instance() {
    return getSyncService();
  },
};

export default SupabaseSyncService;
