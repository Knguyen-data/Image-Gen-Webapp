import { AppSettings, ComfyUISettings, UnifiedVideoSettings, VideoModel } from './types';

// Reverting to the model ID user requested (Nano Banana Pro equivalent)
export const GEMINI_MODEL_ID = 'gemini-3-pro-image-preview';

export const DEFAULT_SETTINGS: AppSettings = {
  temperature: 1.0,
  outputCount: 1,
  aspectRatio: '9:16', // Default for mobile posters
  imageSize: '1K',
  fixedBlockEnabled: false,
  fixedBlockText: '',
  fixedBlockImages: [],
  fixedBlockPosition: 'bottom',
  safetyFilterEnabled: true, // Default: enabled (use API defaults)
  spicyMode: {
    enabled: false,
    quality: 'basic',
    subMode: 'edit'
  }
};

export const ASPECT_RATIO_LABELS: Record<string, string> = {
  '9:16': '9:16 (1080x1920) - Story/Poster',
  '16:9': '16:9 (1920x1080) - Landscape',
  '1:1': '1:1 (1200x1200) - Square',
  '3:4': '3:4 (1080x1350) - Portrait',
  '4:3': '4:3 (1440x1080) - Presentation',
  '4:5': '4:5 (1080x1350) - Social/Instagram'
};

export const IMAGE_SIZE_LABELS: Record<string, string> = {
  '1K': '1K (~1024px) - Standard',
  '2K': '2K (~2048px) - High Quality',
  '4K': '4K (~4096px) - Ultra Quality'
};

export const SEEDREAM_QUALITY_LABELS: Record<string, string> = {
  'basic': 'Basic (2K)',
  'high': 'High (4K)'
};

export const SAFETY_CATEGORIES = [
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT'
] as const;

// ComfyUI (Extreme Spicy Mode)
export const COMFYUI_SAMPLER_LABELS: Record<string, string> = {
  'euler': 'Euler',
  'euler_ancestral': 'Euler Ancestral',
  'dpmpp_2m': 'DPM++ 2M',
  'dpmpp_sde': 'DPM++ SDE',
};

export const COMFYUI_SCHEDULER_LABELS: Record<string, string> = {
  'simple': 'Simple',
  'normal': 'Normal',
  'karras': 'Karras',
  'sgm_uniform': 'SGM Uniform',
};

export const DEFAULT_COMFYUI_SETTINGS: ComfyUISettings = {
  steps: 25,
  cfg: 1.0,
  denoise: 1.0,
  sampler: 'euler',
  scheduler: 'simple',
  seed: -1,
  ipAdapterWeight: 1.0,
  ipAdapterFaceidWeight: 1.0,
  loraId: undefined,
  loraWeight: 0.8,
  loraFilename: undefined,
};

// RunPod endpoint (hardcoded since it's a personal deployment)
export const COMFYUI_RUNPOD_ENDPOINT_ID = 'rj1ppodzmtdoiz';

// RunPod LoRA Training endpoint (separate serverless worker)
export const LORA_TRAINING_RUNPOD_ENDPOINT_ID = 'mpjk7veok6fb0j';

// Video Validation Constraints (Kling 2.6 Motion Control)
export const VIDEO_CONSTRAINTS = {
  allowedFormats: ['video/mp4', 'video/quicktime'],
  formatLabels: ['MP4', 'MOV'],
  maxSizeMB: 100,
  maxSizeBytes: 100 * 1024 * 1024,
  minDurationSec: 3,
  maxDurationImageMode: 10,
  maxDurationVideoMode: 30,
  // Aspect ratios for future validation
  allowedAspectRatios: ['9:16', '16:9', '4:5'],
} as const;

// Video Model Labels
export const VIDEO_MODEL_LABELS: Record<VideoModel, string> = {
  'kling-2.6': 'Kling 2.6 Motion Control',
  'kling-2.6-pro': 'Kling 2.6 Pro — Image to Video',
  'kling-3': 'Kling 3 — MultiShot',
  'kling-3-omni': 'Kling 3 Omni — Multimodal',
  'veo-3.1': 'Veo 3.1 — Google AI Video',
  'director': 'Director Pipeline — AI Multi-Shot',
};

// Default Unified Video Settings
export const DEFAULT_UNIFIED_VIDEO_SETTINGS: UnifiedVideoSettings = {
  model: 'kling-2.6',
  referenceVideoMode: 'global',
  orientation: 'image',
  klingResolution: '720p',
  klingProvider: 'freepik',
  klingProDuration: '5',
  klingProAspectRatio: 'widescreen_16_9',
  klingCfgScale: 0.5,
  klingProNegativePrompt: '',
  klingProGenerateAudio: false,
  // Kling 3 defaults
  kling3AspectRatio: '16:9',
  kling3Duration: 5,
  kling3CfgScale: 0.5,
  kling3NegativePrompt: '',
  kling3GenerateAudio: false,
  kling3OmniInputMode: 'text-to-video',
};

// Maximum reference images per prompt
export const MAX_REFERENCE_IMAGES = 7;

// Maximum number of prompt cards
export const MAX_PROMPTS = 50;
