/**
 * Prompt Generator Service — calls the Python ADK agent backend
 * instead of Gemini directly.
 *
 * The agent runs at a configurable URL (default http://localhost:8001)
 * and the user's Gemini API key is passed per-request.
 */

export interface GeneratedPrompt {
  id: string;
  text: string;
  shotType: string;
  expression: string;
  pose: string;
  cameraAngle: string;
}

export type PromptGeneratorMode = 'storyboard' | 'photoset';

// ---------------------------------------------------------------------------
// Agent URL config
// ---------------------------------------------------------------------------

const AGENT_URL_KEY = 'raw_studio_agent_url';
const DEFAULT_AGENT_URL = import.meta.env.VITE_AGENT_URL
  || (import.meta.env.PROD ? 'https://backend-production-b64a.up.railway.app' : 'http://localhost:8001');

export const getAgentUrl = (): string =>
  localStorage.getItem(AGENT_URL_KEY) || DEFAULT_AGENT_URL;

export const setAgentUrl = (url: string) =>
  localStorage.setItem(AGENT_URL_KEY, url);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export const checkAgentHealth = async (): Promise<boolean> => {
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
// Generate prompts (initial)
// ---------------------------------------------------------------------------

export interface GenerateResult {
  sessionId: string;
  prompts: GeneratedPrompt[];
}

export const generatePrompts = async (
  apiKey: string,
  imageBase64: string,
  imageMimeType: string,
  mode: PromptGeneratorMode,
  count: number,
  sceneContext?: string,
  signal?: AbortSignal
): Promise<GenerateResult> => {
  if (!apiKey) throw new Error('Gemini API Key is missing. Set it in API Key settings.');

  const res = await fetch(`${getAgentUrl()}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      image_base64: imageBase64,
      image_mime_type: imageMimeType,
      mode,
      count,
      scene_context: sceneContext || null,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Agent error: ${res.status}`);
  }

  const data = await res.json();
  return {
    sessionId: data.session_id,
    prompts: (data.prompts || []).map((p: any) => ({
      id: p.id || crypto.randomUUID(),
      text: p.text || '',
      shotType: p.shotType || '',
      expression: p.expression || '',
      pose: p.pose || '',
      cameraAngle: p.cameraAngle || '',
    })),
  };
};

// ---------------------------------------------------------------------------
// Refine prompts (follow-up)
// ---------------------------------------------------------------------------

export interface RefineResult {
  sessionId: string;
  prompts: GeneratedPrompt[];
}

export const refinePrompts = async (
  apiKey: string,
  sessionId: string,
  message: string,
  promptIndex?: number,
  signal?: AbortSignal
): Promise<RefineResult> => {
  if (!apiKey) throw new Error('Gemini API Key is missing.');

  const res = await fetch(`${getAgentUrl()}/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      session_id: sessionId,
      message,
      prompt_index: promptIndex ?? null,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Agent error: ${res.status}`);
  }

  const data = await res.json();
  return {
    sessionId: data.session_id,
    prompts: (data.prompts || []).map((p: any) => ({
      id: p.id || crypto.randomUUID(),
      text: p.text || '',
      shotType: p.shotType || '',
      expression: p.expression || '',
      pose: p.pose || '',
      cameraAngle: p.cameraAngle || '',
    })),
  };
};
