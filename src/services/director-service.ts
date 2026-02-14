/**
 * Director Pipeline Service — RunPod submit/poll pattern
 * 
 * Uses the SAME endpoint as Wan 2.2 worker (job_type: "director")
 * The GPU worker handles both I2V inference and Director orchestration.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface DirectorInput {
  job_type: 'director';
  character_images: string[]; // base64 (no data: prefix)
  mode: 't2v' | 'i2v' | 'clone';
  user_prompt: string;
  target_duration: number; // seconds
  style: string;
  nsfw: boolean;
  fps: number;
  resolution: { width: number; height: number };
  reference_video_url?: string;
  consistency_threshold?: number;
  max_parallel?: number;
  generate_audio?: boolean;
}

export interface DirectorPhaseInfo {
  phase: number;
  phase_name: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
  time_sec?: number;
}

export interface DirectorResult {
  success: boolean;
  video_base64?: string;
  audio_base64?: string;
  duration?: number;
  shots?: number;
  consistency_avg?: number;
  cost?: number;
  timings?: Record<string, number>;
  logs?: string[];
  phases?: DirectorPhaseInfo[];
  error?: string;
}

export type DirectorJobStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface DirectorPollResponse {
  id: string;
  status: DirectorJobStatus;
  output?: DirectorResult;
  error?: string;
}

// ── Config ──────────────────────────────────────────────────────────────────

const RUNPOD_API_BASE = 'https://api.runpod.ai/v2';

function getEndpointId(): string {
  // Use the same endpoint as Wan 2.2 worker
  const id = import.meta.env.VITE_WAN22_ENDPOINT_ID || localStorage.getItem('wan22_endpoint_id') || '';
  if (!id) throw new Error('Wan 2.2 endpoint ID not configured. Set VITE_WAN22_ENDPOINT_ID or configure in settings.');
  return id;
}

function getApiKey(): string {
  const key = import.meta.env.VITE_RUNPOD_API_KEY || localStorage.getItem('runpod_api_key') || '';
  if (!key) throw new Error('RunPod API key not configured.');
  return key;
}

// ── API Calls ───────────────────────────────────────────────────────────────

/**
 * Submit a Director Pipeline job to RunPod
 * Returns the job ID for polling
 */
export async function submitDirectorJob(input: Omit<DirectorInput, 'job_type'>): Promise<string> {
  const endpointId = getEndpointId();
  const apiKey = getApiKey();

  const payload: DirectorInput = {
    ...input,
    job_type: 'director',
  };

  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: payload }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RunPod submit failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return data.id;
}

/**
 * Poll a Director Pipeline job status
 */
export async function pollDirectorJob(jobId: string): Promise<DirectorPollResponse> {
  const endpointId = getEndpointId();
  const apiKey = getApiKey();

  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/status/${jobId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RunPod poll failed (${response.status}): ${text}`);
  }

  return response.json();
}

/**
 * Cancel a running Director Pipeline job
 */
export async function cancelDirectorJob(jobId: string): Promise<void> {
  const endpointId = getEndpointId();
  const apiKey = getApiKey();

  await fetch(`${RUNPOD_API_BASE}/${endpointId}/cancel/${jobId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });
}

// ── Polling Helper ──────────────────────────────────────────────────────────

/**
 * Poll until completion with callback for progress updates
 */
export async function waitForDirectorJob(
  jobId: string,
  onProgress?: (response: DirectorPollResponse) => void,
  pollIntervalMs = 3000,
  timeoutMs = 900000, // 15 min
  signal?: AbortSignal,
): Promise<DirectorResult> {
  const start = Date.now();

  while (true) {
    if (signal?.aborted) {
      await cancelDirectorJob(jobId);
      throw new Error('Cancelled');
    }

    if (Date.now() - start > timeoutMs) {
      await cancelDirectorJob(jobId);
      throw new Error('Director pipeline timed out');
    }

    const response = await pollDirectorJob(jobId);
    onProgress?.(response);

    if (response.status === 'COMPLETED') {
      if (!response.output?.success) {
        throw new Error(response.output?.error || 'Pipeline failed');
      }
      return response.output;
    }

    if (response.status === 'FAILED') {
      throw new Error(response.error || response.output?.error || 'Pipeline failed');
    }

    if (response.status === 'CANCELLED') {
      throw new Error('Pipeline was cancelled');
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}

// ── Cost Estimation ─────────────────────────────────────────────────────────

const COST_PER_SHOT = 0.03; // ~$0.03 per 5s clip on RunPod A100
const SECONDS_PER_SHOT = 5;
const TIME_PER_SHOT_SEC = 45; // ~45s generation per shot

export function estimateDirectorCost(durationSec: number): {
  shots: number;
  cost: number;
  timeMin: number;
  timeMinParallel: number;
} {
  const shots = Math.ceil(durationSec / SECONDS_PER_SHOT);
  const cost = shots * COST_PER_SHOT;
  const timeMin = (shots * TIME_PER_SHOT_SEC) / 60;
  // With 3 parallel workers
  const timeMinParallel = (Math.ceil(shots / 3) * TIME_PER_SHOT_SEC + 60) / 60; // +60s for other phases
  return { shots, cost, timeMin, timeMinParallel };
}
