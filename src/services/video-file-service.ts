/**
 * Client-side service for saving videos to disk and revealing in Explorer.
 * Works only in dev mode via Vite middleware.
 */

export async function saveAndRevealVideo(videoUrl: string): Promise<void> {
  // 1. Fetch the video blob from the object URL
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
