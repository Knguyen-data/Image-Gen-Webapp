import { AppSettings } from './types';

// Using Gemini 3 Pro Image Preview (Nano Banana Pro equivalent)
export const GEMINI_MODEL_ID = 'gemini-3-pro-image-preview';

export const DEFAULT_STYLE_HINT = `Brand: DashBooking
Tone: Pastel Green, Clean, Minimalist, Tech-forward.
Visuals: Soft gradients, rounded UI elements, eco-friendly vibe.`;

export const DEFAULT_SETTINGS: AppSettings = {
  temperature: 1.0,
  outputCount: 1,
  aspectRatio: '9:16', // Default for mobile posters
  imageSize: '1K',
  appendStyleHint: false,
  styleHintRaw: DEFAULT_STYLE_HINT,
  globalReferenceImages: [],
  sceneSettings: {
    depthOfField: 50, // Balanced blur
    referenceImageBase64: null,
    referenceImageMimeType: 'image/png'
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