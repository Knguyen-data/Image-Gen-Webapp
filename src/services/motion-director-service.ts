/**
 * Motion Director Service — calls the Python ADK motion director backend
 * to generate Kling 2.6 I2V motion prompts using a 3-agent pipeline.
 *
 * Same URL/key patterns as prompt-generator-service.ts.
 */

import { getAgentUrl } from './prompt-generator-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MotionStylePreset =
  | 'fashion_walk'
  | 'fashion_show'
  | 'music_video'
  | 'cinematic_narrative'
  | 'product_showcase'
  | 'dance_performance'
  | 'editorial';

export interface MotionStyleOption {
  value: MotionStylePreset;
  label: string;
  description: string;
  icon: string;
}

export const MOTION_STYLE_OPTIONS: MotionStyleOption[] = [
  { value: 'fashion_walk', label: 'Fashion Walk', description: 'Steady tracking, low angles, confident stride', icon: '👠' },
  { value: 'fashion_show', label: 'Fashion Show', description: 'Rhythmic, dynamic angles, runway energy', icon: '💃' },
  { value: 'music_video', label: 'Music Video', description: 'Creative angles, expressive, beat-driven', icon: '🎵' },
  { value: 'cinematic_narrative', label: 'Cinematic', description: 'Classical cinematography, slow build', icon: '🎬' },
  { value: 'product_showcase', label: 'Product', description: 'Smooth orbits, luxurious reveals', icon: '💎' },
  { value: 'dance_performance', label: 'Dance', description: 'Energetic tracking, full body motion', icon: '🩰' },
  { value: 'editorial', label: 'Editorial', description: 'Contemplative, static, micro-expressions', icon: '📸' },
];

export interface MotionImageInput {
  base64: string;
  mime_type: string;
}

export interface MotionPromptResult {
  scene_index: number;
  motion_prompt: string;
  camera_move: string;
  subject_motion: string;
  duration_suggestion: string;
  negative_prompt?: string;
}

export interface MotionGenerateResult {
  sessionId: string;
  prompts: MotionPromptResult[];
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export const checkMotionHealth = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${getAgentUrl()}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === 'ok';
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Generate motion prompts
// ---------------------------------------------------------------------------

export const generateMotionPrompts = async (
  apiKey: string,
  images: MotionImageInput[],
  stylePreset: MotionStylePreset,
  userNote?: string,
  signal?: AbortSignal,
): Promise<MotionGenerateResult> => {
  if (!apiKey) throw new Error('Gemini API Key is missing. Set it in API Key settings.');
  if (!images.length) throw new Error('At least one image is required.');

  const res = await fetch(`${getAgentUrl()}/motion/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      images,
      style_preset: stylePreset,
      user_note: userNote || null,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Motion Director error: ${res.status}`);
  }

  const data = await res.json();
  return {
    sessionId: data.session_id,
    prompts: (data.prompts || []).map((p: any) => ({
      scene_index: p.scene_index ?? 0,
      motion_prompt: p.motion_prompt || '',
      camera_move: p.camera_move || '',
      subject_motion: p.subject_motion || '',
      duration_suggestion: p.duration_suggestion || '5s',
      negative_prompt: p.negative_prompt || undefined,
    })),
  };
};

// ---------------------------------------------------------------------------
// Refine motion prompts
// ---------------------------------------------------------------------------

export const refineMotionPrompts = async (
  apiKey: string,
  sessionId: string,
  message: string,
  sceneIndex?: number,
  signal?: AbortSignal,
): Promise<MotionGenerateResult> => {
  if (!apiKey) throw new Error('Gemini API Key is missing.');

  const res = await fetch(`${getAgentUrl()}/motion/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      session_id: sessionId,
      message,
      scene_index: sceneIndex ?? null,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Motion Director error: ${res.status}`);
  }

  const data = await res.json();
  return {
    sessionId: data.session_id,
    prompts: (data.prompts || []).map((p: any) => ({
      scene_index: p.scene_index ?? 0,
      motion_prompt: p.motion_prompt || '',
      camera_move: p.camera_move || '',
      subject_motion: p.subject_motion || '',
      duration_suggestion: p.duration_suggestion || '5s',
      negative_prompt: p.negative_prompt || undefined,
    })),
  };
};
