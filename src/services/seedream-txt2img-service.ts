/**
 * Seedream 4.5 Text-to-Image API Service
 * Async API with polling for results (no image input required)
 */

import { SeedreamSettings } from '../types';
import { waitForSlot } from './unified-kie-rate-limiter';
import { queryTask, pollForResult, downloadImageAsBase64 } from './seedream-service';
import { logger } from './logger';

const CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const MODEL_ID = 'seedream/4.5-text-to-image';
const MAX_POLL_ATTEMPTS = 60;

/**
 * Create text-to-image task with Seedream 4.5
 */
export const createTxt2ImgTask = async (
  apiKey: string,
  prompt: string,
  settings: SeedreamSettings
): Promise<string> => {
  logger.debug('SeedreamTxt2Img', 'Creating task', { promptLen: prompt.length });

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
        prompt,
        aspect_ratio: settings.aspectRatio,
        quality: settings.quality,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      logger.error('SeedreamTxt2Img', 'Task creation auth failed');
      throw new Error('Authentication failed. Please check your Kie.ai API key.');
    }
    if (response.status === 402) {
      logger.error('SeedreamTxt2Img', 'Insufficient credits');
      throw new Error('Insufficient credits. Please top up your Kie.ai account.');
    }
    if (response.status === 429) {
      logger.warn('SeedreamTxt2Img', 'Rate limit exceeded');
      throw new Error('Rate limit exceeded. Please wait and try again.');
    }
    logger.error('SeedreamTxt2Img', 'Task creation failed', { status: response.status });
    throw new Error(`Task creation failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200) {
    logger.error('SeedreamTxt2Img', 'Task creation error', { msg: result.msg });
    throw new Error(`Task creation failed: ${result.msg || 'Unknown error'}`);
  }

  logger.info('SeedreamTxt2Img', 'Task created', { taskId: result.data.taskId });
  return result.data.taskId;
};

/**
 * Full generation flow: create task → poll → download
 */
export const generateWithSeedreamTxt2Img = async (
  apiKey: string,
  prompt: string,
  settings: SeedreamSettings,
  onProgress?: (stage: string, detail?: string) => void
): Promise<{ base64: string; mimeType: string }> => {
  // Step 1: Create task
  onProgress?.('creating', 'Creating generation task...');
  const taskId = await createTxt2ImgTask(apiKey, prompt, settings);

  // Step 2: Poll for result
  onProgress?.('generating', 'Generating image...');
  const task = await pollForResult(apiKey, taskId, (state, attempt) => {
    onProgress?.('polling', `Polling (${attempt + 1}/${MAX_POLL_ATTEMPTS}): ${state}`);
  });

  if (!task.resultUrls || task.resultUrls.length === 0) {
    throw new Error('No result images returned');
  }

  // Step 3: Download result
  onProgress?.('downloading', 'Downloading result...');
  const result = await downloadImageAsBase64(task.resultUrls[0]);

  onProgress?.('complete', 'Done!');
  return result;
};
