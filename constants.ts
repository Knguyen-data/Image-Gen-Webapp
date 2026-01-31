import { AppSettings } from './types';

// Reverting to the model ID user requested (Nano Banana Pro equivalent)
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
  safetyFilterEnabled: true, // Default: enabled (use API defaults)
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

export const SAFETY_CATEGORIES = [
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT',
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT'
] as const;