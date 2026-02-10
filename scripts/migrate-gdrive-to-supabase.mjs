#!/usr/bin/env node
/**
 * migrate-gdrive-to-supabase.mjs
 * 
 * Downloads all stock videos from a Google Drive folder (with subfolders as categories)
 * and uploads them to Supabase Storage under media/stock/{category}/{filename}.
 *
 * Usage:
 *   node scripts/migrate-gdrive-to-supabase.mjs
 *   node scripts/migrate-gdrive-to-supabase.mjs --dry-run    # list files without uploading
 *   node scripts/migrate-gdrive-to-supabase.mjs --category luxury  # only migrate one category
 *
 * Requires .env with:
 *   VITE_GOOGLE_DRIVE_API_KEY
 *   VITE_GOOGLE_DRIVE_FOLDER_ID
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

// ── Config ──────────────────────────────────────────────────────────────
const DRIVE_API_KEY = process.env.VITE_GOOGLE_DRIVE_API_KEY;
const DRIVE_FOLDER_ID = process.env.VITE_GOOGLE_DRIVE_FOLDER_ID;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUCKET = 'media';
const STOCK_PREFIX = 'stock';
const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_CATEGORY = args.find((a, i) => args[i - 1] === '--category') || null;
const SKIP_EXISTING = !args.includes('--force'); // skip already-uploaded files by default

// ── Validate ────────────────────────────────────────────────────────────
if (!DRIVE_API_KEY || !DRIVE_FOLDER_ID) {
  console.error('❌ Missing VITE_GOOGLE_DRIVE_API_KEY or VITE_GOOGLE_DRIVE_FOLDER_ID in .env');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Google Drive helpers ────────────────────────────────────────────────
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

async function driveList(folderId, pageToken) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken, files(id, name, mimeType, size)',
    pageSize: '100',
    orderBy: 'name',
    key: DRIVE_API_KEY,
  });
  if (pageToken) params.set('pageToken', pageToken);

  const res = await fetch(`${DRIVE_API}/files?${params}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive API ${res.status}: ${text}`);
  }
  return res.json();
}

async function driveListAll(folderId) {
  const files = [];
  let pageToken;
  do {
    const data = await driveList(folderId, pageToken);
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function driveDownload(fileId) {
  const url = `${DRIVE_API}/files/${fileId}?alt=media&key=${DRIVE_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Drive download ${res.status} for ${fileId}`);
  }
  return res;
}

// ── Supabase helpers ────────────────────────────────────────────────────
async function supabaseFileExists(path) {
  // List the parent folder and check if file exists
  const parts = path.split('/');
  const fileName = parts.pop();
  const folder = parts.join('/');

  const { data } = await supabase.storage
    .from(BUCKET)
    .list(folder, { limit: 1000, search: fileName });

  return data?.some(f => f.name === fileName) || false;
}

async function supabaseUpload(path, buffer, contentType) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    // If it already exists, that's fine
    if (error.message?.includes('already exists') || error.message?.includes('Duplicate')) {
      console.log(`   ⏭️  Already exists, skipping`);
      return null;
    }
    throw new Error(`Upload error: ${error.message}`);
  }

  const { data: urlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Stock Library Migration: Google Drive → Supabase');
  console.log(`   Drive folder: ${DRIVE_FOLDER_ID}`);
  console.log(`   Supabase:     ${SUPABASE_URL}`);
  console.log(`   Bucket:       ${BUCKET}/${STOCK_PREFIX}/`);
  if (DRY_RUN) console.log('   🏷️  DRY RUN — no uploads will happen');
  if (ONLY_CATEGORY) console.log(`   🏷️  Only category: ${ONLY_CATEGORY}`);
  if (SKIP_EXISTING) console.log('   🏷️  Skipping existing files (use --force to re-upload)');
  console.log('');

  // Step 1: List top-level items (subfolders = categories)
  console.log('📂 Scanning Drive folder for categories...');
  const topLevel = await driveListAll(DRIVE_FOLDER_ID);

  const folders = topLevel.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const rootVideos = topLevel.filter(f => VIDEO_MIMES.includes(f.mimeType));

  console.log(`   Found ${folders.length} category folders, ${rootVideos.length} root-level videos\n`);

  let totalFiles = 0;
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalBytes = 0;

  // Step 2: Process each category folder
  for (const folder of folders) {
    const categoryName = folder.name.toLowerCase().replace(/\s+/g, '-');

    if (ONLY_CATEGORY && categoryName !== ONLY_CATEGORY.toLowerCase()) {
      continue;
    }

    console.log(`\n📁 Category: ${folder.name} (→ stock/${categoryName}/)`);

    const files = await driveListAll(folder.id);
    const videos = files.filter(f => VIDEO_MIMES.includes(f.mimeType));

    console.log(`   ${videos.length} videos found`);

    for (const video of videos) {
      totalFiles++;
      const destPath = `${STOCK_PREFIX}/${categoryName}/${video.name}`;
      const sizeMB = (parseInt(video.size || '0') / 1024 / 1024).toFixed(1);

      console.log(`   📹 ${video.name} (${sizeMB} MB)`);

      if (DRY_RUN) {
        console.log(`      → would upload to: ${destPath}`);
        continue;
      }

      // Check if already exists
      if (SKIP_EXISTING) {
        try {
          const exists = await supabaseFileExists(destPath);
          if (exists) {
            console.log(`      ⏭️  Already in Supabase, skipping`);
            totalSkipped++;
            continue;
          }
        } catch (e) {
          // If check fails, try uploading anyway
        }
      }

      try {
        // Download from Drive
        console.log(`      ⬇️  Downloading from Drive...`);
        const response = await driveDownload(video.id);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        totalBytes += buffer.length;

        // Upload to Supabase
        console.log(`      ⬆️  Uploading to Supabase (${(buffer.length / 1024 / 1024).toFixed(1)} MB)...`);
        const contentType = video.mimeType || 'video/mp4';
        const url = await supabaseUpload(destPath, buffer, contentType);

        if (url) {
          console.log(`      ✅ Done → ${url.slice(0, 80)}...`);
          totalUploaded++;
        } else {
          totalSkipped++;
        }
      } catch (err) {
        console.error(`      ❌ Failed: ${err.message}`);
        totalFailed++;
      }
    }
  }

  // Step 3: Handle root-level videos (no category → "uncategorized")
  if (rootVideos.length > 0 && (!ONLY_CATEGORY || ONLY_CATEGORY === 'uncategorized')) {
    console.log(`\n📁 Root-level videos (→ stock/uncategorized/)`);

    for (const video of rootVideos) {
      totalFiles++;
      const destPath = `${STOCK_PREFIX}/uncategorized/${video.name}`;
      const sizeMB = (parseInt(video.size || '0') / 1024 / 1024).toFixed(1);

      console.log(`   📹 ${video.name} (${sizeMB} MB)`);

      if (DRY_RUN) {
        console.log(`      → would upload to: ${destPath}`);
        continue;
      }

      if (SKIP_EXISTING) {
        try {
          const exists = await supabaseFileExists(destPath);
          if (exists) {
            console.log(`      ⏭️  Already in Supabase, skipping`);
            totalSkipped++;
            continue;
          }
        } catch (e) { /* try uploading */ }
      }

      try {
        console.log(`      ⬇️  Downloading...`);
        const response = await driveDownload(video.id);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);
        totalBytes += buffer.length;

        console.log(`      ⬆️  Uploading (${(buffer.length / 1024 / 1024).toFixed(1)} MB)...`);
        const url = await supabaseUpload(destPath, buffer, video.mimeType || 'video/mp4');

        if (url) {
          console.log(`      ✅ Done`);
          totalUploaded++;
        } else {
          totalSkipped++;
        }
      } catch (err) {
        console.error(`      ❌ Failed: ${err.message}`);
        totalFailed++;
      }
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Migration Summary');
  console.log('═'.repeat(50));
  console.log(`   Total files found:  ${totalFiles}`);
  console.log(`   Uploaded:           ${totalUploaded}`);
  console.log(`   Skipped (existing): ${totalSkipped}`);
  console.log(`   Failed:             ${totalFailed}`);
  console.log(`   Data transferred:   ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log('═'.repeat(50));

  if (totalFailed > 0) {
    console.log('\n⚠️  Some files failed. Re-run the script to retry (existing files will be skipped).');
  }
  if (DRY_RUN) {
    console.log('\n🏷️  This was a dry run. Remove --dry-run to actually migrate.');
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
