export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '4:5';
export type ImageSize = '1K' | '2K'; // Gemini 3 Pro supports 2K

export type AppMode = 'RAW';

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

export interface AppSettings {
  temperature: number;
  outputCount: number; // 1-8
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  appendStyleHint: boolean;
  styleHintRaw: string;
  globalReferenceImages: ReferenceImage[];
  // Legacy
  sceneSettings: any;
}

export interface GeneratedImage {
  id: string;
  base64: string;
  mimeType: string;
  seed?: number;
  createdAt: number;
  promptUsed: string;
  settingsSnapshot: AppSettings;
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