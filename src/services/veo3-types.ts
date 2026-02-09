/**
 * Veo 3.1 API Types
 * TypeScript interfaces for Google Veo 3.1 AI Video Generation API (via kie.ai)
 * 
 * API Documentation: https://docs.kie.ai/veo3-api/
 * Base URL: https://api.kie.ai/api/v1/veo
 * Authentication: Bearer Token
 */

// ============ Enums ============

/**
 * Veo 3.1 Model Types
 * - veo3: Quality model, highest fidelity
 * - veo3_fast: Fast model, cost-efficient with strong results
 */
export type VeoModel = 'veo3' | 'veo3_fast';

/**
 * Video Generation Mode
 * - TEXT_2_VIDEO: Text-to-video using only prompts
 * - FIRST_AND_LAST_FRAMES_2_VIDEO: Image-to-video with 1-2 reference images
 * - REFERENCE_2_VIDEO: Material-to-video with reference images (Fast model only, 16:9 & 9:16)
 */
export type VeoGenerationType = 
  | 'TEXT_2_VIDEO' 
  | 'FIRST_AND_LAST_FRAMES_2_VIDEO' 
  | 'REFERENCE_2_VIDEO';

/**
 * Video Aspect Ratio
 * - 16:9: Landscape format
 * - 9:16: Portrait format
 * - Auto: Auto-detect based on input
 */
export type VeoAspectRatio = '16:9' | '9:16' | 'Auto';

/**
 * Task Status Flag
 * - 0: Generating (task in progress)
 * - 1: Success (completed successfully)
 * - 2: Failed (task failed before completion)
 * - 3: Generation Failed (created but upstream failed)
 */
export type VeoTaskStatus = 0 | 1 | 2 | 3;

/**
 * Video Resolution
 */
export type VeoResolution = '720p' | '1080p' | '4K';

// ============ Request Types ============

/**
 * Veo 3.1 Video Generation Request
 */
export interface VeoGenerateRequest {
  /** Text prompt describing the desired video content (required) */
  prompt: string;
  /** Image URLs for image-to-video mode */
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

/**
 * Veo 3.1 Video Extension Request
 */
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

/**
 * Veo Task Info Request
 */
export interface VeoRecordInfoRequest {
  /** Task ID to query (required) */
  taskId: string;
}

/**
 * Veo 1080P Video Request
 */
export interface Veo1080pRequest {
  /** Task ID of the original video generation (required) */
  taskId: string;
  /** Video index (default: 0) */
  index?: number;
}

/**
 * Veo 4K Video Request
 */
export interface Veo4kRequest {
  /** Task ID of the original video generation (required) */
  taskId: string;
  /** Video index (default: 0) */
  index?: number;
  /** Callback URL for receiving completion notifications */
  callBackUrl?: string;
}

// ============ Response Types ============

/**
 * Veo 3.1 Video Generation Response
 */
export interface VeoGenerateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

/**
 * Veo 3.1 Video Extension Response
 */
export interface VeoExtendResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

/**
 * Veo Task Info Response
 */
export interface VeoRecordInfoResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    /** 0: Generating, 1: Success, 2: Failed, 3: Generation Failed */
    successFlag: VeoTaskStatus;
    /** Result data when task completes */
    response?: {
      resultUrls?: string[];
      originUrls?: string[];
      resolution?: string;
      mediaIds?: string[];
    };
    /** Legacy field for regular generation tasks */
    fallbackFlag?: boolean;
    failCode?: string;
    failMsg?: string;
    costTime?: number;
  };
}

/**
 * Veo 1080P Video Response
 */
export interface Veo1080pResponse {
  code: number;
  msg: string;
  data: {
    resultUrl: string;
  };
}

/**
 * Veo 4K Video Response
 */
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

/**
 * Video Generation Callback Payload
 */
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

/**
 * 4K Video Generation Callback Payload
 */
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

// ============ Result Types ============

/**
 * Parsed Video Generation Result
 */
export interface VeoVideoResult {
  taskId: string;
  videoUrls: string[];
  originUrls?: string[];
  resolution?: string;
  isFallback: boolean;
}

/**
 * Parsed 4K Video Result
 */
export interface Veo4kResult {
  taskId: string;
  videoUrls: string[];
  imageUrls?: string[];
}

// ============ Error Types ============

/**
 * Veo API Error
 */
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

/**
 * Generic Veo Result type for error handling
 */
export type VeoResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

// ============ Status Code Constants ============

export const VEO_STATUS = {
  GENERATING: 0 as const,
  SUCCESS: 1 as const,
  FAILED: 2 as const,
  GENERATION_FAILED: 3 as const,
};

export const VEO_CODES = {
  SUCCESS: 200 as const,
  UNAUTHORIZED: 401 as const,
  INSUFFICIENT_CREDITS: 402 as const,
  NOT_FOUND: 404 as const,
  VALIDATION_ERROR: 422 as const,
  RATE_LIMITED: 429 as const,
  IMAGE_FETCH_FAILED: 451 as const,
  SERVICE_UNAVAILABLE: 455 as const,
  SERVER_ERROR: 500 as const,
  GENERATION_FAILED: 501 as const,
  FEATURE_DISABLED: 505 as const,
} as const;

// ============ Utility Types ============

/**
 * Options for polling task status
 */
export interface VeoPollOptions {
  /** Callback for progress updates */
  onProgress?: (status: string, attempt: number) => void;
  /** Maximum polling attempts (default: 180) */
  maxAttempts?: number;
  /** Polling interval in ms (default: 10000) */
  pollIntervalMs?: number;
}

/**
 * Options for video generation with full workflow
 */
export interface VeoGenerateOptions extends VeoPollOptions {
  /** Callback for stage updates */
  onStage?: (stage: string, detail?: string) => void;
  /** Maximum retries (default: 3) */
  maxRetries?: number;
}

/**
 * Options for video download
 */
export interface VeoDownloadOptions {
  /** Timeout in ms (default: 120000) */
  timeoutMs?: number;
}

/**
 * Reference image for image-to-video generation
 */
export interface VeoReferenceImage {
  id: string;
  url: string;
  type?: 'first_frame' | 'last_frame' | 'reference';
  mimeType?: string;
}

/**
 * Video scene for multi-shot generation
 */
export interface VeoVideoScene {
  id: string;
  referenceImages?: VeoReferenceImage[];
  prompt?: string;
  duration?: number;
}
