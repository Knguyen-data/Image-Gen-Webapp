#!/bin/bash

# Video Thumbnail Generator
# Generates .jpg thumbnails for all .mp4 files in a directory
#
# Usage:
#   ./generate-video-thumbnails.sh /path/to/stock/videos/
#
# Requirements:
#   - FFmpeg installed (https://ffmpeg.org/download.html)
#
# Example:
#   ./generate-video-thumbnails.sh ~/Downloads/stock-videos/cars/

if [ -z "$1" ]; then
  echo "Error: No directory specified"
  echo "Usage: ./generate-video-thumbnails.sh /path/to/videos/"
  exit 1
fi

VIDEO_DIR="$1"

if [ ! -d "$VIDEO_DIR" ]; then
  echo "Error: Directory not found: $VIDEO_DIR"
  exit 1
fi

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
  echo "Error: FFmpeg not found. Please install FFmpeg first."
  echo "  macOS: brew install ffmpeg"
  echo "  Ubuntu: sudo apt install ffmpeg"
  echo "  Windows: Download from https://ffmpeg.org/download.html"
  exit 1
fi

echo "🎬 Generating thumbnails for videos in: $VIDEO_DIR"
echo ""

# Counter
TOTAL=0
GENERATED=0
SKIPPED=0

# Process each video file
for VIDEO in "$VIDEO_DIR"/*.mp4 "$VIDEO_DIR"/*.webm "$VIDEO_DIR"/*.mov; do
  # Skip if no files match
  [ -e "$VIDEO" ] || continue

  TOTAL=$((TOTAL + 1))

  # Get filename without extension
  BASENAME=$(basename "$VIDEO")
  FILENAME="${BASENAME%.*}"
  EXTENSION="${BASENAME##*.}"

  # Thumbnail path (same directory, .jpg extension)
  THUMBNAIL="$VIDEO_DIR/$FILENAME.jpg"

  # Skip if thumbnail already exists
  if [ -f "$THUMBNAIL" ]; then
    echo "⏭️  Skipping $BASENAME (thumbnail exists)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo "🎥 Processing: $BASENAME"

  # Extract frame at 1 second (or 0.1s for short videos)
  # Scale to 640px width (maintains aspect ratio)
  # Quality: -q:v 2 (high quality JPEG, 1=best 31=worst)
  ffmpeg -i "$VIDEO" \
    -ss 00:00:01 \
    -vframes 1 \
    -vf "scale=640:-1" \
    -q:v 2 \
    "$THUMBNAIL" \
    -loglevel error \
    2>&1

  if [ $? -eq 0 ]; then
    echo "✅ Generated: $FILENAME.jpg"
    GENERATED=$((GENERATED + 1))
  else
    echo "❌ Failed: $BASENAME"
  fi

  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   Total videos: $TOTAL"
echo "   Generated: $GENERATED"
echo "   Skipped: $SKIPPED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📤 Next steps:"
echo "   1. Upload thumbnails to Supabase Storage"
echo "   2. Ensure thumbnails are in the same folder as videos"
echo "   3. Thumbnails will automatically appear in the gallery"
echo ""
