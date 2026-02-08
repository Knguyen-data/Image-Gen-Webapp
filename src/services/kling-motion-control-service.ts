/**
 * Kling 2.6 Motion Control - Unified Service
 * Dual-provider: Freepik (primary) + Kie.ai (fallback)
 * File uploads always go through Kie.ai endpoints
 */

import { VideoScene, VideoSettings, GeneratedVideo, ReferenceVideo, KlingProvider } from '../types';
import { uploadImageBase64, pollForResult } from './seedream-service';
import { createFreepikMotionTask, pollFreepikMotionTask } from './freepik-kling-service';
import { waitForSlot } from './unified-kie-rate-limiter';
import { logger } from './logger';
import { getVideoDuration } from '../utils/video-dimensions';

const UPLOAD_STREAM_URL = 'https://kieai.redpandaai.co/api/file-stream-upload';
const CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const MODEL_ID = 'kling-2.6/motion-control';
const MAX_POLL_ATTEMPTS = 120; // 10 min at 5s intervals
const CONTENT_FLAG_MAX_RETRIES = 3;

type ProviderResult = { success: boolean; videoUrl?: string; error?: string; provider: KlingProvider };

/**
 * Upload video via file stream (Kie.ai only — videos too large for base64)
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
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Kie.ai upload auth failed. Check API key.');
    throw new Error(`Video upload failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.code !== 200 || !result.success) {
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
  if (!['video/mp4', 'video/quicktime'].includes(file.type)) {
    return { valid: false, error: 'Only .mp4 and .mov formats are supported' };
  }
  if (file.size > 100 * 1024 * 1024) {
    return { valid: false, error: 'Video must be under 100MB' };
  }
  try {
    const rawDuration = await getVideoDuration(file);
    const duration = Math.round(rawDuration * 10) / 10; // round to 1 decimal to avoid float issues
    const maxDuration = orientation === 'image' ? 10 : 30;
    if (duration < 3 || duration > maxDuration) {
      return { valid: false, error: `Duration must be 3-${maxDuration}s (got ${duration}s)` };
    }
  } catch {
    return { valid: false, error: 'Failed to read video duration' };
  }
  return { valid: true };
};

/**
 * Validate reference image for motion control
 */
export const validateImageForMotion = async (
  base64: string,
  mimeType: string
): Promise<{ valid: boolean; error?: string }> => {
  if (!['image/jpeg', 'image/jpg', 'image/png'].includes(mimeType)) {
    return { valid: false, error: 'Only .jpg, .jpeg, and .png formats are supported' };
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const ratio = width / height;
      if (width < 300 || height < 300) {
        resolve({ valid: false, error: 'Image must be at least 300px in both dimensions' });
        return;
      }
      if (ratio < 0.4 || ratio > 2.5) {
        resolve({ valid: false, error: `Aspect ratio must be between 2:5 and 5:2 (got ${ratio.toFixed(2)})` });
        return;
      }
      resolve({ valid: true });
    };
    img.onerror = () => resolve({ valid: false, error: 'Failed to load image' });
    const dataUrl = base64.startsWith('data:') ? base64 : `data:${mimeType};base64,${base64}`;
    img.src = dataUrl;
  });
};

/**
 * Create + poll via Kie.ai provider
 */
const tryKieai = async (
  apiKey: string,
  imageUrl: string,
  videoUrl: string,
  prompt: string,
  orientation: 'image' | 'video',
  resolution: '720p' | '1080p',
  onProgress?: (stage: string, detail?: string) => void
): Promise<ProviderResult> => {
  try {
    await waitForSlot();
    onProgress?.('creating', 'Kie.ai: Creating task...');

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
      if (response.status === 401) throw new Error('Kie.ai auth failed');
      if (response.status === 402) throw new Error('Kie.ai insufficient credits');
      if (response.status === 429) throw new Error('Kie.ai rate limit exceeded');
      throw new Error(`Kie.ai task creation failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.code !== 200) throw new Error(`Kie.ai: ${result.msg || 'Unknown error'}`);

    const taskId = result.data.taskId;
    logger.info('KlingMotion', 'Kie.ai task created', { taskId });

    // Poll
    onProgress?.('generating', 'Kie.ai: Generating video...');
    const task = await pollForResult(apiKey, taskId, (state, attempt) => {
      onProgress?.('polling', `Kie.ai polling (${attempt + 1}/${MAX_POLL_ATTEMPTS}): ${state}`);
    }, MAX_POLL_ATTEMPTS);

    if (task.state === 'success' && task.resultUrls?.length) {
      return { success: true, videoUrl: task.resultUrls[0], provider: 'kieai' };
    }
    return { success: false, error: task.failMsg || 'No video URL', provider: 'kieai' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('KlingMotion', 'Kie.ai failed', { error: msg });
    return { success: false, error: msg, provider: 'kieai' };
  }
};

/**
 * Create + poll via Freepik provider
 */
const tryFreepik = async (
  apiKey: string,
  imageUrl: string,
  videoUrl: string,
  prompt: string,
  orientation: 'image' | 'video',
  resolution: '720p' | '1080p',
  onProgress?: (stage: string, detail?: string) => void,
  cfgScale: number = 0.5
): Promise<ProviderResult> => {
  try {
    const tier = resolution === '1080p' ? 'pro' : 'std';
    onProgress?.('creating', `Freepik (${tier}): Creating task...`);

    const taskId = await createFreepikMotionTask(apiKey, imageUrl, videoUrl, prompt, orientation, tier, cfgScale);

    onProgress?.('generating', `Freepik (${tier}): Generating video...`);
    const result = await pollFreepikMotionTask(apiKey, taskId, (status, attempt) => {
      onProgress?.('polling', `Freepik polling (${attempt + 1}/${MAX_POLL_ATTEMPTS}): ${status}`);
    });

    return { ...result, provider: 'freepik' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('KlingMotion', 'Freepik failed', { error: msg });
    return { success: false, error: msg, provider: 'freepik' };
  }
};

/**
 * Full generation flow with dual-provider fallback
 * Upload via Kie.ai → Try primary provider → Fallback to other → Return result
 */
export const generateMotionVideo = async (
  kieApiKey: string,
  freepikApiKey: string,
  scene: VideoScene,
  globalVideo: ReferenceVideo | undefined,
  settings: VideoSettings,
  onProgress?: (stage: string, detail?: string) => void,
  overrideProvider?: KlingProvider
): Promise<GeneratedVideo> => {
  const startTime = Date.now();
  const primaryProvider = overrideProvider || settings.klingProvider || 'freepik';

  try {
    // Determine which video to use
    const videoToUse = settings.referenceVideoMode === 'per-scene'
      ? scene.referenceVideo
      : globalVideo;

    if (!videoToUse) throw new Error('No reference video provided');

    // Step 1: Validate
    onProgress?.('validating', 'Validating reference video...');
    const videoValidation = await validateVideoFile(videoToUse.file, settings.orientation);
    if (!videoValidation.valid) throw new Error(`Video validation: ${videoValidation.error}`);

    onProgress?.('validating', 'Validating reference image...');
    const imageValidation = await validateImageForMotion(scene.referenceImage.base64, scene.referenceImage.mimeType);
    if (!imageValidation.valid) throw new Error(`Image validation: ${imageValidation.error}`);

    // Step 2: Upload via Kie.ai (both providers need public URLs)
    onProgress?.('uploading', 'Uploading reference image...');
    const imageUrl = await uploadImageBase64(kieApiKey, scene.referenceImage.base64, scene.referenceImage.mimeType);

    onProgress?.('uploading', 'Uploading reference video...');
    const videoUrl = await uploadVideoStream(kieApiKey, videoToUse.file);

    // Step 3: Try primary provider with content-flag retries
    let result: ProviderResult | undefined;
    const cfgScale = settings.klingCfgScale ?? 0.5;

    // Content-flag retry loop on primary
    for (let retry = 0; retry < CONTENT_FLAG_MAX_RETRIES; retry++) {
      const retryLabel = retry > 0 ? `Retry ${retry}: ` : '';
      onProgress?.('creating', `${retryLabel}Trying ${primaryProvider}...`);

      if (primaryProvider === 'freepik') {
        result = await tryFreepik(
          freepikApiKey, imageUrl, videoUrl,
          scene.prompt, settings.orientation, settings.resolution,
          onProgress, cfgScale
        );
      } else {
        result = await tryKieai(
          kieApiKey, imageUrl, videoUrl,
          scene.prompt, settings.orientation, settings.resolution,
          onProgress
        );
      }

      if (result.success) break;

      const isContentFlag = result.error?.toLowerCase().includes('content flagged');
      if (!isContentFlag || retry >= CONTENT_FLAG_MAX_RETRIES - 1) break;

      logger.warn('KlingMotion', `Content flagged on ${primaryProvider}, retry ${retry + 1}`, { sceneId: scene.id });
      onProgress?.('retrying', `Content flagged - retrying (${retry + 1}/${CONTENT_FLAG_MAX_RETRIES - 1})...`);
      await new Promise(r => setTimeout(r, 3000));
    }

    // Step 4: Fallback to other provider if primary failed
    if (!result?.success && !overrideProvider) {
      const fallbackName = primaryProvider === 'freepik' ? 'kieai' : 'freepik';
      logger.info('KlingMotion', `Primary ${primaryProvider} failed, trying fallback ${fallbackName}`);
      onProgress?.('fallback', `${primaryProvider} failed. Trying ${fallbackName}...`);

      if (fallbackName === 'freepik') {
        result = await tryFreepik(
          freepikApiKey, imageUrl, videoUrl,
          scene.prompt, settings.orientation, settings.resolution,
          onProgress, cfgScale
        );
      } else {
        result = await tryKieai(
          kieApiKey, imageUrl, videoUrl,
          scene.prompt, settings.orientation, settings.resolution,
          onProgress
        );
      }
    }

    if (!result?.success || !result.videoUrl) {
      throw new Error(result?.error || 'Video generation failed on both providers');
    }

    // Step 5: Return success
    const duration = videoToUse.duration || 5;
    onProgress?.('complete', `Generated via ${result.provider}!`);

    logger.info('KlingMotion', 'Generation complete', {
      sceneId: scene.id,
      provider: result.provider,
      durationMs: Date.now() - startTime
    });

    return {
      id: `video-${Date.now()}`,
      sceneId: scene.id,
      url: result.videoUrl,
      duration,
      prompt: scene.prompt,
      createdAt: Date.now(),
      status: 'success',
      provider: result.provider,
    };

  } catch (error) {
    logger.error('KlingMotion', 'Generation failed', { error, sceneId: scene.id });
    return {
      id: `video-${Date.now()}`,
      sceneId: scene.id,
      url: '',
      duration: 0,
      prompt: scene.prompt,
      createdAt: Date.now(),
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
