/**
 * Freepik VFX (Video Visual Effects) Service
 * Applies cinematic filters (Film Grain, VHS, Bloom, etc.) to videos via Freepik API.
 *
 * Uses the same proxy + API key pattern as freepik-kling-service.ts
 */

import { logger } from './logger';
import type {
  VfxCreateParams,
  VfxCreateResponse,
  VfxPollResponse,
  VfxTaskResult,
  VfxApplyOptions,
  VfxTaskStatus,
} from '../types/vfx';

const FREEPIK_API_URL = 'https://api.freepik.com';
const VFX_BASE = `${FREEPIK_API_URL}/v1/ai/video/vfx`;

const LOG_CTX = 'FreepikVFX';

const MAX_POLL_ATTEMPTS = 360; // 30 min at 5 s intervals
const POLL_INTERVAL_MS = 5_000;
const MAX_CREATE_RETRIES = 2; // retry create on transient failures

// ---------- Helpers ----------

const getApiKey = (): string => {
  const key = localStorage.getItem('freepik_api_key');
  if (!key) throw new Error('Freepik API key not found. Set it in Settings.');
  return key;
};

const handleError = async (response: Response, context: string): Promise<never> => {
  if (response.status === 401) throw new Error('Freepik authentication failed. Check your API key.');
  if (response.status === 402 || response.status === 403) throw new Error('Freepik: insufficient credits or access denied.');
  if (response.status === 429) throw new Error('Freepik rate limit exceeded. Please wait and try again.');
  try {
    const body = await response.json();
    const msg = body?.message || body?.error || JSON.stringify(body);
    throw new Error(`Freepik VFX ${context} failed (${response.status}): ${msg}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Freepik')) throw e;
    throw new Error(`Freepik VFX ${context} failed: ${response.status}`);
  }
};

// ---------- Create Task ----------

/**
 * POST /v1/ai/video/vfx — create a VFX processing task.
 * Returns the task_id.
 */
export const createVfxTask = async (params: VfxCreateParams): Promise<string> => {
  const apiKey = getApiKey();

  logger.info(LOG_CTX, 'Creating VFX task', {
    filterType: params.filter_type,
    fps: params.fps,
    videoUrl: params.video.slice(0, 80) + '…',
  });

  const response = await fetch(VFX_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-freepik-api-key': apiKey,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) await handleError(response, 'task creation');

  const result: VfxCreateResponse = await response.json();
  const taskId = result?.data?.task_id;

  if (!taskId) throw new Error('Freepik VFX: no task_id in response');

  logger.info(LOG_CTX, 'VFX task created', { taskId });
  return taskId;
};

// ---------- Poll Task ----------

/**
 * GET /v1/ai/video/vfx/{task-id} — poll until terminal status.
 * Returns the final VfxTaskResult.
 */
export const pollVfxTask = async (
  taskId: string,
  onProgress?: (status: VfxTaskStatus, attempt: number) => void,
): Promise<VfxTaskResult> => {
  const apiKey = getApiKey();
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${VFX_BASE}/${taskId}`, {
        method: 'GET',
        headers: { 'x-freepik-api-key': apiKey },
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error('Freepik auth failed during VFX polling.');
        consecutiveErrors++;
        logger.warn(LOG_CTX, `Poll HTTP ${response.status} (${consecutiveErrors})`, { taskId });
        if (consecutiveErrors >= 15) throw new Error(`Freepik VFX: too many poll errors (HTTP ${response.status})`);
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        continue;
      }

      consecutiveErrors = 0;
      const result: VfxPollResponse = await response.json();
      const { status, generated } = result.data;

      console.log('[FreepikVFXPoll]', taskId, 'attempt', attempt, JSON.stringify(result));
      onProgress?.(status, attempt);

      if (status === 'COMPLETED') {
        if (!generated || generated.length === 0) {
          throw new Error('Freepik VFX: task completed but no output URL');
        }
        logger.info(LOG_CTX, 'VFX task completed', { taskId, outputCount: generated.length });
        return result.data;
      }

      if (status === 'ERROR') {
        logger.error(LOG_CTX, 'VFX task error', { taskId, result: JSON.stringify(result) });
        throw new Error('Freepik VFX: task failed with ERROR status');
      }

      // CREATED | IN_QUEUE | IN_PROGRESS → keep polling
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      if (err instanceof Error && (err.message.includes('auth') || err.message.includes('ERROR'))) throw err;
      consecutiveErrors++;
      logger.warn(LOG_CTX, `Poll network error (${consecutiveErrors})`, { taskId, error: String(err) });
      if (consecutiveErrors >= 15) throw new Error('Freepik VFX: too many consecutive network errors');
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  throw new Error('Freepik VFX: polling timeout (30 minutes)');
};

// ---------- High-level: apply effect ----------

/**
 * Convenience wrapper: creates task + polls to completion.
 * Returns the result video URL(s).
 */
export const applyVfxEffect = async (
  videoUrl: string,
  options: VfxApplyOptions,
  onProgress?: (status: string, attempt: number) => void,
): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
  for (let retry = 0; retry <= MAX_CREATE_RETRIES; retry++) {
    try {
      if (retry > 0) {
        logger.info(LOG_CTX, `Retry ${retry}/${MAX_CREATE_RETRIES}`);
        onProgress?.(`Retry ${retry}…`, 0);
        await new Promise(r => setTimeout(r, 3000));
      }

      onProgress?.(retry > 0 ? `Retry ${retry}: Creating task…` : 'Creating VFX task…', 0);

      const params: VfxCreateParams = {
        video: videoUrl,
        filter_type: options.filter_type,
        fps: options.fps,
      };

      // Add filter-specific params
      if (options.bloom_filter_contrast !== undefined) params.bloom_filter_contrast = options.bloom_filter_contrast;
      if (options.motion_filter_kernel_size !== undefined) params.motion_filter_kernel_size = options.motion_filter_kernel_size;
      if (options.motion_filter_decay_factor !== undefined) params.motion_filter_decay_factor = options.motion_filter_decay_factor;

      const taskId = await createVfxTask(params);

      onProgress?.('Processing VFX…', 0);

      const result = await pollVfxTask(taskId, (status, attempt) => {
        const prefix = retry > 0 ? `Retry ${retry}: ` : '';
        onProgress?.(`${prefix}${status} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`, attempt);
      });

      return { success: true, videoUrl: result.generated[0] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown VFX error';
      logger.error(LOG_CTX, `applyVfxEffect error (attempt ${retry})`, { error: msg });

      // Don't retry auth / credit errors
      if (msg.includes('auth') || msg.includes('credits') || msg.includes('access denied') || msg.includes('API key')) {
        return { success: false, error: msg };
      }

      if (retry >= MAX_CREATE_RETRIES) {
        return { success: false, error: msg };
      }
    }
  }

  return { success: false, error: `Freepik VFX: failed after ${MAX_CREATE_RETRIES + 1} attempts` };
};
