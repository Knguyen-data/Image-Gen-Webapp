// Check for any possible data recovery
// Run this in browser console

(async () => {
  console.log('=== Data Recovery Check ===');
  
  // 1. Check all IndexedDB databases
  const dbs = await indexedDB.databases();
  console.log('Available databases:', dbs);
  
  // 2. Check localStorage for backup
  const backupKey = 'indexeddb_backup';
  const backup = localStorage.getItem(backupKey);
  if (backup) {
    console.log('✅ BACKUP FOUND in localStorage!');
    console.log('Backup size:', backup.length, 'chars');
    try {
      const parsed = JSON.parse(backup);
      console.log('Backup timestamp:', new Date(parsed.timestamp));
      console.log('Backup stores:', Object.keys(parsed.stores));
      console.log('Backup items:', 
        Object.entries(parsed.stores).map(([name, data]) => 
          `${name}: ${data.length} items`
        )
      );
    } catch (e) {
      console.error('Backup parse error:', e);
    }
  } else {
    console.log('❌ No backup found in localStorage');
  }
  
  // 3. Check for old fal_api_key (legacy)
  const oldKeys = [
    'raw_studio_api_key',
    'raw_studio_kie_api_key', 
    'freepik_api_key',
    'fal_api_key'
  ];
  console.log('\nAPI Keys:');
  oldKeys.forEach(key => {
    const val = localStorage.getItem(key);
    console.log(`${key}: ${val ? '✅ exists' : '❌ missing'}`);
  });
  
  // 4. Check current DB contents
  const request = indexedDB.open('RAW_STUDIO_DB');
  request.onsuccess = () => {
    const db = request.result;
    console.log('\nCurrent DB version:', db.version);
    console.log('Object stores:', Array.from(db.objectStoreNames));
    
    // Count items in each store
    Array.from(db.objectStoreNames).forEach(storeName => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const countReq = store.count();
      countReq.onsuccess = () => {
        console.log(`${storeName}: ${countReq.result} items`);
      };
    });
    
    db.close();
  };
  
  // 5. Check video DB
  const videoReq = indexedDB.open('VIDEO_STORAGE_DB');
  videoReq.onsuccess = () => {
    const db = videoReq.result;
    console.log('\nVideo DB version:', db.version);
    console.log('Video stores:', Array.from(db.objectStoreNames));
    
    if (db.objectStoreNames.contains('generatedVideos')) {
      const tx = db.transaction('generatedVideos', 'readonly');
      const store = tx.objectStore('generatedVideos');
      const countReq = store.count();
      countReq.onsuccess = () => {
        console.log(`generatedVideos: ${countReq.result} items`);
      };
    }
    
    db.close();
  };
  
  console.log('\n=== Check complete. See results above. ===');
})();
