# Database Version Policy - CRITICAL

## 🚨 NEVER INCREMENT DB VERSION WITHOUT MIGRATION

**IndexedDB deletes ALL data when version number increases.**

## Rules

### ❌ NEVER DO THIS:
```typescript
const newVersion = currentVersion < 3 ? 3 : currentVersion; // ❌ WIPES DATA
```

### ✅ ALWAYS DO THIS:
```typescript
// Only use current version, add tables conditionally
const newVersion = currentVersion === 0 ? 1 : currentVersion;

// Add new tables without version change
if (!db.objectStoreNames.contains('newTable')) {
  db.createObjectStore('newTable', ...);
}
```

## Adding New Tables

**Safe way (preserves all data):**

```typescript
request.onupgradeneeded = (event) => {
  const db = event.target.result;
  
  // Check if table exists before creating
  if (!db.objectStoreNames.contains('myNewTable')) {
    db.createObjectStore('myNewTable', { keyPath: 'id' });
  }
};
```

## If Version Increment is ABSOLUTELY Required

1. **Export all data first:**
```typescript
async function backupAllData() {
  const db = await openDB();
  const backup = {};
  
  for (const storeName of db.objectStoreNames) {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const all = await store.getAll();
    backup[storeName] = all;
  }
  
  // Save to localStorage or download as JSON
  localStorage.setItem('db_backup', JSON.stringify(backup));
  return backup;
}
```

2. **Restore after upgrade:**
```typescript
async function restoreBackup(backup: any) {
  const db = await openDB();
  
  for (const [storeName, data] of Object.entries(backup)) {
    if (!db.objectStoreNames.contains(storeName)) continue;
    
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    for (const item of data) {
      await store.put(item);
    }
  }
}
```

## Current Version: 1 (DO NOT CHANGE)

- Version 1: runs table
- New tables added without version increment:
  - pendingRequests (crash recovery)
  - costRecords (cost tracking)
  - videoCollections (future)
  - savedPayloads (future)

## Testing Before Deploy

Before any DB schema change:

1. Check current version in browser DevTools:
   ```javascript
   indexedDB.databases().then(console.log)
   ```

2. Export test data
3. Test migration locally
4. Verify no data loss
5. Only then deploy

## Emergency Recovery

If user loses data:

1. Check browser DevTools → Application → IndexedDB
2. Check localStorage for backups
3. Check if browser has older version cached
4. Worst case: apologize and add auto-backup going forward
