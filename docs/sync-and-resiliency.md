# Supabase Sync & Data Resiliency

This document describes the enhanced data syncing and backup systems implemented for Raw Studio.

## Overview

The app now has a multi-layered approach to data persistence and syncing:

1. **IndexedDB** - Primary local storage for runs, videos, and settings
2. **Supabase Sync Service** - Bidirectional cloud sync with offline queue
3. **Resilient DB Operations** - Retry logic and error recovery
4. **Auto-Backup System** - Periodic localStorage backups

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React App     │────▶│  Resilient DB    │────▶│   IndexedDB     │
│                 │     │   Operations     │     │   (Primary)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │                           │
                                ▼                           ▼
                       ┌──────────────────┐     ┌─────────────────┐
                       │  Sync Service    │────▶│  Supabase       │
                       │  (Offline Queue) │     │  (Cloud)        │
                       └──────────────────┘     └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │  Auto-Backup     │
                       │  (localStorage)  │
                       └──────────────────┘
```

## Services

### 1. Supabase Sync Service (`supabase-sync-service.ts`)

Manages bidirectional sync between IndexedDB and Supabase.

**Features:**
- Automatic sync queue for offline support
- Configurable sync intervals (default: 30s)
- Conflict resolution strategies (local-wins, remote-wins, newest-wins)
- Retry logic with exponential backoff
- State subscription for UI updates

**Usage:**
```typescript
import { getSyncService } from './services/supabase-sync-service';

// Get singleton instance
const syncService = getSyncService();

// Queue an operation for sync
syncService.enqueue('runs', 'create', run.id, run);

// Manual sync trigger
const { success, failed } = await syncService.sync();

// Subscribe to state changes
const unsubscribe = syncService.subscribe((state) => {
  console.log('Pending:', state.pendingCount);
  console.log('Online:', state.isOnline);
});
```

**React Hook:**
```typescript
import { useSupabaseSync } from './hooks/use-supabase-sync';

function SyncStatus() {
  const { isOnline, isSyncing, pendingCount, sync } = useSupabaseSync();
  
  return (
    <div>
      {isOnline ? '🟢' : '🔴'} {isSyncing ? 'Syncing...' : ''}
      {pendingCount > 0 && `${pendingCount} pending`}
    </div>
  );
}
```

### 2. Resilient DB Operations (`db-resilient.ts`)

Wraps IndexedDB operations with retry logic and error recovery.

**Features:**
- Automatic retry with exponential backoff
- Offline operation queueing
- Transaction safety
- Data integrity verification
- Storage usage statistics

**Usage:**
```typescript
import { resilientDB } from './services/db-resilient';

// Initialize
resilientDB.init();

// Save with retry
const success = await resilientDB.saveRun(run);

// Bulk save with transaction safety
const result = await resilientDB.bulkSave(runs);

// Verify data integrity
const { healthy, issues } = await resilientDB.verifyIntegrity();

// Get storage stats
const stats = await resilientDB.getStats();
```

**React Hook:**
```typescript
import { useResilientDB } from './hooks/use-resilient-db';

function RunsList() {
  const { runs, isLoading, saveRun, deleteRun, refresh } = useResilientDB();
  
  useEffect(() => {
    refresh();
  }, []);
  
  // ... render runs
}
```

### 3. Enhanced Backup System (`db-backup.ts`)

Improved backup with retry logic and integrity checking.

**Features:**
- Automatic retry on failure
- Checksum verification
- Export/import to file
- Cross-device metadata sync
- Storage quota awareness

**Usage:**
```typescript
import { 
  createBackup, 
  restoreBackup, 
  exportBackupToFile,
  getBackupInfo 
} from './services/db-backup';

// Create backup with retry
await createBackup();

// Get backup info
const { exists, timestamp, age } = getBackupInfo();

// Export to file
exportBackupToFile();

// Restore from backup
await restoreBackup();
```

### 4. Enhanced Logger (`logger.ts`)

Now logs errors and warnings to Supabase for analytics.

**Features:**
- Automatic Supabase logging for warn/error
- Log history (500 entries)
- API call tracking
- Configurable log levels

**Usage:**
```typescript
import { logger } from './services/logger';

// These automatically log to Supabase
logger.warn('Context', 'Something might be wrong');
logger.error('Context', 'Something went wrong', error);

// Track API calls
await logger.logApiCall('gemini', 'generate', 10, { prompt: '...' });
```

## Database Schema

### Supabase Tables

**generations** - Image generation metadata
- `id`, `user_id`, `run_id`, `prompt`, `model`
- `image_count`, `status`, `settings_snapshot`
- `thumbnail_url`, `created_at`

**usage_logs** - Analytics and error tracking
- `id`, `user_id`, `provider`, `action`
- `credits_consumed`, `metadata`, `created_at`

**user_settings** - User preferences
- `id`, `user_id`, `settings`, `video_settings`
- `created_at`, `updated_at`

## Configuration

### Environment Variables

```bash
# Required for Supabase sync
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Sync Configuration

```typescript
const syncService = getSyncService({
  enabled: true,
  autoSync: true,
  syncInterval: 30000,    // 30 seconds
  batchSize: 50,
  conflictStrategy: 'newest-wins',
  maxRetries: 3,
  retryDelay: 5000,
});
```

## Offline Support

When the app goes offline:

1. Operations are queued in memory
2. Queue is persisted to localStorage
3. UI shows offline indicator
4. When back online, queue is processed automatically

## Conflict Resolution

When the same record is modified locally and remotely:

- **local-wins**: Keep local version
- **remote-wins**: Keep remote version  
- **newest-wins**: Keep version with latest timestamp (default)
- **manual**: Flag for manual resolution

## Error Handling

All services follow consistent error handling:

1. **Retry**: Transient errors are retried with exponential backoff
2. **Queue**: Failed operations are queued for later retry
3. **Log**: Errors are logged to console and Supabase
4. **Graceful Degradation**: App continues working offline

## Best Practices

### For Developers

1. Always use resilient DB operations for critical data
2. Queue sync operations after local save
3. Handle sync state in UI (loading indicators)
4. Test offline scenarios
5. Monitor Supabase logs for errors

### For Users

1. Keep the app open during sync
2. Check sync status indicator
3. Use backup export before major operations
4. Ensure stable internet for initial sync

## Monitoring

Monitor sync health via:

1. **Console logs** - Real-time operation status
2. **Supabase logs** - Aggregated errors and analytics
3. **Sync state** - Pending/failed counts in UI
4. **Storage stats** - Database size and quota usage

## Troubleshooting

### Sync not working
- Check Supabase credentials
- Verify network connection
- Check browser console for errors

### Data not appearing
- Wait for sync to complete
- Check pending operations count
- Try manual sync trigger

### Storage quota exceeded
- Delete old runs
- Export and clear backup
- Check storage stats

## Future Enhancements

- [ ] Delta sync for large datasets
- [ ] Compression for network transfer
- [ ] Selective sync (choose what to sync)
- [ ] Sync history and rollback
- [ ] Multi-device conflict UI
