/**
 * ComfyUI RunPod Serverless Service
 * Handles async job submission, polling, and result extraction
 * for the Flux Dev + IPAdapter FaceID ComfyUI workflow.
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
// Aspect ratio -> Flux Dev dimensions mapping
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
 * Build ComfyUI workflow prompt for Flux Dev in API format.
 * Node structure:
 *   "1" UNETLoader -> MODEL
 *   "2" DualCLIPLoader -> CLIP (clip_l + t5xxl)
 *   "3" VAELoader -> VAE (ae.safetensors)
 *   "20" LoraLoader (optional) -> MODEL, CLIP
 *   "7" CLIPTextEncode (positive) -> CONDITIONING
 *   "8" CLIPTextEncode (empty negative) -> CONDITIONING
 *   "13" EmptyLatentImage -> LATENT
 *   "10" KSampler -> LATENT
 *   "11" VAEDecode -> IMAGE
 *   "12" SaveImage -> output
 */
export const buildWorkflowPrompt = (
  promptText: string,
  settings: ComfyUISettings,
  dimensions: ComfyUIDimensions,
  faceImageBase64?: string,
  loraFilename?: string,
): Record<string, unknown> => {
  const seed =
    settings.seed === -1
      ? Math.floor(Math.random() * 2147483647)
      : settings.seed;

  // Determine LoRA usage
  const useLora = !!(loraFilename && loraFilename.length > 0);
  const loraWeight = settings.loraWeight ?? 0.8;

  // Source node IDs for MODEL and CLIP (rewired when LoRA is active)
  let modelSource: [string, number] = ['1', 0]; // UNETLoader MODEL
  let clipSource: [string, number] = ['2', 0];  // DualCLIPLoader CLIP

  // Base nodes (always present)
  const prompt: Record<string, unknown> = {
    // Flux Dev UNET loader (outputs: MODEL[0])
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: 'flux1-dev.safetensors', weight_dtype: 'fp8_e4m3fn' },
    },
    // Dual CLIP loader for Flux (CLIP-L + T5-XXL) (outputs: CLIP[0])
    '2': {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: 'clip_l.safetensors',
        clip_name2: 't5xxl_fp16.safetensors',
        type: 'flux',
      },
    },
    // Flux VAE (outputs: VAE[0])
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: 'ae.safetensors' },
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
  };

  // Inject LoRA loader between UNET/CLIP and downstream nodes
  if (useLora) {
    prompt['20'] = {
      class_type: 'LoraLoader',
      inputs: {
        model: ['1', 0],     // from UNETLoader
        clip: ['2', 0],      // from DualCLIPLoader
        lora_name: loraFilename,
        strength_model: loraWeight,
        strength_clip: loraWeight,
      },
    };
    modelSource = ['20', 0];
    clipSource = ['20', 1];
  }

  // Positive prompt
  prompt['7'] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: promptText,
      clip: clipSource,
    },
  };
  // Empty negative (Flux Dev doesn't use negative prompts, but KSampler needs the input)
  prompt['8'] = {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: '',
      clip: clipSource,
    },
  };

  // KSampler — Flux Dev defaults: cfg=1.0, euler sampler, simple scheduler
  prompt['10'] = {
    class_type: 'KSampler',
    inputs: {
      model: modelSource,
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
  };
  // VAE Decode (uses Flux VAE from node "3")
  prompt['11'] = {
    class_type: 'VAEDecode',
    inputs: {
      samples: ['10', 0],
      vae: ['3', 0],
    },
  };
  // Save Image (output node)
  prompt['12'] = {
    class_type: 'SaveImage',
    inputs: {
      images: ['11', 0],
      filename_prefix: 'ComfyUI',
    },
  };

  // If face reference provided, inject IPAdapter chain
  if (faceImageBase64) {
    // CLIP Vision loader
    prompt['30'] = {
      class_type: 'CLIPVisionLoader',
      inputs: {
        clip_name: 'CLIP-ViT-bigG-14-laion2B-39B-b160k.safetensors',
      },
    };
    // IPAdapter model loader
    prompt['31'] = {
      class_type: 'IPAdapterModelLoader',
      inputs: { ipadapter_file: 'ip-adapter-faceid_sdxl.bin' },
    };
    // Load face image (base64 uploaded by handler.py)
    prompt['32'] = {
      class_type: 'LoadImage',
      inputs: { image: faceImageBase64 },
    };
    // IPAdapter Advanced — receives model from LoRA (or UNET if no LoRA)
    prompt['33'] = {
      class_type: 'IPAdapterAdvanced',
      inputs: {
        model: modelSource,
        clip: clipSource,
        ipadapter: ['31', 0],
        clip_vision: ['30', 0],
        image: ['32', 0],
        weight: settings.ipAdapterWeight,
        weight_faceidv2: settings.ipAdapterFaceidWeight,
        combine_embeds: 'Average',
        embeds_scaling: 'V only',
      },
    };
    // Rewire KSampler to use IPAdapter-modified model
    (prompt['10'] as Record<string, Record<string, unknown>>).inputs.model = [
      '33',
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
  loraOptions?: { lora_name: string; lora_weight: number; lora_url?: string },
): Promise<string> => {
  const url = `${RUNPOD_BASE}/v2/${endpointId}/run`;

  // Build input payload — include LoRA fields at top level for handler.py
  const input: Record<string, unknown> = { ...workflowPrompt };
  if (loraOptions) {
    input.lora_name = loraOptions.lora_name;
    input.lora_weight = loraOptions.lora_weight;
    if (loraOptions.lora_url) {
      input.lora_url = loraOptions.lora_url;
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input }),
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

/**
 * Extract base64 image from ComfyUI worker output.
 *
 * The handler returns `{ images: [{ filename, data, type }] }`
 * where `data` is the base64-encoded PNG.
 */
const extractImageFromOutput = async (
  output: ComfyUIRunPodJob['output'],
): Promise<{ base64: string; mimeType: string }> => {
  if (!output) {
    throw new Error('No output from ComfyUI worker');
  }

  // Error from handler
  if (output.error) {
    throw new Error(`ComfyUI error: ${output.error}`);
  }

  // New handler format: { images: [{ filename, data, type }] }
  const images = output.images;
  if (images && images.length > 0 && images[0].data) {
    return { base64: images[0].data, mimeType: images[0].type || 'image/png' };
  }

  throw new Error('No images in ComfyUI output');
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
  loraFilename?: string,
): Promise<{ base64: string; mimeType: string }> => {
  // Step 1: Build workflow
  onProgress?.('building', 'Building ComfyUI workflow...');
  const workflowPrompt = buildWorkflowPrompt(
    promptText,
    settings,
    dimensions,
    faceImageBase64,
    loraFilename,
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
