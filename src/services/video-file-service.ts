/**
 * Client-side service for saving videos to disk.
 * Uses File System Access API (showSaveFilePicker) or falls back to browser download.
 */

import { fetchWithTimeout } from '../utils/fetch-with-timeout';

/**
 * Prompt user to pick save location, or fall back to browser download
 */
export async function saveAndRevealVideo(videoUrl: string): Promise<void> {
  // Fetch the video blob (with timeout + CORS)
  const response = await fetchWithTimeout(videoUrl);
  const blob = await response.blob();

  // Try File System Access API (Chrome/Edge)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: `video-${Date.now()}.mp4`,
        types: [
          {
            description: 'MP4 Video',
            accept: { 'video/mp4': ['.mp4'] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: any) {
      // User cancelled the picker
      if (err.name === 'AbortError') return;
      console.warn('showSaveFilePicker failed, falling back to download:', err);
    }
  }

  // Fallback: trigger browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `video-${Date.now()}.mp4`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
