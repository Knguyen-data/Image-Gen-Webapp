/**
 * RIFE (Real-Time Intermediate Flow Estimation) Video Interpolation Service
 * 
 * Uses the RIFE v4 ONNX model (21.5MB) via onnxruntime-web for client-side
 * AI-powered frame interpolation. WebGPU accelerated with WASM fallback.
 * 
 * Input: Two frames (img0, img1) as [1, 3, H, W] tensors
 * Output: Interpolated midpoint frame [1, 3, H, W]
 */

import * as ort from 'onnxruntime-web';
import { logger } from './logger';

// Configure ONNX Runtime WASM paths — load from CDN to avoid bundling ~25MB of WASM
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.1/dist/';

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL_URL = 'https://huggingface.co/TensorStack/RIFE/resolve/main/model.onnx';
const MODEL_CACHE_KEY = 'rife-model-v1';

// RIFE requires dimensions to be multiples of 32
const ALIGN = 32;

// ─── State ───────────────────────────────────────────────────────────────────

let session: ort.InferenceSession | null = null;
let modelLoadingPromise: Promise<ort.InferenceSession> | null = null;
let executionProvider: string = 'unknown';

// ─── Model Management ───────────────────────────────────────────────────────

/**
 * Load the RIFE ONNX model. Caches in IndexedDB via Cache API.
 * Tries WebGPU first, falls back to WASM.
 */
async function loadModel(
  onProgress?: (status: string) => void,
): Promise<ort.InferenceSession> {
  if (session) return session;
  if (modelLoadingPromise) return modelLoadingPromise;

  modelLoadingPromise = (async () => {
    try {
      // 1. Try to load from cache first
      onProgress?.('Checking model cache...');
      let modelBuffer = await getModelFromCache();

      if (!modelBuffer) {
        onProgress?.('Downloading RIFE model (21.5 MB)...');
        logger.info('RIFE', 'Downloading model from HuggingFace');

        const response = await fetch(MODEL_URL);
        if (!response.ok) {
          throw new Error(`Failed to download model: ${response.status} ${response.statusText}`);
        }

        // Track download progress
        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength) : 0;
        const reader = response.body?.getReader();

        if (!reader) throw new Error('No response body');

        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;

          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            onProgress?.(`Downloading RIFE model: ${pct}% (${(received / 1024 / 1024).toFixed(1)} MB)`);
          }
        }

        // Combine chunks
        modelBuffer = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          modelBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        // Cache for next time
        await cacheModel(modelBuffer);
        logger.info('RIFE', 'Model downloaded and cached', { size: received });
      } else {
        logger.info('RIFE', 'Model loaded from cache');
      }

      // 2. Create inference session
      onProgress?.('Loading RIFE model...');

      // Try execution providers in order of preference
      const providers: ort.InferenceSession.ExecutionProviderConfig[] = [];

      // Check WebGPU support
      if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
        providers.push('webgpu');
      }

      // WASM is always available
      providers.push('wasm');

      for (const provider of providers) {
        try {
          const providerName = typeof provider === 'string' ? provider : 'unknown';
          onProgress?.(`Initializing RIFE (${providerName})...`);

          session = await ort.InferenceSession.create(modelBuffer.buffer, {
            executionProviders: [provider],
            graphOptimizationLevel: 'all',
          });

          executionProvider = providerName;
          logger.info('RIFE', `Model loaded with ${providerName} provider`);
          onProgress?.(`RIFE ready (${providerName})`);
          return session;
        } catch (err) {
          const providerName = typeof provider === 'string' ? provider : 'unknown';
          logger.warn('RIFE', `Failed to load with ${providerName}, trying next`, err);
        }
      }

      throw new Error('Failed to create inference session with any provider');
    } catch (err) {
      modelLoadingPromise = null;
      throw err;
    }
  })();

  return modelLoadingPromise;
}

/**
 * Get model from Cache API (IndexedDB-backed)
 */
async function getModelFromCache(): Promise<Uint8Array | null> {
  try {
    if (!('caches' in window)) return null;
    const cache = await caches.open(MODEL_CACHE_KEY);
    const response = await cache.match(MODEL_URL);
    if (!response) return null;
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * Cache model in Cache API
 */
async function cacheModel(data: Uint8Array): Promise<void> {
  try {
    if (!('caches' in window)) return;
    const cache = await caches.open(MODEL_CACHE_KEY);
    const response = new Response(data, {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
    await cache.put(MODEL_URL, response);
  } catch (err) {
    logger.warn('RIFE', 'Failed to cache model', err);
  }
}

// ─── Frame Processing ────────────────────────────────────────────────────────

/**
 * Pad dimensions to be multiples of ALIGN (32)
 */
function alignDimension(dim: number): number {
  return Math.ceil(dim / ALIGN) * ALIGN;
}

/**
 * Convert ImageData (RGBA HWC uint8) to RIFE tensor format (NCHW float32, 0-1)
 */
function imageDataToTensor(
  imageData: ImageData,
  targetW: number,
  targetH: number,
): ort.Tensor {
  const { width, height, data } = imageData;
  const floats = new Float32Array(1 * 3 * targetH * targetW);

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      // Clamp to source dimensions (padding area gets black)
      const srcX = Math.min(x, width - 1);
      const srcY = Math.min(y, height - 1);
      const srcIdx = (srcY * width + srcX) * 4;

      const r = data[srcIdx] / 255.0;
      const g = data[srcIdx + 1] / 255.0;
      const b = data[srcIdx + 2] / 255.0;

      // NCHW layout
      floats[0 * targetH * targetW + y * targetW + x] = r;
      floats[1 * targetH * targetW + y * targetW + x] = g;
      floats[2 * targetH * targetW + y * targetW + x] = b;
    }
  }

  return new ort.Tensor('float32', floats, [1, 3, targetH, targetW]);
}

/**
 * Convert RIFE output tensor (NCHW float32, 0-1) back to ImageData
 */
function tensorToImageData(
  tensor: ort.Tensor,
  origW: number,
  origH: number,
): ImageData {
  const data = tensor.data as Float32Array;
  const tensorH = tensor.dims[2];
  const tensorW = tensor.dims[3];

  const imageData = new ImageData(origW, origH);
  const pixels = imageData.data;

  for (let y = 0; y < origH; y++) {
    for (let x = 0; x < origW; x++) {
      const r = data[0 * tensorH * tensorW + y * tensorW + x];
      const g = data[1 * tensorH * tensorW + y * tensorW + x];
      const b = data[2 * tensorH * tensorW + y * tensorW + x];

      const idx = (y * origW + x) * 4;
      pixels[idx] = Math.round(Math.max(0, Math.min(1, r)) * 255);
      pixels[idx + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
      pixels[idx + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
      pixels[idx + 3] = 255;
    }
  }

  return imageData;
}

/**
 * Run RIFE inference on two frames to produce an interpolated midpoint
 */
async function interpolateFramePair(
  frame0: ImageData,
  frame1: ImageData,
): Promise<ImageData> {
  if (!session) throw new Error('RIFE model not loaded');

  const origW = frame0.width;
  const origH = frame0.height;
  const alignedW = alignDimension(origW);
  const alignedH = alignDimension(origH);

  const tensor0 = imageDataToTensor(frame0, alignedW, alignedH);
  const tensor1 = imageDataToTensor(frame1, alignedW, alignedH);

  const feeds: Record<string, ort.Tensor> = {
    img0: tensor0,
    img1: tensor1,
    timestep: new ort.Tensor('float32', new Float32Array([0.5]), [1]),
  };

  const results = await session.run(feeds);

  const outputTensor = results.output || Object.values(results)[0];
  if (!outputTensor) {
    throw new Error('No output tensor from RIFE model');
  }

  return tensorToImageData(outputTensor, origW, origH);
}

// ─── Video Processing ────────────────────────────────────────────────────────

/**
 * Extract frames from a video URL using canvas
 */
async function extractFrames(
  videoUrl: string,
  onProgress?: (status: string) => void,
): Promise<{ frames: ImageData[]; fps: number; width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const timeout = setTimeout(() => {
      reject(new Error('Video load timeout (30s)'));
    }, 30000);

    video.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('Failed to load video'));
    };

    video.onloadedmetadata = async () => {
      clearTimeout(timeout);
      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;

      // Most AI-generated videos are 24fps
      const fps = 24;
      const totalFrames = Math.floor(duration * fps);
      const frames: ImageData[] = [];

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

      onProgress?.(`Extracting ${totalFrames} frames...`);

      for (let i = 0; i < totalFrames; i++) {
        const time = i / fps;
        video.currentTime = time;

        await new Promise<void>((res, rej) => {
          const seekTimeout = setTimeout(() => rej(new Error(`Seek timeout at frame ${i}`)), 5000);
          video.onseeked = () => {
            clearTimeout(seekTimeout);
            ctx.drawImage(video, 0, 0, width, height);
            frames.push(ctx.getImageData(0, 0, width, height));
            if (i % 10 === 0) {
              onProgress?.(`Extracting frames: ${i + 1}/${totalFrames}`);
            }
            res();
          };
        });
      }

      resolve({ frames, fps, width, height, duration });
    };

    video.src = videoUrl;
    video.load();
  });
}

/**
 * Encode frames to video using MediaRecorder + canvas with precise timing.
 * Uses requestAnimationFrame with real-time playback to ensure correct FPS.
 */
async function encodeToVideo(
  frames: ImageData[],
  fps: number,
  width: number,
  height: number,
  onProgress?: (status: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Try VP9, fallback to VP8
    let mimeType = 'video/webm;codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp8';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }

    // Use captureStream with target FPS for proper timing metadata
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 10_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      resolve(url);
    };

    recorder.onerror = () => reject(new Error('MediaRecorder error'));

    recorder.start();
    onProgress?.('Encoding video...');

    let frameIdx = 0;
    const frameDuration = 1000 / fps;
    const startTime = performance.now();

    const drawNext = () => {
      if (frameIdx >= frames.length) {
        // Small delay to let last frame register
        setTimeout(() => {
          recorder.stop();
          stream.getTracks().forEach((t) => t.stop());
        }, frameDuration * 2);
        return;
      }

      const expectedTime = startTime + frameIdx * frameDuration;
      const now = performance.now();

      if (now >= expectedTime) {
        ctx.putImageData(frames[frameIdx], 0, 0);
        frameIdx++;

        if (frameIdx % 20 === 0) {
          onProgress?.(`Encoding: ${frameIdx}/${frames.length} frames`);
        }
      }

      requestAnimationFrame(drawNext);
    };

    requestAnimationFrame(drawNext);
  });
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * Interpolate a video using RIFE AI model (client-side)
 *
 * @param videoUrl - URL of the source video (blob or http)
 * @param multiplier - 2 = double FPS (one midpoint per pair), 4 = quadruple
 * @param onProgress - Progress callback for UI updates
 * @returns Blob URL of the interpolated video
 */
export async function interpolateVideo(
  videoUrl: string,
  multiplier: 2 | 4 = 2,
  onProgress?: (status: string) => void,
): Promise<string> {
  const startTime = performance.now();
  logger.info('RIFE', 'Starting video interpolation', { multiplier });

  // 1. Load model (cached after first download)
  await loadModel(onProgress);

  // 2. Extract frames
  onProgress?.('Loading video...');
  const { frames, fps, width, height, duration } = await extractFrames(videoUrl, onProgress);
  logger.info('RIFE', `Extracted ${frames.length} frames`, { fps, width, height, duration });

  if (frames.length < 2) {
    throw new Error('Video too short — need at least 2 frames');
  }

  if (frames.length > 300) {
    throw new Error('Video too long for client-side interpolation (max ~12s at 24fps)');
  }

  // 3. Run RIFE interpolation
  const totalPairs = frames.length - 1;
  const result: ImageData[] = [];

  // For 2x: insert 1 midpoint between each pair
  // For 4x: recursively interpolate (2x twice)
  const passes = multiplier === 4 ? 2 : 1;
  let currentFrames = frames;

  for (let pass = 0; pass < passes; pass++) {
    const passFrames: ImageData[] = [];
    const pairs = currentFrames.length - 1;

    for (let i = 0; i < pairs; i++) {
      passFrames.push(currentFrames[i]);

      onProgress?.(`Pass ${pass + 1}/${passes}: Interpolating frame ${i + 1}/${pairs} (${executionProvider})`);

      try {
        const midFrame = await interpolateFramePair(currentFrames[i], currentFrames[i + 1]);
        passFrames.push(midFrame);
      } catch (err) {
        logger.warn('RIFE', `Frame pair ${i} failed, using blend fallback`, err);
        // Fallback: simple alpha blend
        passFrames.push(blendFrames(currentFrames[i], currentFrames[i + 1], 0.5));
      }
    }

    // Add last frame
    passFrames.push(currentFrames[currentFrames.length - 1]);
    currentFrames = passFrames;
  }

  const newFps = fps * multiplier;
  logger.info('RIFE', `Interpolation done: ${currentFrames.length} frames at ${newFps}fps`);

  // 4. Encode to video
  onProgress?.('Encoding interpolated video...');
  const blobUrl = await encodeToVideo(currentFrames, newFps, width, height, onProgress);

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  logger.info('RIFE', `Complete in ${elapsed}s`, { outputFrames: currentFrames.length, newFps });
  onProgress?.(`Done! (${elapsed}s, ${executionProvider})`);

  return blobUrl;
}

/**
 * Simple alpha blend fallback for when RIFE fails on a frame pair
 */
function blendFrames(f1: ImageData, f2: ImageData, alpha: number): ImageData {
  const result = new ImageData(f1.width, f1.height);
  const d1 = f1.data;
  const d2 = f2.data;
  const out = result.data;
  for (let i = 0; i < d1.length; i += 4) {
    out[i] = d1[i] * (1 - alpha) + d2[i] * alpha;
    out[i + 1] = d1[i + 1] * (1 - alpha) + d2[i + 1] * alpha;
    out[i + 2] = d1[i + 2] * (1 - alpha) + d2[i + 2] * alpha;
    out[i + 3] = 255;
  }
  return result;
}

/**
 * Check if the RIFE model is loaded
 */
export function isModelLoaded(): boolean {
  return session !== null;
}

/**
 * Get the current execution provider
 */
export function getExecutionProvider(): string {
  return executionProvider;
}

/**
 * Preload the model (call on app init or when user hovers the button)
 */
export async function preloadModel(
  onProgress?: (status: string) => void,
): Promise<void> {
  await loadModel(onProgress);
}
