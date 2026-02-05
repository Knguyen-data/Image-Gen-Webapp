/**
 * Seedream 4.5 Edit API Service
 * Async API with polling for results
 */

import { SeedreamSettings, SeedreamTask, SeedreamAspectRatio } from '../types';
import { waitForSlot } from './seedream-rate-limiter';
import { logger } from './logger';

const UPLOAD_URL = 'https://kieai.redpandaai.co/api/file-base64-upload';
const CREATE_TASK_URL = 'https://api.kie.ai/api/v1/jobs/createTask';
const QUERY_TASK_URL = 'https://api.kie.ai/api/v1/jobs/recordInfo';

const MODEL_ID = 'seedream/4.5-edit';
const MAX_POLL_ATTEMPTS = 60;
const INITIAL_POLL_INTERVAL_MS = 1000;

/**
 * Upload base64 image to Kie.ai and get URL
 */
export const uploadImageBase64 = async (
  apiKey: string,
  base64Data: string,
  mimeType: string
): Promise<string> => {
  logger.debug('Seedream', 'Uploading image', { mimeType });

  // Ensure data URL format
  const dataUrl = base64Data.startsWith('data:')
    ? base64Data
    : `data:${mimeType};base64,${base64Data}`;

  const response = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      base64Data: dataUrl,
      uploadPath: 'seedream/inputs',
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      logger.error('Seedream', 'Upload auth failed');
      throw new Error('Authentication failed. Please check your Kie.ai API key.');
    }
    logger.error('Seedream', 'Upload failed', { status: response.status });
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200 || !result.success) {
    logger.error('Seedream', 'Upload error', { msg: result.msg });
    throw new Error(`Upload failed: ${result.msg || 'Unknown error'}`);
  }

  logger.debug('Seedream', 'Upload successful', { url: result.data.downloadUrl?.slice(0, 50) });
  return result.data.downloadUrl;
};

/**
 * Create edit task with Seedream 4.5
 */
export const createEditTask = async (
  apiKey: string,
  prompt: string,
  imageUrls: string[],
  settings: SeedreamSettings
): Promise<string> => {
  logger.debug('Seedream', 'Creating edit task', { promptLen: prompt.length, imageCount: imageUrls.length });

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
        image_urls: imageUrls,
        aspect_ratio: settings.aspectRatio,
        quality: settings.quality,
      },
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      logger.error('Seedream', 'Task creation auth failed');
      throw new Error('Authentication failed. Please check your Kie.ai API key.');
    }
    if (response.status === 402) {
      logger.error('Seedream', 'Insufficient credits');
      throw new Error('Insufficient credits. Please top up your Kie.ai account.');
    }
    if (response.status === 429) {
      logger.warn('Seedream', 'Rate limit exceeded');
      throw new Error('Rate limit exceeded. Please wait and try again.');
    }
    logger.error('Seedream', 'Task creation failed', { status: response.status });
    throw new Error(`Task creation failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200) {
    logger.error('Seedream', 'Task creation error', { msg: result.msg });
    throw new Error(`Task creation failed: ${result.msg || 'Unknown error'}`);
  }

  logger.info('Seedream', 'Task created', { taskId: result.data.taskId });
  return result.data.taskId;
};

/**
 * Query task status
 */
export const queryTask = async (
  apiKey: string,
  taskId: string
): Promise<SeedreamTask> => {
  const response = await fetch(`${QUERY_TASK_URL}?taskId=${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Query failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new Error(`Query failed: ${result.msg || 'Unknown error'}`);
  }

  const data = result.data;
  const task: SeedreamTask = {
    taskId: data.taskId,
    state: data.state,
    costTime: data.costTime,
  };

  if (data.state === 'success' && data.resultJson) {
    const resultData = JSON.parse(data.resultJson);
    task.resultUrls = resultData.resultUrls;
  }

  if (data.state === 'fail') {
    task.failCode = data.failCode;
    task.failMsg = data.failMsg;
  }

  return task;
};

/**
 * Poll for task completion with exponential backoff
 */
export const pollForResult = async (
  apiKey: string,
  taskId: string,
  onProgress?: (state: string, attempt: number) => void
): Promise<SeedreamTask> => {
  let attempt = 0;
  let interval = INITIAL_POLL_INTERVAL_MS;

  while (attempt < MAX_POLL_ATTEMPTS) {
    const task = await queryTask(apiKey, taskId);

    onProgress?.(task.state, attempt);

    if (task.state === 'success') {
      return task;
    }

    if (task.state === 'fail') {
      throw new Error(`Generation failed: ${task.failMsg || 'Unknown error'}`);
    }

    // Exponential backoff: 1s, 2s, 4s, 8s... capped at 10s
    await new Promise(resolve => setTimeout(resolve, interval));
    interval = Math.min(interval * 2, 10000);
    attempt++;
  }

  throw new Error('Timeout: Generation did not complete within expected time');
};

/**
 * Download image from URL and convert to base64
 */
export const downloadImageAsBase64 = async (url: string): Promise<{ base64: string; mimeType: string }> => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || 'image/webp';

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Extract base64 part after the comma
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Map app aspect ratio to Seedream aspect ratio
 * Seedream supports: 1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9
 */
export const mapAspectRatio = (appRatio: string): SeedreamAspectRatio => {
  const supported: SeedreamAspectRatio[] = ['1:1', '4:3', '3:4', '16:9', '9:16', '2:3', '3:2', '21:9'];

  // Map 4:5 to 3:4 (closest match)
  if (appRatio === '4:5') return '3:4';

  if (supported.includes(appRatio as SeedreamAspectRatio)) {
    return appRatio as SeedreamAspectRatio;
  }

  return '1:1'; // Default fallback
};

/**
 * Full generation flow: upload → create task → poll → download
 */
export const generateWithSeedream = async (
  apiKey: string,
  prompt: string,
  sourceImageBase64: string,
  sourceMimeType: string,
  settings: SeedreamSettings,
  onProgress?: (stage: string, detail?: string) => void
): Promise<{ base64: string; mimeType: string }> => {
  // Step 1: Upload source image
  onProgress?.('uploading', 'Uploading source image...');
  const imageUrl = await uploadImageBase64(apiKey, sourceImageBase64, sourceMimeType);

  // Step 2: Create edit task
  onProgress?.('creating', 'Creating edit task...');
  const taskId = await createEditTask(apiKey, prompt, [imageUrl], settings);

  // Step 3: Poll for result
  onProgress?.('generating', 'Generating image...');
  const task = await pollForResult(apiKey, taskId, (state, attempt) => {
    onProgress?.('polling', `Polling (${attempt + 1}/${MAX_POLL_ATTEMPTS}): ${state}`);
  });

  if (!task.resultUrls || task.resultUrls.length === 0) {
    throw new Error('No result images returned');
  }

  // Step 4: Download result
  onProgress?.('downloading', 'Downloading result...');
  const result = await downloadImageAsBase64(task.resultUrls[0]);

  onProgress?.('complete', 'Done!');
  return result;
};
