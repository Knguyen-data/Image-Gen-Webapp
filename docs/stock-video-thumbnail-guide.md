# Stock Video Thumbnail Guide

## Overview

Stock video thumbnails are automatically generated from video files using FFmpeg. Thumbnails are stored alongside videos in Supabase Storage with the same filename but `.jpg` extension.

## Architecture

**Storage Structure:**
```
media/stock/cars/
├── porsche-911-5sec.mp4    ← Video file
├── porsche-911-5sec.jpg    ← Thumbnail (auto-loaded)
├── ferrari-f8-10sec.mp4
└── ferrari-f8-10sec.jpg
```

**Automatic Detection:**
- `supabase-stock-service.ts` automatically generates thumbnail URLs
- `getThumbnailUrl()` replaces video extension with `.jpg`
- No database needed - thumbnails are discovered by convention

## Generating Thumbnails

### Prerequisites
- **FFmpeg** installed ([download](https://ffmpeg.org/download.html))
  - macOS: `brew install ffmpeg`
  - Ubuntu: `sudo apt install ffmpeg`
  - Windows: Download from website

### Quick Start

**Generate thumbnails for a directory:**
```bash
./scripts/generate-video-thumbnails.sh ~/Downloads/stock-videos/cars/
```

**Output:**
```
🎬 Generating thumbnails for videos in: ~/Downloads/stock-videos/cars/

🎥 Processing: porsche-911-5sec.mp4
✅ Generated: porsche-911-5sec.jpg

🎥 Processing: ferrari-f8-10sec.mp4
✅ Generated: ferrari-f8-10sec.jpg

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Summary:
   Total videos: 2
   Generated: 2
   Skipped: 0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Manual FFmpeg Command

**Single video:**
```bash
ffmpeg -i video.mp4 -ss 00:00:01 -vframes 1 -vf "scale=640:-1" -q:v 2 thumbnail.jpg
```

**Parameters explained:**
- `-i video.mp4` - Input video file
- `-ss 00:00:01` - Extract frame at 1 second
- `-vframes 1` - Extract only 1 frame
- `-vf "scale=640:-1"` - Resize to 640px width (maintains aspect ratio)
- `-q:v 2` - JPEG quality (1=best, 31=worst)
- `thumbnail.jpg` - Output file

## Upload Workflow

### New Stock Videos

**When uploading new stock videos:**

1. **Generate thumbnails locally:**
   ```bash
   ./scripts/generate-video-thumbnails.sh ./local-videos/
   ```

2. **Upload to Supabase Storage:**
   - Go to Supabase Dashboard → Storage → `media` bucket
   - Navigate to `stock/{category}/` folder
   - Upload **both** video files AND thumbnail `.jpg` files
   - Ensure filenames match (e.g., `video.mp4` + `video.jpg`)

3. **Verify in app:**
   - Open stock gallery in the app
   - Thumbnails should appear automatically
   - No code changes or database updates needed

### Existing Videos (Batch Process)

**For existing videos without thumbnails:**

1. **Download videos from Supabase:**
   ```bash
   # Download all videos from a category
   # (manual process - use Supabase dashboard or CLI)
   ```

2. **Generate thumbnails:**
   ```bash
   ./scripts/generate-video-thumbnails.sh ./downloaded-videos/
   ```

3. **Upload only thumbnails:**
   - Upload generated `.jpg` files to Supabase Storage
   - Place in same folder as original videos

## Troubleshooting

### Thumbnails Not Showing

**1. Verify file naming:**
```
✅ Correct:
   porsche-911-5sec.mp4
   porsche-911-5sec.jpg

❌ Incorrect:
   porsche-911-5sec.mp4
   porsche-911-thumb.jpg  (different name)
```

**2. Check Storage permissions:**
- Supabase Storage bucket must be **public** or use signed URLs
- Verify thumbnail URL in browser console

**3. Check file paths:**
- Thumbnails must be in **same folder** as videos
- Example: `media/stock/cars/video.mp4` → `media/stock/cars/video.jpg`

### FFmpeg Not Found

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Windows:**
- Download from https://ffmpeg.org/download.html
- Add to PATH environment variable

## Technical Details

### Code Implementation

**Service function** (`supabase-stock-service.ts`):
```typescript
function getThumbnailUrl(path: string): string | null {
  // Replace video extension with .jpg
  const thumbnailPath = path.replace(/\.(mp4|webm|mov)$/i, '.jpg');

  // Return public URL for the thumbnail
  const { data } = supabase.storage
    .from(STOCK_BUCKET)
    .getPublicUrl(thumbnailPath);

  return data.publicUrl;
}
```

**Usage in VideoCard:**
```tsx
<video
  src={video.url}
  poster={video.thumbnailUrl}  // Auto-generated URL
  preload="metadata"
/>
```

### Performance

- **Thumbnail size:** ~20-50 KB per thumbnail
- **Load time:** Instant (static image, CDN-cached)
- **Storage cost:** Negligible (100 thumbnails ≈ 2-5 MB)

### Fallback Behavior

If thumbnail file doesn't exist in Supabase Storage:
- URL still generated (returns 404)
- Browser shows black poster frame
- Gallery shows 🎬 placeholder icon

## Best Practices

1. **Always generate thumbnails before upload** - Don't rely on runtime generation
2. **Use consistent naming** - Same filename as video, different extension
3. **Optimize thumbnail size** - 640px width is sufficient for previews
4. **Version control scripts** - Keep thumbnail generation script in repo
5. **Document upload process** - Train team members on workflow

## Future Enhancements

### Automatic Generation (Future)

**Option 1: Supabase Edge Function**
- Trigger on Storage upload event
- Auto-generate thumbnail server-side
- Requires Edge Function deployment

**Option 2: Pre-signed Upload**
- Client uploads video
- Server generates thumbnail
- Returns both URLs

**Current approach (pre-generated) is recommended** until user uploads are needed.

## See Also

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [FFmpeg Documentation](https://ffmpeg.org/ffmpeg.html)
- [Video optimization guide](./video-optimization-guide.md) *(if exists)*
