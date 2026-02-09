/**
 * Client-side service for saving videos to disk.
 * - Dev mode: Uses Vite middleware to save to local folder + reveal in Explorer
 * - Production: Uses File System Access API (showSaveFilePicker) or falls back to download
 */

const isDev = import.meta.env.DEV;

/**
 * Save video and reveal in Explorer (dev) or prompt user to pick save location (production)
 */
export async function saveAndRevealVideo(videoUrl: string): Promise<void> {
  if (isDev) {
    return saveAndRevealDev(videoUrl);
  }
  return saveWithPicker(videoUrl);
}

/**
 * Dev mode: POST to Vite middleware → save to generated-videos/ → open Explorer
 */
async function saveAndRevealDev(videoUrl: string): Promise<void> {
  // 1. Fetch the video blob
  const response = await fetch(videoUrl);
  const blob = await response.blob();

  // 2. POST blob to /api/save-video
  const saveRes = await fetch('/api/save-video', {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4' },
    body: blob,
  });

  if (!saveRes.ok) {
    const err = await saveRes.json();
    throw new Error(err.error || 'Failed to save video');
  }

  const { filepath } = await saveRes.json();

  // 3. POST filepath to /api/reveal-file
  const revealRes = await fetch('/api/reveal-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filepath }),
  });

  if (!revealRes.ok) {
    const err = await revealRes.json();
    throw new Error(err.error || 'Failed to reveal file');
  }
}

/**
 * Production: Use File System Access API to let user pick save location,
 * falls back to regular <a download> if API not supported
 */
async function saveWithPicker(videoUrl: string): Promise<void> {
  // Fetch the video blob
  const response = await fetch(videoUrl);
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
      // User cancelled the picker — don't fall through to download
      if (err.name === 'AbortError') return;
      // Other error — fall through to download
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
