/**
 * Freepik Kling API Service
 * - Motion Control (Std/Pro tiers)
 * - Pro Image-to-Video
 * Proxied through Vite dev server to avoid CORS (see vite.config.ts)
 */

import { KlingProAspectRatio, KlingProDuration } from '../types';
import { logger } from './logger';

const FREEPIK_PROXY_URL = import.meta.env.DEV
  ? '/api/freepik'
  : 'https://freepik-proxy.tnguyen633.workers.dev';

const BASE_URL = `${FREEPIK_PROXY_URL}/v1/ai`;
const MAX_POLL_ATTEMPTS = 120; // 10 min at 5s intervals
const POLL_INTERVAL_MS = 5000;

type FreepikStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

// ---------- Shared error handler ----------

const handleFreepikError = (response: Response, context: string): never => {
  if (response.status === 401) throw new Error('Freepik authentication failed. Check your API key.');
  if (response.status === 402 || response.status === 403) throw new Error('Freepik: insufficient credits or access denied.');
  if (response.status === 429) throw new Error('Freepik rate limit exceeded. Please wait.');
  throw new Error(`Freepik ${context} failed: ${response.status}`);
};

// ---------- Generic Freepik poller ----------

export const pollFreepikTask = async (
  apiKey: string,
  taskId: string,
  pollUrl: string,
  onProgress?: (status: string, attempt: number) => void
): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const response = await fetch(`${pollUrl}/${taskId}`, {
      method: 'GET',
      headers: { 'x-freepik-api-key': apiKey },
    });

    if (!response.ok) {
      if (response.status === 401) return { success: false, error: 'Freepik auth failed during polling' };
      onProgress?.('error', attempt);
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }

    const result = await response.json();
    const status = result?.data?.status as FreepikStatus;
    const generated = result?.data?.generated as string[] | undefined;

    onProgress?.(status, attempt);

    if (status === 'COMPLETED' && generated && generated.length > 0) {
      logger.info('FreepikKling', 'Task completed', { taskId });
      return { success: true, videoUrl: generated[0] };
    }

    if (status === 'FAILED') {
      const errorMsg = result?.data?.error || result?.message || 'Generation failed';
      logger.error('FreepikKling', 'Task failed', { taskId, error: errorMsg });
      return { success: false, error: `Freepik: ${errorMsg}` };
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  return { success: false, error: 'Freepik: timeout after 10 minutes' };
};

// ---------- Motion Control ----------

export const createFreepikMotionTask = async (
  apiKey: string,
  imageUrl: string,
  videoUrl: string,
  prompt: string,
  orientation: 'image' | 'video',
  tier: 'pro' | 'std',
  cfgScale: number = 0.5
): Promise<string> => {
  const endpoint = `${BASE_URL}/video/kling-v2-6-motion-control-${tier}`;

  logger.debug('FreepikKling', 'Creating motion task', { tier, orientation, cfgScale });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
    body: JSON.stringify({
      image_url: imageUrl,
      video_url: videoUrl,
      character_orientation: orientation,
      guidance_prompt: prompt || 'The character is performing the action.',
      cfg_scale: cfgScale,
    }),
  });

  if (!response.ok) handleFreepikError(response, 'motion task creation');

  const result = await response.json();
  const taskId = result?.data?.task_id;
  if (!taskId) throw new Error('Freepik: no task_id in response');

  logger.info('FreepikKling', 'Motion task created', { taskId, tier });
  return taskId;
};

/** Poll motion control task */
export const pollFreepikMotionTask = async (
  apiKey: string,
  taskId: string,
  onProgress?: (status: string, attempt: number) => void
) => pollFreepikTask(apiKey, taskId, `${BASE_URL}/image-to-video/kling-v2-6`, onProgress);

// ---------- Pro Image-to-Video ----------

export const createFreepikProI2VTask = async (
  apiKey: string,
  imageUrl: string,
  prompt: string,
  duration: KlingProDuration,
  aspectRatio: KlingProAspectRatio,
  cfgScale: number = 0.5,
  negativePrompt: string = '',
  generateAudio: boolean = false,
): Promise<string> => {
  const endpoint = `${BASE_URL}/image-to-video/kling-v2-6-pro`;

  logger.debug('FreepikKling', 'Creating Pro I2V task', { duration, aspectRatio, cfgScale, generateAudio });

  const body: Record<string, unknown> = {
    image: imageUrl,
    prompt: prompt || 'The image comes alive with natural motion.',
    cfg_scale: cfgScale,
    duration,
    aspect_ratio: aspectRatio,
  };

  if (negativePrompt.trim()) {
    body.negative_prompt = negativePrompt.trim();
  }
  if (generateAudio) {
    body.generate_audio = true;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) handleFreepikError(response, 'Pro I2V task creation');

  const result = await response.json();
  const taskId = result?.data?.task_id;
  if (!taskId) throw new Error('Freepik: no task_id in Pro I2V response');

  logger.info('FreepikKling', 'Pro I2V task created', { taskId, duration, aspectRatio });
  return taskId;
};

/** Poll Pro I2V task (same poll endpoint as all Kling tasks) */
export const pollFreepikProI2VTask = async (
  apiKey: string,
  taskId: string,
  onProgress?: (status: string, attempt: number) => void
) => pollFreepikTask(apiKey, taskId, `${BASE_URL}/image-to-video/kling-v2-6`, onProgress);
