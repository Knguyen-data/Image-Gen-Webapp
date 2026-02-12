export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5';
export type ImageSize = '1K' | '2K' | '4K'; // Gemini 3 Pro supports up to 4K

export type AppMode = 'image' | 'video' | 'editing';
export type FixedBlockPosition = 'top' | 'bottom';

export type VideoModel = 'kling-2.6' | 'kling-2.6-pro' | 'kling-3' | 'kling-3-omni' | 'veo-3.1';
export type KlingProvider = 'freepik' | 'kieai';

export interface ReferenceImage {
  id: string;
  base64: string;
  mimeType: string;
  previewUrl?: string; // For UI display only
  label?: string; // Optional label for the model (e.g., "Original Reference", "Failed Attempt #1")
}

export interface PromptItem {
  id: string;
  text: string;
  referenceImages: ReferenceImage[];
}

// Seedream 4.5 Edit Types (Spicy Mode)
export type SeedreamAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '21:9';
export type SeedreamQuality = 'basic' | 'high';
export type SpicySubMode = 'edit' | 'generate' | 'extreme';
export type GenerationModel = 'gemini' | 'seedream-edit' | 'seedream-txt2img' | 'comfyui-lustify';

export interface SpicyModeSettings {
  enabled: boolean;
  quality: SeedreamQuality;
  subMode: SpicySubMode;
  // Extreme Mode (ComfyUI) settings
  comfyui?: ComfyUISettings;
}

export interface AppSettings {
  temperature: number;
  outputCount: number; // 1-8
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  fixedBlockEnabled: boolean;
  fixedBlockText: string;
  fixedBlockImages: ReferenceImage[];
  fixedBlockPosition: FixedBlockPosition;
  safetyFilterEnabled: boolean; // Safety filter (true = enabled, false = BLOCK_NONE)
  // Spicy Mode (Seedream 4.5 Edit)
  spicyMode: SpicyModeSettings;
}

export interface GeneratedImage {
  id: string;
  base64: string;
  mimeType: string;
  thumbnailBase64?: string;
  thumbnailMimeType?: string;
  seed?: number;
  createdAt: number;
  promptUsed: string;
  settingsSnapshot: AppSettings;
  generatedBy?: GenerationModel;
  status?: 'pending' | 'generating' | 'success' | 'failed';
  error?: string;
}

export interface Run {
  id: string;
  name: string;
  createdAt: number;
  promptRaw: string;
  fixedBlockUsed: boolean;
  finalPrompt: string;
  settingsSnapshot: AppSettings;
  images: GeneratedImage[];
  referenceImages?: ReferenceImage[];  // stored at generation time for retry
}

export interface GenerationRequest {
  prompt: string;
  referenceImages: ReferenceImage[];
  settings: AppSettings;
  apiKey: string;
  signal?: AbortSignal;
}

export interface ModificationRequest extends GenerationRequest {
  sourceImage: ReferenceImage;
}

export interface SeedreamSettings {
  aspectRatio: SeedreamAspectRatio;
  quality: SeedreamQuality;
}

export interface SeedreamTask {
  taskId: string;
  state: 'waiting' | 'success' | 'fail';
  resultUrls?: string[];
  failMsg?: string;
  failCode?: string;
  costTime?: number;
}

// ComfyUI RunPod Types (Extreme Spicy Mode)
export type ComfyUISampler = 'euler' | 'euler_ancestral' | 'dpmpp_2m' | 'dpmpp_sde';
export type ComfyUIScheduler = 'normal' | 'karras' | 'sgm_uniform';

export interface ComfyUISettings {
  steps: number;        // 15-50, default 20
  cfg: number;          // 1-15, default 8
  denoise: number;      // 0-1, default 1.0
  sampler: ComfyUISampler;    // default 'euler'
  scheduler: ComfyUIScheduler; // default 'normal'
  seed: number;         // -1 = random
  ipAdapterWeight: number;     // 0-2, default 1.0 (face strength)
  ipAdapterFaceidWeight: number; // 0-2, default 1.0
}

export interface ComfyUIRunPodJob {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  output?: {
    success: boolean;
    outputs?: Record<string, unknown>;
    error?: string;
  };
  error?: string;
}

export type ComfyUIDimensions = { width: number; height: number };
export type VideoRefMode = 'global' | 'per-scene';

export interface ReferenceVideo {
  id: string;
  file: File;
  previewUrl: string;  // blob URL for preview
  duration?: number;   // seconds
}

export interface VideoScene {
  id: string;
  referenceImage: ReferenceImage;  // existing type
  referenceVideo?: ReferenceVideo; // only if per-scene mode
  prompt?: string; // Optional prompt for video generation
  usePrompt?: boolean; // Toggle to enable/disable prompt per scene
  duration?: number; // Kling 3: duration for this scene (seconds)
}

/** @deprecated Use UnifiedVideoSettings instead */
export interface VideoSettings {
  referenceVideoMode: VideoRefMode;
  globalReferenceVideo?: ReferenceVideo;
  orientation: 'image' | 'video';
  resolution: '720p' | '1080p';
  klingProvider?: KlingProvider;
  klingProDuration?: KlingProDuration;
  klingProAspectRatio?: KlingProAspectRatio;
  klingCfgScale?: number;
  klingProNegativePrompt?: string;
  klingProGenerateAudio?: boolean;
}

export interface GeneratedVideo {
  id: string;
  sceneId: string;
  url: string;
  thumbnailUrl?: string;
  duration: number;
  prompt: string;
  createdAt: number;
  status: 'pending' | 'generating' | 'success' | 'failed';
  error?: string;
  provider?: KlingProvider;
  // AMT Interpolation result
  isInterpolated?: boolean;
  originalVideoId?: string; // Reference to source video if this is an interpolated result
  // Supabase Storage URL (real HTTP URL, avoids blob URL HEAD errors)
  supabaseUrl?: string;
}

export type KlingProAspectRatio = 'widescreen_16_9' | 'social_story_9_16' | 'square_1_1';
export type KlingProDuration = '5' | '10';

// Kling 3 Types
export type Kling3AspectRatio = '16:9' | '9:16' | '1:1' | 'auto';
export type Kling3OmniInputMode = 'text-to-video' | 'image-to-video' | 'video-to-video';

// Kling 3 image_list item
export interface Kling3ImageListItem {
  image_url: string;
  type: 'first_frame' | 'end_frame';
}

// Kling 3 multi_prompt item
export interface Kling3MultiPromptItem {
  index: number;  // 0-5
  prompt: string;  // max 2500 chars
  duration: number;  // min 3 seconds
}

// Kling 3 Omni element definition
export interface Kling3Element {
  reference_image_urls: string[];
  frontal_image_url?: string;
}

// Unified Video Settings (Kling 2.6 + Kling 3)
export interface UnifiedVideoSettings {
  model: VideoModel;
  // Kling Motion Control
  referenceVideoMode: VideoRefMode;
  globalReferenceVideo?: ReferenceVideo;
  orientation: 'image' | 'video';
  klingResolution: '720p' | '1080p';
  klingProvider: KlingProvider;
  // Kling Pro I2V
  klingProDuration: KlingProDuration;
  klingProAspectRatio: KlingProAspectRatio;
  // Shared Kling settings
  klingCfgScale: number; // 0-1, controls prompt adherence (default 0.5)
  // Pro I2V only
  klingProNegativePrompt: string;
  klingProGenerateAudio: boolean;
  // Kling 3 settings
  kling3AspectRatio: Kling3AspectRatio;
  kling3Duration: number;  // 3-15 seconds, flexible
  kling3CfgScale: number;  // 0-1
  kling3NegativePrompt: string;
  kling3GenerateAudio: boolean;
  kling3OmniInputMode: Kling3OmniInputMode;
  // Kling 3 quality tier (standard or pro)
  kling3Tier?: 'standard' | 'pro';
  // Kling 3 shot type (customize or intelligent) — Kling 3 only, not Omni
  kling3ShotType?: 'customize' | 'intelligent';
}

// ============ Veo 3.1 Video Generation Types ============

export type VeoModel = 'veo3' | 'veo3_fast';
export type VeoGenerationType = 'TEXT_2_VIDEO' | 'FIRST_AND_LAST_FRAMES_2_VIDEO' | 'REFERENCE_2_VIDEO';
export type VeoAspectRatio = '16:9' | '9:16' | 'Auto';
export type VeoTaskStatus = 0 | 1 | 2 | 3; // 0: Generating, 1: Success, 2: Failed, 3: Generation Failed
export type VeoResolution = '720p' | '1080p' | '4K';

export interface VeoGenerateRequest {
  prompt: string;
  imageUrls?: string[];
  model?: VeoModel;
  generationType?: VeoGenerationType;
  aspectRatio?: VeoAspectRatio;
  seeds?: number;
  callBackUrl?: string;
  enableTranslation?: boolean;
  watermark?: string;
}

export interface VeoExtendRequest {
  taskId: string;
  prompt: string;
  seeds?: number;
  watermark?: string;
  callBackUrl?: string;
  model?: 'fast' | 'quality';
}

export interface VeoGenerateResponse {
  code: number;
  msg: string;
  data: { taskId: string };
}

export interface VeoExtendResponse {
  code: number;
  msg: string;
  data: { taskId: string };
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
    fallbackFlag?: boolean;
    failCode?: string;
    failMsg?: string;
    costTime?: number;
  };
}

export interface Veo1080pRequest {
  taskId: string;
  index?: number;
}

export interface Veo1080pResponse {
  code: number;
  msg: string;
  data: { resultUrl: string };
}

export interface Veo4kRequest {
  taskId: string;
  index?: number;
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

export type VeoVideoResult = {
  taskId: string;
  videoUrls: string[];
  originUrls?: string[];
  resolution?: string;
  isFallback: boolean;
};

export type Veo4kResult = {
  taskId: string;
  videoUrls: string[];
  imageUrls?: string[];
};
