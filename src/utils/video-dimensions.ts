/**
 * Detects video dimensions and calculates aspect ratio
 * @param videoUrl - URL to the video file
 * @returns Promise with width, height, and aspect ratio
 */
export interface VideoDimensions {
  width: number;
  height: number;
  aspectRatio: number; // width / height
  aspectRatioString: string; // e.g., "16:9", "9:16", "1:1"
}

export const detectVideoDimensions = async (
  videoUrl: string
): Promise<VideoDimensions> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const aspectRatio = width / height;

      // Calculate common aspect ratio string
      const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
      const divisor = gcd(width, height);
      const aspectW = width / divisor;
      const aspectH = height / divisor;
      const aspectRatioString = `${aspectW}:${aspectH}`;

      resolve({
        width,
        height,
        aspectRatio,
        aspectRatioString,
      });

      // Clean up
      video.remove();
    };

    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
      video.remove();
    };

    video.src = videoUrl;
  });
};

/**
 * Get CSS aspect ratio string for video container
 * @param dimensions - Video dimensions from detectVideoDimensions
 * @returns CSS aspect-ratio value (e.g., "16/9")
 */
export const getVideoAspectRatioCSS = (dimensions: VideoDimensions): string => {
  // Use the simplified aspectRatioString (e.g., "16:9") and convert colon to slash for CSS
  return dimensions.aspectRatioString.replace(':', '/');
};
