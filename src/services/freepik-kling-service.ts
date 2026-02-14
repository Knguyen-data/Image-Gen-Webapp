/**
 * Freepik Kling API Service
 * - Motion Control (Std/Pro tiers)
 * - Pro Image-to-Video
 * - Kling 3 (MultiShot + single shot)
 * - Kling 3 Omni (multi-modal reference support)
 * Proxied through Vite dev server to avoid CORS (see vite.config.ts)
 */

import { 
  KlingProAspectRatio, 
  KlingProDuration,
  Kling3AspectRatio,
  Kling3ImageListItem,
  Kling3MultiPromptItem,
  Kling3Element
} from '../types';
import { logger } from './logger';

const FREEPIK_PROXY_URL = import.meta.env.DEV
  ? '/api/freepik'
  : 'https://freepik-proxy.tnguyen633.workers.dev';

const BASE_URL = `${FREEPIK_PROXY_URL}/v1/ai`;
const MAX_POLL_ATTEMPTS = 720; // 60 min at 5s intervals per attempt
const POLL_INTERVAL_MS = 5000;
const MAX_TASK_RETRIES = 3; // Retry entire create+poll cycle on FAILED status

type FreepikStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

// ---------- Shared error handler ----------

const handleFreepikError = async (response: Response, context: string): Promise<never> => {
  if (response.status === 401) throw new Error('Freepik authentication failed. Check your API key.');
  if (response.status === 402 || response.status === 403) throw new Error('Freepik: insufficient credits or access denied.');
  if (response.status === 429) throw new Error('Freepik rate limit exceeded. Please wait.');
  // Try to extract actual error message from response body
  try {
    const body = await response.json();
    const msg = body?.message || body?.error || JSON.stringify(body);
    throw new Error(`Freepik ${context} failed (${response.status}): ${msg}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Freepik')) throw e;
    throw new Error(`Freepik ${context} failed: ${response.status}`);
  }
};

// ---------- Generic Freepik poller ----------

export const pollFreepikTask = async (
  apiKey: string,
  taskId: string,
  pollUrl: string,
  onProgress?: (status: string, attempt: number) => void
): Promise<{ success: boolean; videoUrl?: string; error?: string; failed?: boolean }> => {
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${pollUrl}/${taskId}`, {
        method: 'GET',
        headers: { 'x-freepik-api-key': apiKey },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 401) return { success: false, error: 'Freepik auth failed during polling' };
        consecutiveErrors++;
        onProgress?.(`Poll error ${response.status} (${consecutiveErrors})`, attempt);
        if (consecutiveErrors >= 15) {
          return { success: false, error: `Freepik: too many poll errors (HTTP ${response.status})` };
        }
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      consecutiveErrors = 0;
      const result = await response.json();

      // Debug: log every poll response to browser console
      console.log('[FreepikPoll]', taskId, 'attempt', attempt, JSON.stringify(result));

      const status = result?.data?.status as FreepikStatus;
      const generated = result?.data?.generated as string[] | undefined;

      onProgress?.(status, attempt);

      if (status === 'COMPLETED' && generated && generated.length > 0) {
        logger.info('FreepikKling', 'Task completed', { taskId });
        return { success: true, videoUrl: generated[0] };
      }

      if (status === 'FAILED') {
        const errorMsg = result?.data?.error || result?.message || 'Generation failed';
        logger.error('FreepikKling', 'Task failed', { taskId, error: errorMsg, fullResponse: JSON.stringify(result) });
        return { success: false, failed: true, error: `Freepik: ${errorMsg}` };
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    } catch (fetchError) {
      consecutiveErrors++;
      onProgress?.(`Network error (${consecutiveErrors})`, attempt);
      if (consecutiveErrors >= 15) {
        return { success: false, error: `Freepik: too many network errors` };
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  return { success: false, error: 'Freepik: polling timeout (60 minutes)' };
};

/**
 * Generic retry wrapper: create task → poll → if FAILED, retry entire cycle up to MAX_TASK_RETRIES times.
 * Works for all Freepik video services (Kling 2.6, Kling 3, Omni).
 */
export const createAndPollWithRetry = async (
  createTask: () => Promise<string>,
  poll: (taskId: string, onProgress?: (status: string, attempt: number) => void) => Promise<{ success: boolean; videoUrl?: string; error?: string; failed?: boolean }>,
  onProgress?: (status: string, attempt: number) => void
): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
  for (let retry = 0; retry < MAX_TASK_RETRIES; retry++) {
    if (retry > 0) {
      logger.info('FreepikKling', `Auto-retry ${retry}/${MAX_TASK_RETRIES} after FAILED status`);
      onProgress?.(`Auto-retry ${retry}/${MAX_TASK_RETRIES}...`, 0);
      await new Promise(r => setTimeout(r, 3000));
    }

    try {
      onProgress?.(retry > 0 ? `Retry ${retry}: Creating task...` : 'Creating task...', 0);
      const taskId = await createTask();

      onProgress?.('Generating...', 0);
      const result = await poll(taskId, (status, attempt) => {
        const prefix = retry > 0 ? `Retry ${retry}: ` : '';
        onProgress?.(`${prefix}${status} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`, attempt);
      });

      if (result.success) return result;

      // If server said FAILED, retry the whole cycle
      if (result.failed) {
        logger.warn('FreepikKling', `Task FAILED, will retry`, { retry, error: result.error });
        continue;
      }

      // Non-retryable error (auth, timeout, etc.)
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('FreepikKling', `Create/poll error on attempt ${retry}`, { error: msg });
      if (retry >= MAX_TASK_RETRIES - 1) {
        return { success: false, error: msg };
      }
    }
  }

  return { success: false, error: `Freepik: failed after ${MAX_TASK_RETRIES} attempts` };
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
      prompt: prompt || 'The character is performing the action.',
      cfg_scale: cfgScale,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) await handleFreepikError(response, 'motion task creation');

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
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) await handleFreepikError(response, 'Pro I2V task creation');

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

// ---------- Kling 3 (MultiShot + single shot) ----------

/**
 * Create Kling 3 video generation task (MultiShot or single shot)
 * @param apiKey Freepik API key
 * @param tier 'pro' or 'std'
 * @param options Generation options
 * @returns task_id for polling
 */
export const createKling3Task = async (
  apiKey: string,
  tier: 'pro' | 'std',
  options: {
    prompt?: string;
    negativePrompt?: string;
    imageList?: Kling3ImageListItem[];
    multiShot?: boolean;
    multiPrompt?: Kling3MultiPromptItem[];
    elementList?: string[];
    aspectRatio?: Kling3AspectRatio;
    duration?: number;
    cfgScale?: number;
    shotType?: 'intelligent' | 'customize';
    generateAudio?: boolean;
    webhookUrl?: string;
  }
): Promise<string> => {
  const endpoint = `${BASE_URL}/video/kling-v3-${tier}`;

  logger.debug('FreepikKling3', 'Creating Kling 3 task', { 
    tier, 
    multiShot: options.multiShot,
    multiPromptCount: options.multiPrompt?.length,
    duration: options.duration,
    aspectRatio: options.aspectRatio
  });

  const body: Record<string, unknown> = {};

  // Prompt — required for T2V or intelligent mode
  if (options.prompt) {
    body.prompt = options.prompt.slice(0, 2500);
  }

  if (options.negativePrompt?.trim()) {
    body.negative_prompt = options.negativePrompt.trim().slice(0, 2500);
  }

  // Start/end frame images — Kling 3 uses start_image_url / end_image_url (NOT image_list)
  if (options.imageList && options.imageList.length > 0) {
    for (const img of options.imageList) {
      if (img.type === 'first_frame') {
        body.start_image_url = img.imageUrl;
      } else if (img.type === 'end_frame') {
        body.end_image_url = img.imageUrl;
      }
    }
  }

  // Shot type and multi_prompt
  if (options.multiPrompt && options.multiPrompt.length > 0) {
    body.shot_type = 'customize';
    // API expects {prompt: string, duration: string} — duration as string enum
    body.multi_prompt = options.multiPrompt.map(item => ({
      prompt: (item.prompt || '').slice(0, 2500),
      duration: String(item.duration || 3),
    }));
  } else if (options.shotType === 'intelligent') {
    body.shot_type = 'intelligent';
  }

  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }

  // Duration as string enum (API expects "3" not 3)
  if (options.duration !== undefined) {
    body.duration = String(options.duration);
  }

  if (options.cfgScale !== undefined) {
    body.cfg_scale = options.cfgScale;
  }

  if (options.generateAudio !== undefined) {
    body.generate_audio = options.generateAudio;
  }

  if (options.webhookUrl) {
    body.webhook_url = options.webhookUrl;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) await handleFreepikError(response, 'Kling 3 task creation');

  const result = await response.json();

  // Debug: log full creation response
  logger.info('FreepikKling3', 'Creation response', { response: JSON.stringify(result) });

  const taskId = result?.data?.task_id;
  if (!taskId) throw new Error('Freepik: no task_id in Kling 3 response');

  logger.info('FreepikKling3', 'Kling 3 task created', { taskId, tier });
  return taskId;
};

/**
 * Poll Kling 3 task
 * Uses the same generic pollFreepikTask with Kling 3 status endpoint
 */
export const pollKling3Task = async (
  apiKey: string,
  taskId: string,
  onProgress?: (status: string, attempt: number) => void
) => pollFreepikTask(apiKey, taskId, `${BASE_URL}/video/kling-v3`, onProgress);

// ---------- Kling 3 Omni (multi-modal reference support) ----------

/**
 * Create Kling 3 Omni video generation task (T2V, I2V, or reference-based)
 * @param apiKey Freepik API key
 * @param tier 'pro' or 'std'
 * @param options Generation options
 * @returns task_id for polling
 */
export const createKling3OmniTask = async (
  apiKey: string,
  tier: 'pro' | 'std',
  options: {
    prompt?: string;
    imageUrl?: string;  // Start frame for I2V
    startImageUrl?: string;  // Alternative start frame
    endImageUrl?: string;  // End frame
    imageUrls?: string[];  // Reference images (@Image1, @Image2)
    elements?: Kling3Element[];  // Character/object elements (@Element1, @Element2)
    multiPrompt?: string[];  // Array of STRINGS (NOT objects with duration)
    aspectRatio?: Kling3AspectRatio;
    duration?: number;
    generateAudio?: boolean;
    voiceIds?: string[];  // Voice IDs for narration (<<<voice_1>>>)
    webhookUrl?: string;
  }
): Promise<string> => {
  const endpoint = `${BASE_URL}/video/kling-v3-omni-${tier}`;

  logger.debug('FreepikKling3Omni', 'Creating Kling 3 Omni task', {
    tier,
    hasImageUrl: !!options.imageUrl,
    hasElements: !!options.elements?.length,
    hasReferenceImages: !!options.imageUrls?.length,
    multiPromptCount: options.multiPrompt?.length,
    duration: options.duration,
    aspectRatio: options.aspectRatio,
    generateAudio: options.generateAudio
  });

  const body: Record<string, unknown> = {};

  if (options.prompt) {
    body.prompt = options.prompt.slice(0, 2500);
  }

  // Multi-prompt: array of STRINGS only (no duration per-shot for Omni)
  if (options.multiPrompt && options.multiPrompt.length > 0) {
    body.shot_type = 'customize';
    body.multi_prompt = options.multiPrompt.map(s => s.slice(0, 2500));
  }

  if (options.imageUrl) {
    body.image_url = options.imageUrl;
  }

  if (options.startImageUrl) {
    body.start_image_url = options.startImageUrl;
  }

  if (options.endImageUrl) {
    body.end_image_url = options.endImageUrl;
  }

  if (options.imageUrls && options.imageUrls.length > 0) {
    body.image_urls = options.imageUrls;
  }

  if (options.elements && options.elements.length > 0) {
    body.elements = options.elements;
  }

  if (options.generateAudio !== undefined) {
    body.generate_audio = options.generateAudio;
  }

  if (options.voiceIds && options.voiceIds.length > 0) {
    body.voice_ids = options.voiceIds;
  }

  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }

  // Duration as STRING enum
  if (options.duration !== undefined) {
    body.duration = String(options.duration);
  }

  if (options.webhookUrl) {
    body.webhook_url = options.webhookUrl;
  }

  // Log request body for debugging (mask long image data)
  const debugBody = { ...body };
  if (debugBody.image_url) debugBody.image_url = String(debugBody.image_url).slice(0, 80) + '...';
  if (debugBody.start_image_url) debugBody.start_image_url = String(debugBody.start_image_url).slice(0, 80) + '...';
  if (debugBody.end_image_url) debugBody.end_image_url = String(debugBody.end_image_url).slice(0, 80) + '...';
  if (debugBody.image_urls) debugBody.image_urls = (debugBody.image_urls as string[]).map((u: string) => u.slice(0, 80) + '...');
  console.log('[Kling3Omni] POST', endpoint, JSON.stringify(debugBody, null, 2));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  // Capture raw response text before parsing
  const responseText = await response.text();
  console.log('[Kling3Omni] Creation response', response.status, responseText);

  if (!response.ok) {
    throw new Error(`Freepik Kling 3 Omni task creation failed (${response.status}): ${responseText}`);
  }

  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(`Freepik Kling 3 Omni: invalid JSON response: ${responseText.slice(0, 500)}`);
  }

  const taskId = result?.data?.task_id;
  if (!taskId) throw new Error('Freepik: no task_id in Kling 3 Omni response');

  logger.info('FreepikKling3Omni', 'Kling 3 Omni task created', { taskId, tier });
  return taskId;
};

/**
 * Create Kling 3 Omni video-to-video task (reference video mode)
 * @param apiKey Freepik API key
 * @param tier 'pro' or 'std'
 * @param options Generation options (includes video_url)
 * @returns task_id for polling
 */
export const createKling3OmniReferenceTask = async (
  apiKey: string,
  tier: 'pro' | 'std',
  options: {
    videoUrl: string;  // Reference video (@Video1) - REQUIRED
    prompt?: string;
    imageUrl?: string;  // Optional start frame for V2V
    aspectRatio?: Kling3AspectRatio;
    duration?: number;
    cfgScale?: number;
    negativePrompt?: string;
    webhookUrl?: string;
  }
): Promise<string> => {
  const endpoint = `${BASE_URL}/reference-to-video/kling-v3-omni-${tier}`;

  logger.debug('FreepikKling3OmniRef', 'Creating Kling 3 Omni reference task', {
    tier,
    hasVideoUrl: !!options.videoUrl,
    duration: options.duration,
    cfgScale: options.cfgScale
  });

  const body: Record<string, unknown> = {
    video_url: options.videoUrl,
  };

  if (options.prompt) {
    body.prompt = options.prompt.slice(0, 2500);
  }

  if (options.imageUrl) {
    body.image_url = options.imageUrl;
  }

  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }

  // Duration as string enum
  if (options.duration !== undefined) {
    body.duration = String(options.duration);
  }

  if (options.cfgScale !== undefined) {
    body.cfg_scale = options.cfgScale;
  }

  if (options.negativePrompt?.trim()) {
    body.negative_prompt = options.negativePrompt.trim().slice(0, 2500);
  }

  if (options.webhookUrl) {
    body.webhook_url = options.webhookUrl;
  }

  // Log request body for debugging
  console.log('[Kling3OmniRef] POST', endpoint, JSON.stringify(body, null, 2));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-freepik-api-key': apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  // Capture raw response text before parsing
  const responseText = await response.text();
  console.log('[Kling3OmniRef] Creation response', response.status, responseText);

  if (!response.ok) {
    throw new Error(`Freepik Kling 3 Omni reference task creation failed (${response.status}): ${responseText}`);
  }

  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(`Freepik Kling 3 Omni reference: invalid JSON response: ${responseText.slice(0, 500)}`);
  }

  const taskId = result?.data?.task_id;
  if (!taskId) throw new Error('Freepik: no task_id in Kling 3 Omni reference response');

  logger.info('FreepikKling3OmniRef', 'Kling 3 Omni reference task created', { taskId, tier });
  return taskId;
};

/**
 * Poll Kling 3 Omni task (T2V/I2V mode)
 * Uses the same generic pollFreepikTask with Kling 3 Omni status endpoint
 */
export const pollKling3OmniTask = async (
  apiKey: string,
  taskId: string,
  onProgress?: (status: string, attempt: number) => void
) => pollFreepikTask(apiKey, taskId, `${BASE_URL}/video/kling-v3-omni`, onProgress);

/**
 * Poll Kling 3 Omni reference task (V2V mode)
 * Uses SEPARATE poll endpoint for video-to-video tasks
 */
export const pollKling3OmniReferenceTask = async (
  apiKey: string,
  taskId: string,
  onProgress?: (status: string, attempt: number) => void
) => pollFreepikTask(apiKey, taskId, `${BASE_URL}/reference-to-video/kling-v3-omni`, onProgress);
