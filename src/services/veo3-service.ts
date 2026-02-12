/**
 * Veo 3.1 API Types
 * Google Veo 3.1 AI Video Generation API (via kie.ai)
 */

import { logger } from './logger';

// ============ Configuration ============

const VEO_API_BASE = 'https://api.kie.ai/api/v1/veo';
const MAX_POLL_ATTEMPTS = 180; // ~30 min at 10s intervals (Veo can take longer)
const POLL_INTERVAL_MS = 10000;
const MAX_TASK_RETRIES = 3;

// ============ Enums ============

export type VeoModel = 'veo3' | 'veo3_fast';

export type VeoGenerationType = 
  | 'TEXT_2_VIDEO' 
  | 'FIRST_AND_LAST_FRAMES_2_VIDEO' 
  | 'REFERENCE_2_VIDEO';

export type VeoAspectRatio = '16:9' | '9:16' | 'Auto';

export type VeoTaskStatus = 0 | 1 | 2 | 3; // 0: Generating, 1: Success, 2: Failed, 3: Generation Failed

// ============ Request/Response Types ============

export interface VeoGenerateRequest {
  /** Text prompt describing the desired video content (required) */
  prompt: string;
  /** Image URLs for image-to-video mode (1-2 images for FIRST_AND_LAST_FRAMES_2_VIDEO, 1-3 for REFERENCE_2_VIDEO) */
  imageUrls?: string[];
  /** Model selection (default: veo3_fast) */
  model?: VeoModel;
  /** Video generation mode (auto-detected if not specified) */
  generationType?: VeoGenerationType;
  /** Video aspect ratio (default: 16:9) */
  aspectRatio?: VeoAspectRatio;
  /** Random seed for reproducibility (10000-99999) */
  seeds?: number;
  /** Callback URL for receiving completion notifications */
  callBackUrl?: string;
  /** Enable prompt translation to English (default: true) */
  enableTranslation?: boolean;
  /** Watermark text (optional) */
  watermark?: string;
}

export interface VeoGenerateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

export interface VeoExtendRequest {
  /** Task ID of the original video generation (required) */
  taskId: string;
  /** Text prompt describing the extended video content (required) */
  prompt: string;
  /** Random seed for reproducibility (10000-99999) */
  seeds?: number;
  /** Watermark text (optional) */
  watermark?: string;
  /** Callback URL for receiving completion notifications */
  callBackUrl?: string;
  /** Model type for extension (default: fast) */
  model?: 'fast' | 'quality';
}

export interface VeoExtendResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

export interface VeoRecordInfoRequest {
  /** Task ID to query (required) */
  taskId: string;
}

export interface VeoRecordInfoResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    successFlag: VeoTaskStatus;
    response?: {
      resultUrls?: string[];
      originUrls?: string[];
      resolution?: string;
      mediaIds?: string[];
    };
    fallbackFlag?: boolean; // Legacy field for regular generation tasks
    failCode?: string;
    failMsg?: string;
    costTime?: number;
  };
}

export interface Veo1080pRequest {
  /** Task ID of the original video generation (required) */
  taskId: string;
  /** Video index (default: 0) */
  index?: number;
}

export interface Veo1080pResponse {
  code: number;
  msg: string;
  data: {
    resultUrl: string;
  };
}

export interface Veo4kRequest {
  /** Task ID of the original video generation (required) */
  taskId: string;
  /** Video index (default: 0) */
  index?: number;
  /** Callback URL for receiving completion notifications */
  callBackUrl?: string;
}

export interface Veo4kResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    info?: {
      resultUrls: string[];
      imageUrls?: string[];
    };
  };
}

// ============ Callback Types ============

export interface VeoCallbackPayload {
  code: number;
  msg: string;
  data: {
    taskId: string;
    info?: {
      resultUrls?: string[];
      originUrls?: string[];
      resolution?: string;
    };
    fallbackFlag?: boolean;
  };
}

export interface Veo4kCallbackPayload {
  code: number;
  msg: string;
  data: {
    taskId: string;
    info?: {
      resultUrls?: string[];
      imageUrls?: string[];
    };
  };
}

// ============ Error Handling ============

export class VeoApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public statusCode: number
  ) {
    super(message);
    this.name = 'VeoApiError';
  }
}

export type VeoResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

// ============ Helper Functions ============

const handleVeoError = async (
  response: Response,
  context: string
): Promise<never> => {
  if (response.status === 401) {
    throw new VeoApiError(
      'Veo API authentication failed. Check your API key.',
      response.status,
      response.status
    );
  }
  if (response.status === 402 || response.status === 403) {
    throw new VeoApiError(
      'Veo API: insufficient credits or access denied.',
      response.status,
      response.status
    );
  }
  if (response.status === 429) {
    throw new VeoApiError(
      'Veo API rate limit exceeded. Please wait.',
      response.status,
      response.status
    );
  }
  if (response.status === 404) {
    throw new VeoApiError(
      'Veo API: resource not found.',
      response.status,
      response.status
    );
  }
  if (response.status === 422) {
    throw new VeoApiError(
      'Veo API: validation error or request rejected.',
      response.status,
      response.status
    );
  }
  if (response.status === 455) {
    throw new VeoApiError(
      'Veo API: service unavailable (maintenance).',
      response.status,
      response.status
    );
  }

  try {
    const body = await response.json();
    const msg = body?.msg || body?.message || body?.error || JSON.stringify(body);
    throw new VeoApiError(
      `Veo ${context} failed (${response.status}): ${msg}`,
      response.status,
      response.status
    );
  } catch (e) {
    if (e instanceof VeoApiError) throw e;
    throw new VeoApiError(
      `Veo ${context} failed: ${response.status}`,
      response.status,
      response.status
    );
  }
};

// ============ API Functions ============

/**
 * Create a Veo 3.1 video generation task
 */
export const createVeoTask = async (
  apiKey: string,
  request: VeoGenerateRequest
): Promise<VeoGenerateResponse> => {
  logger.debug('Veo3', 'Creating video generation task', {
    promptLen: request.prompt.length,
    model: request.model,
    generationType: request.generationType,
    aspectRatio: request.aspectRatio,
    imageCount: request.imageUrls?.length
  });

  const body: Record<string, unknown> = {
    prompt: request.prompt,
  };

  // Optional fields
  if (request.imageUrls && request.imageUrls.length > 0) {
    body.imageUrls = request.imageUrls;
  }
  if (request.model) {
    body.model = request.model;
  }
  if (request.generationType) {
    body.generationType = request.generationType;
  }
  if (request.aspectRatio) {
    body.aspect_ratio = request.aspectRatio;
  }
  if (request.seeds !== undefined) {
    body.seeds = request.seeds;
  }
  if (request.callBackUrl) {
    body.callBackUrl = request.callBackUrl;
  }
  if (request.enableTranslation !== undefined) {
    body.enableTranslation = request.enableTranslation;
  }
  if (request.watermark) {
    body.watermark = request.watermark;
  }

  const response = await fetch(`${VEO_API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    await handleVeoError(response, 'video generation');
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new VeoApiError(
      `Veo video generation failed: ${result.msg || 'Unknown error'}`,
      result.code,
      200
    );
  }

  logger.info('Veo3', 'Video generation task created', { taskId: result.data.taskId });
  return result;
};

/**
 * Extend an existing Veo 3.1 video
 */
export const extendVeoTask = async (
  apiKey: string,
  request: VeoExtendRequest
): Promise<VeoExtendResponse> => {
  logger.debug('Veo3', 'Creating video extension task', {
    taskId: request.taskId,
    promptLen: request.prompt.length
  });

  const body: Record<string, unknown> = {
    taskId: request.taskId,
    prompt: request.prompt,
  };

  if (request.seeds !== undefined) {
    body.seeds = request.seeds;
  }
  if (request.watermark) {
    body.watermark = request.watermark;
  }
  if (request.callBackUrl) {
    body.callBackUrl = request.callBackUrl;
  }
  if (request.model) {
    body.model = request.model;
  }

  const response = await fetch(`${VEO_API_BASE}/extend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    await handleVeoError(response, 'video extension');
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new VeoApiError(
      `Veo video extension failed: ${result.msg || 'Unknown error'}`,
      result.code,
      200
    );
  }

  logger.info('Veo3', 'Video extension task created', { taskId: result.data.taskId });
  return result;
};

/**
 * Get task details and status
 */
export const getVeoTaskInfo = async (
  apiKey: string,
  taskId: string
): Promise<VeoRecordInfoResponse> => {
  logger.debug('Veo3', 'Querying task info', { taskId });

  const response = await fetch(`${VEO_API_BASE}/record-info?taskId=${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    await handleVeoError(response, 'task info query');
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new VeoApiError(
      `Veo task info query failed: ${result.msg || 'Unknown error'}`,
      result.code,
      200
    );
  }

  return result;
};

/**
 * Get 1080P upgraded video URL
 */
export const getVeo1080pVideo = async (
  apiKey: string,
  request: Veo1080pRequest
): Promise<Veo1080pResponse> => {
  logger.debug('Veo3', 'Requesting 1080P video', { taskId: request.taskId, index: request.index });

  const params = new URLSearchParams({
    taskId: request.taskId,
  });
  if (request.index !== undefined) {
    params.append('index', String(request.index));
  }

  const response = await fetch(`${VEO_API_BASE}/get-1080p-video?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    await handleVeoError(response, '1080P video request');
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new VeoApiError(
      `Veo 1080P video request failed: ${result.msg || 'Unknown error'}`,
      result.code,
      200
    );
  }

  return result;
};

/**
 * Request 4K upgraded video (returns taskId for polling)
 */
export const requestVeo4kVideo = async (
  apiKey: string,
  request: Veo4kRequest
): Promise<Veo4kResponse> => {
  logger.debug('Veo3', 'Requesting 4K video', { taskId: request.taskId, index: request.index });

  const body: Record<string, unknown> = {
    taskId: request.taskId,
  };

  if (request.index !== undefined) {
    body.index = request.index;
  }
  if (request.callBackUrl) {
    body.callBackUrl = request.callBackUrl;
  }

  const response = await fetch(`${VEO_API_BASE}/get-4k-video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    await handleVeoError(response, '4K video request');
  }

  const result = await response.json();

  if (result.code !== 200) {
    throw new VeoApiError(
      `Veo 4K video request failed: ${result.msg || 'Unknown error'}`,
      result.code,
      200
    );
  }

  return result;
};

// ============ Polling Functions ============

/**
 * Poll for task completion
 */
export const pollVeoTask = async (
  apiKey: string,
  taskId: string,
  onProgress?: (status: string, attempt: number) => void
): Promise<VeoRecordInfoResponse> => {
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const result = await getVeoTaskInfo(apiKey, taskId);
      consecutiveErrors = 0;

      const statusMap: Record<number, string> = {
        0: 'Generating',
        1: 'Success',
        2: 'Failed',
        3: 'Generation Failed',
      };
      const status = statusMap[result.data.successFlag] || 'Unknown';

      onProgress?.(status, attempt);

      if (result.data.successFlag === 1) {
        logger.info('Veo3', 'Task completed successfully', { taskId });
        return result;
      }

      if (result.data.successFlag === 2 || result.data.successFlag === 3) {
        const errorMsg = result.data.failMsg || 'Generation failed';
        logger.error('Veo3', 'Task failed', { taskId, error: errorMsg });
        throw new VeoApiError(`Veo task failed: ${errorMsg}`, result.data.successFlag, 200);
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    } catch (fetchError) {
      if (fetchError instanceof VeoApiError) throw fetchError;
      consecutiveErrors++;
      onProgress?.(`Network error (${consecutiveErrors})`, attempt);

      if (consecutiveErrors >= 15) {
        throw new VeoApiError(
          `Veo: too many polling errors`,
          500,
          500
        );
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  throw new VeoApiError(
    `Veo: polling timeout (${MAX_POLL_ATTEMPTS} attempts)`,
    500,
    500
  );
};

/**
 * Poll for 4K video completion
 */
export const pollVeo4kTask = async (
  apiKey: string,
  taskId: string,
  onProgress?: (status: string, attempt: number) => void
): Promise<VeoRecordInfoResponse> => {
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    try {
      const result = await getVeoTaskInfo(apiKey, taskId);
      consecutiveErrors = 0;

      const statusMap: Record<number, string> = {
        0: 'Generating',
        1: 'Success',
        2: 'Failed',
        3: 'Generation Failed',
      };
      const status = statusMap[result.data.successFlag] || 'Unknown';

      onProgress?.(status, attempt);

      if (result.data.successFlag === 1) {
        logger.info('Veo3', '4K task completed', { taskId });
        return result;
      }

      if (result.data.successFlag === 2 || result.data.successFlag === 3) {
        const errorMsg = result.data.failMsg || '4K generation failed';
        logger.error('Veo3', '4K task failed', { taskId, error: errorMsg });
        throw new VeoApiError(`Veo 4K task failed: ${errorMsg}`, result.data.successFlag, 200);
      }

      // 4K takes longer - use extended interval
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS * 2));
    } catch (fetchError) {
      if (fetchError instanceof VeoApiError) throw fetchError;
      consecutiveErrors++;
      onProgress?.(`Network error (${consecutiveErrors})`, attempt);

      if (consecutiveErrors >= 15) {
        throw new VeoApiError(
          `Veo 4K: too many polling errors`,
          500,
          500
        );
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS * 2));
    }
  }

  throw new VeoApiError(
    `Veo 4K: polling timeout (${MAX_POLL_ATTEMPTS} attempts)`,
    500,
    500
  );
};

/**
 * Generate and poll for result with retry
 */
export const generateAndPollVeo = async (
  apiKey: string,
  request: VeoGenerateRequest,
  onProgress?: (stage: string, detail?: string) => void
): Promise<VeoRecordInfoResponse> => {
  for (let retry = 0; retry < MAX_TASK_RETRIES; retry++) {
    if (retry > 0) {
      logger.info('Veo3', `Auto-retry ${retry}/${MAX_TASK_RETRIES} after failure`);
      onProgress?.('retry', `Retry ${retry}/${MAX_TASK_RETRIES}...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    try {
      onProgress?.('creating', 'Creating task...');
      const createResult = await createVeoTask(apiKey, request);

      onProgress?.('polling', 'Generating video...');
      const pollResult = await pollVeoTask(
        apiKey,
        createResult.data.taskId,
        (status, attempt) => {
          const prefix = retry > 0 ? `Retry ${retry}: ` : '';
          onProgress?.('polling', `${prefix}${status} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`);
        }
      );

      return pollResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Veo3', `Generation error on attempt ${retry}`, { error: msg });
      
      if (retry >= MAX_TASK_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new VeoApiError(
    `Veo: failed after ${MAX_TASK_RETRIES} attempts`,
    500,
    500
  );
};

/**
 * Extend and poll for result with retry
 */
export const extendAndPollVeo = async (
  apiKey: string,
  request: VeoExtendRequest,
  onProgress?: (stage: string, detail?: string) => void
): Promise<VeoRecordInfoResponse> => {
  for (let retry = 0; retry < MAX_TASK_RETRIES; retry++) {
    if (retry > 0) {
      logger.info('Veo3', `Auto-retry ${retry}/${MAX_TASK_RETRIES} after failure`);
      onProgress?.('retry', `Retry ${retry}/${MAX_TASK_RETRIES}...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    try {
      onProgress?.('creating', 'Creating extension task...');
      const extendResult = await extendVeoTask(apiKey, request);

      onProgress?.('polling', 'Extending video...');
      const pollResult = await pollVeoTask(
        apiKey,
        extendResult.data.taskId,
        (status, attempt) => {
          const prefix = retry > 0 ? `Retry ${retry}: ` : '';
          onProgress?.('polling', `${prefix}${status} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`);
        }
      );

      return pollResult;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Veo3', `Extension error on attempt ${retry}`, { error: msg });
      
      if (retry >= MAX_TASK_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new VeoApiError(
    `Veo extension: failed after ${MAX_TASK_RETRIES} attempts`,
    500,
    500
  );
};

// ============ Callback Parsing ============

/**
 * Parse and validate video generation callback
 */
export const parseVeoCallback = (payload: VeoCallbackPayload): VeoResult<{
  taskId: string;
  videoUrls: string[];
  originUrls?: string[];
  resolution?: string;
  isFallback: boolean;
}> => {
  if (payload.code !== 200) {
    return { success: false, error: payload.msg };
  }

  const data = payload.data;
  if (!data.info?.resultUrls || data.info.resultUrls.length === 0) {
    return { success: false, error: 'No video URLs in callback' };
  }

  return {
    success: true,
    data: {
      taskId: data.taskId,
      videoUrls: data.info.resultUrls,
      originUrls: data.info.originUrls,
      resolution: data.info.resolution,
      isFallback: data.fallbackFlag || false,
    },
  };
};

/**
 * Parse and validate 4K video callback
 */
export const parseVeo4kCallback = (payload: Veo4kCallbackPayload): VeoResult<{
  taskId: string;
  videoUrls: string[];
  imageUrls?: string[];
}> => {
  if (payload.code !== 200) {
    return { success: false, error: payload.msg };
  }

  const data = payload.data;
  if (!data.info?.resultUrls || data.info.resultUrls.length === 0) {
    return { success: false, error: 'No 4K video URLs in callback' };
  }

  return {
    success: true,
    data: {
      taskId: data.taskId,
      videoUrls: data.info.resultUrls,
      imageUrls: data.info.imageUrls,
    },
  };
};

// ============ Download Helpers ============

/**
 * Download video from URL and return as blob
 */
export const downloadVideoAsBlob = async (
  url: string,
  timeoutMs: number = 120000
): Promise<Blob> => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Empty response body from server');
  }

  return response.blob();
};

/**
 * Convert blob to base64 data URL
 */
export const blobToBase64DataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Download video and convert to base64 data URL
 */
export const downloadVideoAsBase64 = async (
  url: string,
  timeoutMs: number = 120000
): Promise<{ base64: string; mimeType: string }> => {
  const blob = await downloadVideoAsBlob(url, timeoutMs);
  const base64 = await blobToBase64DataUrl(blob);
  const mimeType = blob.type || 'video/mp4';

  return { base64, mimeType };
};
