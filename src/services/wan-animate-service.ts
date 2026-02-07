/**
 * Wan 2.2 Animate API Service
 * Two sub-modes: Move (motion transfer) and Replace (character swap)
 */

import { AnimateSubMode, AnimateResolution, AnimateJob } from '../types';
import { uploadImageBase64, pollForResult } from './seedream-service';
import { uploadVideoStream } from './kling-motion-control-service';
import { waitForSlot } from './unified-kie-rate-limiter';
import { logger } from './logger';

const CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';

const MODEL_IDS: Record<AnimateSubMode, string> = {
  move: 'wan/2-2-animate-move',
  replace: 'wan/2-2-animate-replace',
};

// Move takes ~10min, Replace ~3min — need more poll attempts
const MAX_POLL_ATTEMPTS = 180;

/**
 * Create Wan 2.2 Animate task
 */
export const createAnimateTask = async (
  apiKey: string,
  imageUrl: string,
  videoUrl: string,
  subMode: AnimateSubMode,
  resolution: AnimateResolution
): Promise<string> => {
  logger.debug('WanAnimate', 'Creating task', { subMode, resolution });

  await waitForSlot();

  const response = await fetch(CREATE_TASK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_IDS[subMode],
      input: {
        image_url: imageUrl,
        video_url: videoUrl,
        resolution,
        num_inference_steps: 23,
        shift: 5,
        video_quality: 'high',
        video_write_mode: 'balanced',
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Authentication failed. Please check your Kie.ai API key.');
    }
    if (response.status === 402) {
      throw new Error('Insufficient credits. Please top up your Kie.ai account.');
    }
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait and try again.');
    }
    throw new Error(`Task creation failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new Error(`Task creation failed: ${result.msg || 'Unknown error'}`);
  }

  logger.info('WanAnimate', 'Task created', { taskId: result.data.taskId });
  return result.data.taskId;
};

/**
 * Full animate generation flow: upload image → upload video → create task → poll → return
 */
export const generateAnimateVideo = async (
  apiKey: string,
  characterBase64: string,
  characterMimeType: string,
  videoFile: File,
  subMode: AnimateSubMode,
  resolution: AnimateResolution,
  onProgress?: (stage: string, detail?: string) => void
): Promise<{ success: boolean; videoUrl?: string; error?: string }> => {
  const startTime = Date.now();

  try {
    // Step 1: Upload character image
    onProgress?.('uploading', 'Uploading character image...');
    const imageUrl = await uploadImageBase64(apiKey, characterBase64, characterMimeType);

    // Step 2: Upload reference video
    onProgress?.('uploading', 'Uploading reference video...');
    const videoUrl = await uploadVideoStream(apiKey, videoFile);

    // Step 3: Create animate task
    onProgress?.('creating', `Creating ${subMode === 'move' ? 'animation' : 'character swap'} task...`);
    const taskId = await createAnimateTask(apiKey, imageUrl, videoUrl, subMode, resolution);

    // Step 4: Poll for result
    onProgress?.('generating', 'Generating animated video...');
    const task = await pollForResult(apiKey, taskId, (state, attempt) => {
      onProgress?.('polling', `Polling (${attempt + 1}/${MAX_POLL_ATTEMPTS}): ${state}`);
    }, MAX_POLL_ATTEMPTS);

    if (task.state === 'success' && task.resultUrls && task.resultUrls.length > 0) {
      logger.info('WanAnimate', 'Generation complete', {
        subMode,
        durationMs: Date.now() - startTime,
      });
      return { success: true, videoUrl: task.resultUrls[0] };
    }

    return { success: false, error: 'No video URL in result' };
  } catch (error) {
    logger.error('WanAnimate', 'Generation failed', { error, subMode });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
