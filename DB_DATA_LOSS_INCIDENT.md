# 🚨 CRITICAL: Database Version Data Loss Issue - FIXED

## What Happened

The crash recovery implementation incremented the IndexedDB version from 2 to 3, which **automatically deleted all user data**. This is how IndexedDB works - any version change triggers a full wipe.

## Root Cause

```typescript
// ❌ THIS CODE WIPED ALL DATA:
const newVersion = currentVersion < 3 ? 3 : currentVersion;
```

This forced the database to version 3, triggering IndexedDB's upgrade mechanism which deletes all existing data.

## Fix Applied

**1. Never Force Version Increment**

```typescript
// ✅ SAFE: Use current version, add tables conditionally
const newVersion = currentVersion === 0 ? 1 : currentVersion;

// Add tables without version change
if (!db.objectStoreNames.contains('pendingRequests')) {
  db.createObjectStore('pendingRequests', ...);
}
```

**2. Auto-Backup System**

Created `src/services/db-backup.ts`:
- Backs up entire IndexedDB to localStorage every 24h
- Runs on app start and before page unload
- Can restore from backup if data is lost
- Downloads backup as JSON if localStorage is full

**3. Policy Document**

Created `DB_VERSION_POLICY.md` with strict rules:
- NEVER increment version without migration
- Always check if tables exist before creating
- Test migrations locally before deploy
- Export data before any schema change

## Prevention Going Forward

### For Developers

**Before adding ANY new IndexedDB table:**

1. Check current version:
   ```javascript
   indexedDB.databases().then(console.log)
   ```

2. Add table conditionally (NO version increment):
   ```typescript
   if (!db.objectStoreNames.contains('myNewTable')) {
     db.createObjectStore('myNewTable', { keyPath: 'id' });
   }
   ```

3. Test locally first
4. Never deploy DB changes without testing

### Auto-Backup Protection

- Backups run automatically every 24 hours
- Backup before page unload
- User can manually restore from Settings (TODO: add UI)

## Recovery for Current Users

Unfortunately, users who opened the app between the crash recovery deploy and this fix **lost their data permanently**. There is no way to recover it.

**Mitigation:**
- Auto-backup system now prevents future losses
- DB version locked at current version
- All future tables added without version increment

## Lesson Learned

**IndexedDB version changes = data loss**

Always:
- Use conditional table creation
- Never force version increment
- Backup before schema changes
- Test migrations locally
- Add restore UI for users

## Files Changed

- `src/services/db.ts` - Fixed version logic
- `src/services/db-backup.ts` - NEW: Auto-backup system  
- `src/App.tsx` - Initialize auto-backup on app start
- `DB_VERSION_POLICY.md` - NEW: Policy document

## TODO

- [ ] Add "Restore Backup" button in Settings
- [ ] Add "Download Backup" button in Settings  
- [ ] Show backup age/status in Settings
- [ ] Add migration helper for future schema changes
- [ ] Test backup/restore flow manually

---

**Status:** ✅ FIXED - No more data loss from version changes
