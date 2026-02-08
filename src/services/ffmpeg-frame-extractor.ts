/**
 * Canvas-based Video Frame Extractor
 * Extracts frames using HTML5 Canvas + Video element — no WASM, no dependencies
 */

export interface ExtractedFrame {
  base64: string;
  mimeType: string;
  previewUrl: string;
  timestamp: number;
}

/**
 * Seek video to a specific time and wait for the frame to be ready
 */
const seekTo = (video: HTMLVideoElement, time: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      reject(new Error(`Failed to seek to ${time}s`));
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = time;
  });
};

/**
 * Capture current video frame to canvas and return as base64 PNG
 * Throws error if video dimensions are invalid
 */
const captureFrame = (video: HTMLVideoElement): { base64: string; previewUrl: string } => {
  if (video.videoWidth <= 0 || video.videoHeight <= 0) {
    throw new Error(`Invalid video dimensions: ${video.videoWidth}x${video.videoHeight}`);
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];
  return { base64, previewUrl: dataUrl };
};

/**
 * Extract frames from video file at 1 frame/second for a given time window
 *
 * @param file - Video file to extract frames from
 * @param startTime - Start of the extraction window (seconds)
 * @param clipDuration - Duration of the clip (seconds, default 3)
 * @param onProgress - Progress callback
 * @param signal - AbortSignal for cancellation
 * @returns Array of extracted frames as base64
 */
export const extractFrames = async (
  file: File,
  startTime: number,
  clipDuration: number = 3,
  onProgress?: (stage: string) => void,
  signal?: AbortSignal
): Promise<ExtractedFrame[]> => {
  signal?.throwIfAborted();

  onProgress?.('Loading video...');

  // Create a hidden video element
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  const url = URL.createObjectURL(file);

  try {
    // Load video metadata
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = url;
    });

    const frameCount = Math.floor(clipDuration);
    const frames: ExtractedFrame[] = [];

    for (let i = 0; i < frameCount; i++) {
      signal?.throwIfAborted();

      const timestamp = startTime + i;
      onProgress?.(`Extracting frame ${i + 1}/${frameCount}...`);

      await seekTo(video, timestamp);
      const { base64, previewUrl } = captureFrame(video);

      frames.push({
        base64,
        mimeType: 'image/png',
        previewUrl,
        timestamp,
      });
    }

    if (frames.length === 0) {
      throw new Error('No frames could be extracted');
    }

    onProgress?.(`Extracted ${frames.length} frames`);
    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.src = '';
    video.load();
  }
};
