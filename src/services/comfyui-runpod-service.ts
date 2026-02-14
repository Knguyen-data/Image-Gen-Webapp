/**
 * Unified RunPod Service
 * Redirects "Extreme" mode to the new wan22-nsfw-worker.
 * Uses pure diffusers FLUX.1-dev (or FLUX.2 if enabled).
 */

import {
  ComfyUISettings,
  ComfyUIRunPodJob,
  ComfyUIDimensions,
  AspectRatio,
} from '../types';
import { logger } from './logger';

// NEW UNIFIED ENDPOINT
const RUNPOD_ENDPOINT_ID = 'wx8spcrnnbjwgr';
const RUNPOD_BASE = '/api/runpod';
const MAX_POLL_ATTEMPTS = 120;
const POLL_INTERVAL_MS = 5000;

export const mapAspectRatioToDimensions = (
  ratio: AspectRatio,
): ComfyUIDimensions => {
  const map: Record<AspectRatio, ComfyUIDimensions> = {
    '1:1':  { width: 1024, height: 1024 },
    '16:9': { width: 1280, height: 720 },
    '9:16': { width: 720,  height: 1280 },
    '4:3':  { width: 1152, height: 864 },
    '3:4':  { width: 864,  height: 1152 },
    '4:5':  { width: 832,  height: 1024 },
  };
  return map[ratio] || { width: 1024, height: 1024 };
};

/**
 * Complete generation flow using the unified Wan22/Flux worker.
 */
export const generateWithComfyUI = async (
  _oldEndpointId: string, // Ignored, using unified instead
  apiKey: string,
  promptText: string,
  settings: ComfyUISettings,
  dimensions: ComfyUIDimensions,
  faceImageBase64?: string,
  onProgress?: (stage: string, detail?: string) => void,
): Promise<{ base64: string; mimeType: string }> => {
  
  onProgress?.('submitting', 'Submitting to Unified Worker...');
  
  const seed = settings.seed === -1 ? Math.floor(Math.random() * 2147483647) : settings.seed;

  // New Unified Worker Payload
  const input = {
    job_type: 'flux_img2img', // Route to Flux diffusers pipeline
    prompt: promptText,
    image_base64: faceImageBase64, // Face reference
    width: dimensions.width,
    height: dimensions.height,
    strength: settings.denoise || 0.75, // Reuse denoise as img2img strength
    flux_steps: settings.steps || 28,
    flux_guidance: settings.cfg || 3.5,
    seed: seed
  };

  const submitUrl = `${RUNPOD_BASE}/v2/${RUNPOD_ENDPOINT_ID}/run`;
  const response = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input }),
  });

  if (!response.ok) throw new Error(`Unified worker submit failed: ${response.status}`);
  const { id: jobId } = await response.json();

  onProgress?.('generating', 'Generating uncensored image...');
  
  // Polling loop
  let attempt = 0;
  while (attempt < MAX_POLL_ATTEMPTS) {
    const statusUrl = `${RUNPOD_BASE}/v2/${RUNPOD_ENDPOINT_ID}/status/${jobId}`;
    const statusResp = await fetch(statusUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const job: ComfyUIRunPodJob = await statusResp.json();
    onProgress?.('polling', `${job.status} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`);

    if (job.status === 'COMPLETED') {
      // Worker returns { generated_image_base64: "..." }
      const base64 = job.output.generated_image_base64;
      if (!base64) throw new Error('No image in worker output');
      return { base64, mimeType: 'image/webp' };
    }
    
    if (job.status === 'FAILED') throw new Error(`Worker failed: ${job.error}`);
    
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    attempt++;
  }

  throw new Error('Generation timeout');
};
