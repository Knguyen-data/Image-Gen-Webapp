/**
 * ComfyUI RunPod Serverless Service
 * Handles async job submission, polling, and result extraction
 * for the Lustify SDXL + IPAdapter FaceID ComfyUI workflow.
 */

import {
  ComfyUISettings,
  ComfyUIRunPodJob,
  ComfyUIDimensions,
  AspectRatio,
} from '../types';
import { logger } from './logger';

const RUNPOD_BASE = '/api/runpod';  // Proxied via Vite -> https://api.runpod.ai
const MAX_POLL_ATTEMPTS = 120;      // 10 min at 5s intervals
const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Aspect ratio -> SDXL dimensions mapping
// ---------------------------------------------------------------------------

export const mapAspectRatioToDimensions = (
  ratio: AspectRatio,
): ComfyUIDimensions => {
  const map: Record<AspectRatio, ComfyUIDimensions> = {
    '1:1':  { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },
    '9:16': { width: 768,  height: 1344 },
    '4:3':  { width: 1152, height: 896 },
    '3:4':  { width: 896,  height: 1152 },
    '4:5':  { width: 896,  height: 1152 },
  };
  return map[ratio] || { width: 1024, height: 1024 };
};

// ---------------------------------------------------------------------------
// Workflow prompt builder (ComfyUI API format)
// ---------------------------------------------------------------------------

/**
 * Build ComfyUI workflow prompt in API format.
 * The handler.py passes event.input directly to ComfyUI /api/prompt as the
 * "prompt" field, so this object represents the node graph keyed by node id.
 */
export const buildWorkflowPrompt = (
  promptText: string,
  settings: ComfyUISettings,
  dimensions: ComfyUIDimensions,
  faceImageBase64?: string,
): Record<string, unknown> => {
  const seed =
    settings.seed === -1
      ? Math.floor(Math.random() * 2147483647)
      : settings.seed;

  // Base nodes (always present)
  const prompt: Record<string, unknown> = {
    // Checkpoint loader
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'lustifySDXLNSFW_ggwpV7.safetensors' },
    },
    // CLIP loader
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: 't5xxl_fp16.safetensors', type: 'sdxl' },
    },
    // Positive prompt
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: promptText,
        clip: ['2', 0],
      },
    },
    // Negative prompt
    '8': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'ugly, blurry, low quality, deformed',
        clip: ['2', 0],
      },
    },
    // Empty latent image
    '13': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: dimensions.width,
        height: dimensions.height,
        batch_size: 1,
      },
    },
    // KSampler -- model input is wired below depending on IPAdapter
    '10': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0], // default: from checkpoint directly
        positive: ['7', 0],
        negative: ['8', 0],
        latent_image: ['13', 0],
        seed,
        steps: settings.steps,
        cfg: settings.cfg,
        sampler_name: settings.sampler,
        scheduler: settings.scheduler,
        denoise: settings.denoise,
      },
    },
    // VAE Decode
    '11': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['10', 0],
        vae: ['1', 2],
      },
    },
    // Save Image (output node)
    '12': {
      class_type: 'SaveImage',
      inputs: {
        images: ['11', 0],
        filename_prefix: 'ComfyUI',
      },
    },
  };

  // If face reference provided, inject IPAdapter chain
  if (faceImageBase64) {
    // CLIP Vision loader
    prompt['3'] = {
      class_type: 'CLIPVisionLoader',
      inputs: {
        clip_name: 'CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors',
      },
    };
    // IPAdapter model loader
    prompt['4'] = {
      class_type: 'IPAdapterModelLoader',
      inputs: { ipadapter_file: 'ip-adapter-faceid_sdxl.bin' },
    };
    // Load face image (base64 string)
    prompt['6'] = {
      class_type: 'LoadImage',
      inputs: { image: faceImageBase64 },
    };
    // IPAdapter Advanced
    prompt['5'] = {
      class_type: 'IPAdapterAdvanced',
      inputs: {
        model: ['1', 0],
        clip: ['2', 0],
        ipadapter: ['4', 0],
        clip_vision: ['3', 0],
        image: ['6', 0],
        weight: settings.ipAdapterWeight,
        weight_faceidv2: settings.ipAdapterFaceidWeight,
        combine_embeds: 'Average',
        embeds_scaling: 'V only',
      },
    };
    // Rewire KSampler to use IPAdapter-modified model
    (prompt['10'] as Record<string, Record<string, unknown>>).inputs.model = [
      '5',
      0,
    ];
  }

  return prompt;
};

// ---------------------------------------------------------------------------
// RunPod API methods
// ---------------------------------------------------------------------------

/** Submit an async job to RunPod */
export const submitRunPodJob = async (
  endpointId: string,
  apiKey: string,
  workflowPrompt: Record<string, unknown>,
): Promise<string> => {
  const url = `${RUNPOD_BASE}/v2/${endpointId}/run`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: workflowPrompt }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('Invalid RunPod API key');
    if (response.status === 403) throw new Error('RunPod API key lacks endpoint access');
    throw new Error(`RunPod submit failed: ${response.status}`);
  }

  const result = await response.json();
  logger.info('ComfyUI', 'Job submitted', { jobId: result.id });
  return result.id;
};

/** Poll RunPod job until completion or failure */
export const pollRunPodJob = async (
  endpointId: string,
  apiKey: string,
  jobId: string,
  onProgress?: (status: string, attempt: number) => void,
): Promise<ComfyUIRunPodJob> => {
  let attempt = 0;

  while (attempt < MAX_POLL_ATTEMPTS) {
    const url = `${RUNPOD_BASE}/v2/${endpointId}/status/${jobId}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const job: ComfyUIRunPodJob = await response.json();
    onProgress?.(job.status, attempt);

    if (job.status === 'COMPLETED') return job;
    if (job.status === 'FAILED') {
      throw new Error(
        `ComfyUI job failed: ${job.output?.error || job.error || 'Unknown'}`,
      );
    }
    if (job.status === 'CANCELLED') {
      throw new Error('Job was cancelled');
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    attempt++;
  }

  throw new Error(
    'Timeout: ComfyUI generation did not complete within 10 minutes',
  );
};

/** Cancel a RunPod job */
export const cancelRunPodJob = async (
  endpointId: string,
  apiKey: string,
  jobId: string,
): Promise<void> => {
  await fetch(`${RUNPOD_BASE}/v2/${endpointId}/cancel/${jobId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
};

// ---------------------------------------------------------------------------
// Image extraction helpers
// ---------------------------------------------------------------------------

/** Convert a blob to { base64, mimeType } */
const blobToBase64 = (blob: Blob): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve({
        base64: dataUrl.split(',')[1],
        mimeType: blob.type || 'image/png',
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * Extract base64 image from ComfyUI worker output.
 *
 * The worker returns `{ success, outputs }` where outputs is keyed by node id.
 * SaveImage node ("12") returns `{ images: [{ filename, subfolder, type }] }`.
 * The handler may also include `data` (base64) or `url` depending on config.
 */
const extractImageFromOutput = async (
  output: ComfyUIRunPodJob['output'],
): Promise<{ base64: string; mimeType: string }> => {
  if (!output?.success || !output.outputs) {
    throw new Error('No output from ComfyUI worker');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const saveNodeOutput = (output.outputs as Record<string, any>)['12'];
  if (!saveNodeOutput?.images?.[0]) {
    throw new Error('No images in ComfyUI output');
  }

  const imageData = saveNodeOutput.images[0];

  // Direct base64 data
  if (imageData.data) {
    return { base64: imageData.data, mimeType: 'image/png' };
  }

  // URL-based output (download and convert)
  if (imageData.url) {
    const imgResponse = await fetch(imageData.url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!imgResponse.ok) {
      throw new Error(`Image download failed: ${imgResponse.status}`);
    }
    const blob = await imgResponse.blob();
    return blobToBase64(blob);
  }

  throw new Error('Unexpected output format from ComfyUI worker');
};

// ---------------------------------------------------------------------------
// Full generation flow
// ---------------------------------------------------------------------------

/**
 * Complete ComfyUI generation: build prompt -> submit -> poll -> extract image.
 */
export const generateWithComfyUI = async (
  endpointId: string,
  apiKey: string,
  promptText: string,
  settings: ComfyUISettings,
  dimensions: ComfyUIDimensions,
  faceImageBase64?: string,
  onProgress?: (stage: string, detail?: string) => void,
): Promise<{ base64: string; mimeType: string }> => {
  // Step 1: Build workflow
  onProgress?.('building', 'Building ComfyUI workflow...');
  const workflowPrompt = buildWorkflowPrompt(
    promptText,
    settings,
    dimensions,
    faceImageBase64,
  );

  // Step 2: Submit job
  onProgress?.('submitting', 'Submitting to RunPod...');
  const jobId = await submitRunPodJob(endpointId, apiKey, workflowPrompt);

  // Step 3: Poll for result
  onProgress?.('generating', 'Generating with ComfyUI...');
  const job = await pollRunPodJob(
    endpointId,
    apiKey,
    jobId,
    (status, attempt) => {
      onProgress?.(
        'polling',
        `${status} (${attempt + 1}/${MAX_POLL_ATTEMPTS})`,
      );
    },
  );

  // Step 4: Extract image from outputs
  onProgress?.('extracting', 'Extracting generated image...');
  const result = await extractImageFromOutput(job.output);

  onProgress?.('complete', 'Done!');
  return result;
};
