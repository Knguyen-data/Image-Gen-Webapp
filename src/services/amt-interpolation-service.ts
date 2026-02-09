/**
 * AMT Interpolation Service - fal.ai
 * Video frame interpolation using AMT model
 */

import { fal } from '@fal-ai/client';
import { logger } from './logger';

// Configure fal client
fal.config({
  credentials: import.meta.env.VITE_FAL_KEY || '',
});

export interface AMTInterpolationParams {
  videoUrl: string;
  outputFps?: number; // Default: 24
  recursiveInterpolationPasses?: number; // Default: 2
}

export interface AMTResult {
  videoUrl: string;
  contentType: string;
  fileName: string;
  fileSize: number;
  processingTime: number;
}

/**
 * Interpolate video frames using fal.ai AMT model with queue polling
 */
export async function interpolateVideo(
  videoUrl: string,
  outputFps: number = 30,
  recursiveInterpolationPasses: number = 2,
  onProgress?: (status: string) => void,
): Promise<AMTResult> {
  onProgress?.('Starting AMT interpolation...');
  logger.info('AMT', 'Interpolation request', { 
    videoUrl: videoUrl.slice(0, 80), 
    outputFps, 
    passes: recursiveInterpolationPasses 
  });

  const startTime = Date.now();

  try {
    const result = await fal.subscribe('fal-ai/amt-interpolation', {
      input: {
        video_url: videoUrl,
        output_fps: outputFps,
        recursive_interpolation_passes: recursiveInterpolationPasses,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          const logs = update.logs || [];
          logs.forEach((log: any) => {
            if (log.message) {
              logger.debug('AMT', 'Progress', { message: log.message });
              onProgress?.(log.message);
            }
          });
        } else if (update.status === 'IN_QUEUE') {
          onProgress?.('Queued for processing...');
        }
      },
    });

    if (!result.data || !result.data.video || !result.data.video.url) {
      throw new Error('Invalid response from AMT API');
    }

    const processingTime = (Date.now() - startTime) / 1000;

    logger.info('AMT', 'Interpolation success', { 
      outputUrl: result.data.video.url.slice(0, 80),
      fileSize: result.data.video.file_size,
      processingTime,
      requestId: result.requestId
    });

    onProgress?.('Interpolation complete!');

    return {
      videoUrl: result.data.video.url,
      contentType: result.data.video.content_type,
      fileName: result.data.video.file_name,
      fileSize: result.data.video.file_size,
      processingTime,
    };
  } catch (error: any) {
    logger.error('AMT', 'Interpolation error', { 
      error: error.message || 'Unknown error',
      details: error.body || error.response 
    });
    throw new Error(`AMT interpolation failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Interpolate and upload to R2
 */
export async function interpolateAndUploadToR2(
  videoUrl: string,
  outputFps: number = 30,
  recursiveInterpolationPasses: number = 2,
  onProgress?: (status: string) => void,
): Promise<string> {
  // First interpolate
  const result = await interpolateVideo(videoUrl, outputFps, recursiveInterpolationPasses, onProgress);

  // Then upload to R2
  onProgress?.('Uploading to R2...');
  
  const { uploadUrlToR2 } = await import('./r2-upload-service');
  const r2Url = await uploadUrlToR2(result.videoUrl, `interpolated_${result.fileName}`);

  logger.info('AMT', 'Uploaded to R2', { r2Url: r2Url.slice(0, 80) });
  
  return r2Url;
}

