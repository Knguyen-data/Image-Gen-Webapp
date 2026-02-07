export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5';
export type ImageSize = '1K' | '2K' | '4K'; // Gemini 3 Pro supports up to 4K

export type AppMode = 'image' | 'video';

export type VideoModel = 'kling-2.6' | 'wan-2.2-move' | 'wan-2.2-replace';

export interface ReferenceImage {
  id: string;
  base64: string;
  mimeType: string;
  previewUrl?: string; // For UI display only
}

export interface PromptItem {
  id: string;
  text: string;
  referenceImages: ReferenceImage[];
}

// Seedream 4.5 Edit Types (Spicy Mode)
export type SeedreamAspectRatio = '1:1' | '4:3' | '3:4' | '16:9' | '9:16' | '2:3' | '3:2' | '21:9';
export type SeedreamQuality = 'basic' | 'high';
export type SpicySubMode = 'edit' | 'generate';
export type GenerationModel = 'gemini' | 'seedream-edit' | 'seedream-txt2img';

export interface SpicyModeSettings {
  enabled: boolean;
  quality: SeedreamQuality;
  subMode: SpicySubMode;
}

export interface AppSettings {
  temperature: number;
  outputCount: number; // 1-8
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  appendStyleHint: boolean;
  styleHintRaw: string;
  globalReferenceImages: ReferenceImage[];
  safetyFilterEnabled: boolean; // Safety filter (true = enabled, false = BLOCK_NONE)
  // Spicy Mode (Seedream 4.5 Edit)
  spicyMode: SpicyModeSettings;
}

export interface GeneratedImage {
  id: string;
  base64: string;
  mimeType: string;
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
  styleHintUsed: boolean;
  finalPrompt: string;
  settingsSnapshot: AppSettings;
  images: GeneratedImage[];
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

// Video Generation Types
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
}

/** @deprecated Use UnifiedVideoSettings instead */
export interface VideoSettings {
  referenceVideoMode: VideoRefMode;
  globalReferenceVideo?: ReferenceVideo;
  orientation: 'image' | 'video';
  resolution: '720p' | '1080p';
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
}

// Animate Mode Types (Wan 2.2 Animate)
export type AnimateSubMode = 'move' | 'replace';
export type AnimateResolution = '480p' | '580p' | '720p';

/** @deprecated Use UnifiedVideoSettings instead */
export interface AnimateSettings {
  subMode: AnimateSubMode;
  resolution: AnimateResolution;
}

export interface AnimateJob {
  id: string;
  characterImage: ReferenceImage;
  referenceVideoFile: File;
  referenceVideoPreviewUrl: string;
  subMode: AnimateSubMode;
  resolution: AnimateResolution;
  status: 'pending' | 'generating' | 'success' | 'failed';
  resultVideoUrl?: string;
  error?: string;
  createdAt: number;
}

// Unified Video Settings (merges Kling 2.6 + Wan 2.2)
export interface UnifiedVideoSettings {
  model: VideoModel;
  // Kling-specific
  referenceVideoMode: VideoRefMode;
  globalReferenceVideo?: ReferenceVideo;
  orientation: 'image' | 'video';
  klingResolution: '720p' | '1080p';
  // Wan-specific
  wanResolution: AnimateResolution; // '480p' | '580p' | '720p'
}
