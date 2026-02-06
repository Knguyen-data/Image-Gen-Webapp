/**
 * Kling 2.6 Motion Control API Service
 * Video generation with reference image and motion control
 */

import { VideoScene, VideoSettings, GeneratedVideo, ReferenceVideo } from '../types';
import { uploadImageBase64, queryTask, pollForResult } from './seedream-service';
import { waitForSlot } from './unified-kie-rate-limiter';
import { logger } from './logger';
import { getVideoDuration } from '../utils/video-dimensions';

const UPLOAD_STREAM_URL = 'https://kieai.redpandaai.co/api/file-stream-upload';
const CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const MODEL_ID = 'kling-2.6/motion-control';
const MAX_POLL_ATTEMPTS = 120; // Videos take longer than images

/**
 * Upload video via file stream (NOT base64 - videos too large)
 */
export const uploadVideoStream = async (
  apiKey: string,
  file: File
): Promise<string> => {
  logger.debug('KlingMotion', 'Uploading video', {
    name: file.name,
    sizeMB: (file.size / 1024 / 1024).toFixed(2)
  });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('uploadPath', 'kling/videos');

  const response = await fetch(UPLOAD_STREAM_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) {
      logger.error('KlingMotion', 'Video upload auth failed');
      throw new Error('Authentication failed. Please check your Kie.ai API key.');
    }
    logger.error('KlingMotion', 'Video upload failed', { status: response.status });
    throw new Error(`Video upload failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200 || !result.success) {
    logger.error('KlingMotion', 'Video upload error', { msg: result.msg });
    throw new Error(`Video upload failed: ${result.msg || 'Unknown error'}`);
  }

  logger.info('KlingMotion', 'Video uploaded', { url: result.data.downloadUrl?.slice(0, 50) });
  return result.data.downloadUrl;
};

/**
 * Validate video file before upload
 */
export const validateVideoFile = async (
  file: File,
  orientation: 'image' | 'video'
): Promise<{ valid: boolean; error?: string }> => {
  logger.debug('KlingMotion', 'Validating video', {
    type: file.type,
    sizeMB: (file.size / 1024 / 1024).toFixed(2),
    orientation
  });

  // Check file type
  if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
    return { valid: false, error: 'Only .mp4 and .mov formats are supported' };
  }

  // Check file size (100MB max)
  const maxSizeBytes = 100 * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return { valid: false, error: 'Video must be under 100MB' };
  }

  // Check duration
  try {
    const duration = await getVideoDuration(file);
    const maxDuration = orientation === 'image' ? 10 : 30;

    if (duration < 3 || duration > maxDuration) {
      return {
        valid: false,
        error: `Duration must be 3-${maxDuration}s for ${orientation} orientation (got ${duration.toFixed(1)}s)`
      };
    }
  } catch (error) {
    logger.error('KlingMotion', 'Duration check failed', { error });
    return { valid: false, error: 'Failed to read video duration' };
  }

  logger.debug('KlingMotion', 'Video validation passed');
  return { valid: true };
};

/**
 * Validate reference image for motion control
 * Requirements: >300px, ratio 2:5 to 5:2, max 10MB
 */
export const validateImageForMotion = async (
  base64: string,
  mimeType: string
): Promise<{ valid: boolean; error?: string }> => {
  logger.debug('KlingMotion', 'Validating image', { mimeType });

  // Check file type
  if (!['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
    return { valid: false, error: 'Only .jpg, .jpeg, and .png formats are supported' };
  }

  // Check size and dimensions
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      const { width, height } = img;
      const ratio = width / height;

      // Check minimum size
      if (width < 300 || height < 300) {
        resolve({ valid: false, error: 'Image must be at least 300px in both dimensions' });
        return;
      }

      // Check aspect ratio (2:5 to 5:2 = 0.4 to 2.5)
      if (ratio < 0.4 || ratio > 2.5) {
        resolve({
          valid: false,
          error: `Aspect ratio must be between 2:5 and 5:2 (got ${ratio.toFixed(2)})`
        });
        return;
      }

      logger.debug('KlingMotion', 'Image validation passed', { width, height, ratio: ratio.toFixed(2) });
      resolve({ valid: true });
    };

    img.onerror = () => {
      resolve({ valid: false, error: 'Failed to load image' });
    };

    // Create data URL if needed
    const dataUrl = base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`;
    img.src = dataUrl;
  });
};

/**
 * Create motion control task
 */
export const createMotionTask = async (
  apiKey: string,
  imageUrl: string,
  videoUrl: string,
  prompt: string,
  orientation: 'image' | 'video',
  resolution: '720p' | '1080p'
): Promise<string> => {
  logger.debug('KlingMotion', 'Creating motion task', {
    promptLen: prompt.length,
    orientation,
    resolution
  });

  // Wait for rate limit slot
  await waitForSlot();

  const response = await fetch(CREATE_TASK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_ID,
      input: {
        prompt: prompt || 'The character is performing the action.',
        input_urls: [imageUrl],
        video_urls: [videoUrl],
        character_orientation: orientation,
        mode: resolution,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      logger.error('KlingMotion', 'Task creation auth failed');
      throw new Error('Authentication failed. Please check your Kie.ai API key.');
    }
    if (response.status === 402) {
      logger.error('KlingMotion', 'Insufficient credits');
      throw new Error('Insufficient credits. Please top up your Kie.ai account.');
    }
    if (response.status === 429) {
      logger.warn('KlingMotion', 'Rate limit exceeded');
      throw new Error('Rate limit exceeded. Please wait and try again.');
    }
    logger.error('KlingMotion', 'Task creation failed', { status: response.status });
    throw new Error(`Task creation failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200) {
    logger.error('KlingMotion', 'Task creation error', { msg: result.msg });
    throw new Error(`Task creation failed: ${result.msg || 'Unknown error'}`);
  }

  logger.info('KlingMotion', 'Task created', { taskId: result.data.taskId });
  return result.data.taskId;
};

/**
 * Poll for motion control task completion
 */
export const pollMotionTask = async (
  apiKey: string,
  taskId: string,
  onProgress?: (state: string, attempt: number) => void
): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
  try {
    const task = await pollForResult(apiKey, taskId, onProgress);

    if (task.state === 'success' && task.resultUrls && task.resultUrls.length > 0) {
      logger.info('KlingMotion', 'Task completed', { videoUrl: task.resultUrls[0]?.slice(0, 50) });
      return { success: true, videoUrl: task.resultUrls[0] };
    }

    return { success: false, error: 'No video URL in result' };
  } catch (error) {
    logger.error('KlingMotion', 'Polling failed', { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Full generation flow: validate → upload → create task → poll → return video
 */
export const generateMotionVideo = async (
  apiKey: string,
  scene: VideoScene,
  globalVideo: ReferenceVideo | undefined,
  settings: VideoSettings,
  onProgress?: (stage: string, detail?: string) => void
): Promise<GeneratedVideo> => {
  const startTime = Date.now();

  try {
    // Determine which video to use
    const videoToUse = settings.referenceVideoMode === 'per-scene'
      ? scene.referenceVideo
      : globalVideo;

    if (!videoToUse) {
      throw new Error('No reference video provided');
    }

    // Step 1: Validate video
    onProgress?.('validating', 'Validating reference video...');
    const videoValidation = await validateVideoFile(videoToUse.file, settings.orientation);
    if (!videoValidation.valid) {
      throw new Error(`Video validation failed: ${videoValidation.error}`);
    }

    // Step 2: Validate image
    onProgress?.('validating', 'Validating reference image...');
    const imageValidation = await validateImageForMotion(
      scene.referenceImage.base64,
      scene.referenceImage.mimeType
    );
    if (!imageValidation.valid) {
      throw new Error(`Image validation failed: ${imageValidation.error}`);
    }

    // Step 3: Upload image
    onProgress?.('uploading', 'Uploading reference image...');
    const imageUrl = await uploadImageBase64(
      apiKey,
      scene.referenceImage.base64,
      scene.referenceImage.mimeType
    );

    // Step 4: Upload video
    onProgress?.('uploading', 'Uploading reference video...');
    const videoUrl = await uploadVideoStream(apiKey, videoToUse.file);

    // Step 5: Create task
    onProgress?.('creating', 'Creating motion control task...');
    const taskId = await createMotionTask(
      apiKey,
      imageUrl,
      videoUrl,
      scene.prompt,
      settings.orientation,
      settings.resolution
    );

    // Step 6: Poll for result
    onProgress?.('generating', 'Generating video...');
    const result = await pollMotionTask(apiKey, taskId, (state, attempt) => {
      onProgress?.('polling', `Polling (${attempt + 1}/${MAX_POLL_ATTEMPTS}): ${state}`);
    });

    if (!result.success || !result.videoUrl) {
      throw new Error(result.error || 'Video generation failed');
    }

    // Step 7: Return generated video
    const duration = videoToUse.duration || 5; // fallback duration
    onProgress?.('complete', 'Video generated successfully!');

    const generatedVideo: GeneratedVideo = {
      id: `video-${Date.now()}`,
      sceneId: scene.id,
      url: result.videoUrl,
      duration,
      prompt: scene.prompt,
      createdAt: Date.now(),
      status: 'success',
    };

    logger.info('KlingMotion', 'Generation complete', {
      sceneId: scene.id,
      durationMs: Date.now() - startTime
    });

    return generatedVideo;

  } catch (error) {
    logger.error('KlingMotion', 'Generation failed', { error, sceneId: scene.id });

    const failedVideo: GeneratedVideo = {
      id: `video-${Date.now()}`,
      sceneId: scene.id,
      url: '',
      duration: 0,
      prompt: scene.prompt,
      createdAt: Date.now(),
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    return failedVideo;
  }
};
