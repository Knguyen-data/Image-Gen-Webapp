/**
 * LoRA Model Service
 * Handles LoRA training via RunPod, model CRUD, and Supabase storage.
 * Real implementation replacing the previous stub.
 */

import { supabase } from './supabase';
import { logger } from './logger';
import { enqueueTrainingJob, queueManager, JobProgress } from './job-queue';
import type { LoraModel, LoraStatus, LoraTrainingConfig } from '../types';

// Event emitter for frontend to subscribe to job updates
export const trainingEvents = {
  listeners: new Map<string, (progress: JobProgress) => void>(),
  
  on(loraId: string, callback: (progress: JobProgress) => void) {
    this.listeners.set(loraId, callback);
  },
  
  off(loraId: string) {
    this.listeners.delete(loraId);
  },
  
  emit(progress: JobProgress) {
    const callback = this.listeners.get(progress.jobId);
    if (callback) callback(progress);
  },
};

// Listen to queue events and re-emit
queueManager.on('job:progress', (progress: JobProgress) => {
  trainingEvents.emit(progress);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const RUNPOD_BASE = import.meta.env.VITE_RUNPOD_LORA_BASE_URL || '/api/runpod';
const LORA_TRAINING_ENDPOINT_ID = import.meta.env.VITE_RUNPOD_LORA_TRAINING_ENDPOINT_ID || '';
const MAX_POLL_ATTEMPTS = 120; // 10 min at 5s intervals
const POLL_INTERVAL_MS = 5000;

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface LoraModelService {
  listLoras(): Promise<LoraModel[]>;
  startTraining(config: LoraTrainingConfig, apiKey: string): Promise<string>;
  getTrainingStatus(jobId: string): Promise<{ status: LoraStatus; progress: number; error?: string }>;
  deleteLora(loraId: string): Promise<void>;
  getLoraFilename(loraId: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Supabase row → LoraModel mapper
// ---------------------------------------------------------------------------

interface LoraRow {
  id: string;
  name: string;
  trigger_word: string;
  status: string;
  created_at: string;
  file_size_bytes: number | null;
  error_message: string | null;
  training_progress: number | null;
  training_job_id: string | null;
  storage_url: string | null;
}

const rowToModel = (row: LoraRow): LoraModel => ({
  id: row.id,
  name: row.name,
  triggerWord: row.trigger_word,
  status: row.status as LoraStatus,
  createdAt: new Date(row.created_at).getTime(),
  fileSize: row.file_size_bytes ?? undefined,
  errorMessage: row.error_message ?? undefined,
  trainingProgress: row.training_progress ?? undefined,
});

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

class LoraModelServiceImpl implements LoraModelService {
  // ---- helpers ----

  private async requireUserId(): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    return user.id;
  }

  // ---- CRUD ----

  async listLoras(): Promise<LoraModel[]> {
    const userId = await this.requireUserId();

    const { data, error } = await supabase
      .from('lora_models' as AnyRecord)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('LoraService', 'Failed to list LoRAs', error);
      throw new Error('Failed to load LoRA models');
    }

    return ((data as unknown) as LoraRow[]).map(rowToModel);
  }

  async deleteLora(loraId: string): Promise<void> {
    const userId = await this.requireUserId();

    try {
      // Delete training images from storage
      const { data: images, error: selectError } = await supabase
        .from('lora_training_images' as AnyRecord)
        .select('storage_path')
        .eq('lora_id', loraId);

      if (selectError) {
        logger.warn('LoraService', 'Failed to fetch training images for deletion', selectError);
      }

      if (images?.length) {
        const paths = ((images as unknown) as Array<{ storage_path: string }>).map((i) => i.storage_path);
        const { error: storageError } = await supabase.storage
          .from('lora-training-images')
          .remove(paths);
        
        if (storageError) {
          logger.warn('LoraService', 'Failed to delete some training images', storageError);
        }
      }

      // Delete trained model from storage (ignore if not found)
      const modelPath = `${userId}/${loraId}/model.safetensors`;
      await supabase.storage.from('lora-models').remove([modelPath]);
    } catch (storageErr) {
      logger.warn('LoraService', 'Storage cleanup warning', storageErr);
    }

    // Delete DB record (cascade should handle training_images table)
    const { error } = await supabase
      .from('lora_models' as AnyRecord)
      .delete()
      .eq('id', loraId)
      .eq('user_id', userId);

    if (error) {
      logger.error('LoraService', 'Failed to delete LoRA', error);
      throw new Error('Failed to delete LoRA model');
    }

    logger.info('LoraService', 'LoRA deleted', { loraId });
  }

  async getLoraFilename(loraId: string): Promise<string> {
    const { data, error } = await supabase
      .from('lora_models' as AnyRecord)
      .select('name')
      .eq('id', loraId)
      .single();

    if (error || !data) {
      return `lora_${loraId}.safetensors`;
    }

    const safeName = ((data as unknown) as { name: string }).name
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');

    return `lora_${safeName}_${loraId.slice(0, 8)}.safetensors`;
  }

  // ---- Training ----

  async startTraining(config: LoraTrainingConfig, apiKey: string): Promise<string> {
    const userId = await this.requireUserId();

    // Create LoRA record in DB
    const { data: loraRecord, error: createError } = await supabase
      .from('lora_models' as AnyRecord)
      .insert({
        user_id: userId,
        name: config.name,
        trigger_word: config.triggerWord,
        status: 'uploading',
        training_config: {
          steps: config.steps,
          learningRate: config.learningRate,
          photoCount: config.photos.length,
        },
        training_images_count: config.photos.length,
      })
      .select('id')
      .single();

    if (createError || !loraRecord) {
      logger.error('LoraService', 'Failed to create LoRA record', createError);
      throw new Error('Failed to create LoRA model');
    }

    const loraId = ((loraRecord as unknown) as { id: string }).id;

    try {
      // Upload training images to R2 (new approach)
      const imageUrls = await this.uploadTrainingImagesToR2(loraId, userId, config.photos);

      // Submit RunPod training job
      const workflowInput = {
        mode: 'train_lora',
        trigger_word: config.triggerWord,
        training_images: imageUrls,
        steps: config.steps,
        learning_rate: config.learningRate,
        network_dim: config.networkDim,
        network_alpha: config.networkAlpha,
        resolution: config.resolution,
        output_name: `lora_${userId}_${loraId.slice(0, 8)}`,
      };

      // Build URL based on environment (RunPod vs local)
      const isLocal = RUNPOD_BASE.startsWith('http://localhost') || RUNPOD_BASE.startsWith('http://127.0.0.1');
      const url = isLocal
        ? `${RUNPOD_BASE}/run`
        : `${RUNPOD_BASE}/v2/${LORA_TRAINING_ENDPOINT_ID}/run`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (!isLocal) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ input: workflowInput }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error('Invalid RunPod API key');
        throw new Error(`RunPod training submission failed: ${response.status}`);
      }

      const result = await response.json();
      const jobId = result.id;

      // Update database with job ID and status
      const { error: updateError } = await supabase
        .from('lora_models' as AnyRecord)
        .update({
          status: 'training',
          training_job_id: jobId,
        } as AnyRecord)
        .eq('id', loraId);

      if (updateError) {
        logger.error('LoraService', 'Failed to update LoRA status', updateError);
      }

      // Enqueue training job (replaces polling with event-driven updates)
      await queueManager.initialize();
      await queueManager.enqueueTraining({
        loraId,
        userId,
        prompt: config.triggerWord,
        imageUrls,
        settings: {
          maxTrainEpochs: config.steps,
          learningRate: config.learningRate,
          batchSize: config.networkDim,
        },
      });

      // Subscribe to progress updates
      trainingEvents.on(loraId, (progress) => {
        // Update Supabase in real-time
        supabase
          .from('lora_models' as AnyRecord)
          .update({
            status: progress.status === 'completed' ? 'ready' : 
                    progress.status === 'failed' ? 'failed' : 'training',
            progress: progress.progress,
            error_message: progress.error,
          } as AnyRecord)
          .eq('id', loraId)
          .catch((err) => logger.error('Failed to update progress', err));
      });

      logger.info('LoraService', 'Training job enqueued', { loraId, jobId });
      return loraId;
    } catch (err) {
      // Mark failed on any error during setup
      await supabase
        .from('lora_models' as AnyRecord)
        .update({
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
        } as AnyRecord)
        .eq('id', loraId);
      throw err;
    }
  }

  // ---- Training image upload ----

  private async uploadTrainingImages(
    loraId: string,
    userId: string,
    photos: File[],
  ): Promise<void> {
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image
    const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

    // Validate all files first
    for (const file of photos) {
      if (!VALID_TYPES.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.name}. Only JPG, PNG, WebP allowed.`);
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB per image.`);
      }
    }

    // Prepare upload data (all in parallel)
    const uploadData = photos.map((file, i) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${userId}/${loraId}/${Date.now()}_${i}.${ext}`;
      return { file, storagePath, fileName: file.name, fileSize: file.size };
    });

    // Batch upload all files in parallel
    const uploadResults = await Promise.allSettled(
      uploadData.map(async ({ file, storagePath }) => {
        const { error } = await supabase.storage
          .from('lora-training-images')
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });
        if (error) throw new Error(`Failed to upload ${file.name}: ${error.message}`);
        return storagePath;
      })
    );

    // Check for failures
    const failures = uploadResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failures.length > 0) {
      // Clean up successfully uploaded files
      const successfulPaths = uploadResults
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value);
      if (successfulPaths.length > 0) {
        await supabase.storage.from('lora-training-images').remove(successfulPaths).catch(() => {});
      }
      throw new Error(`Failed to upload ${failures.length} image(s)`);
    }

    // Batch insert DB records in parallel
    const dbRecords = uploadData.map(({ storagePath, fileName, fileSize }) => ({
      lora_id: loraId,
      storage_path: storagePath,
      original_filename: fileName,
      file_size: fileSize,
    }));

    const { error: insertError } = await (supabase as any)
      .from('lora_training_images')
      .insert(dbRecords);

    if (insertError) {
      // Clean up uploaded files on DB error
      await supabase.storage.from('lora-training-images').remove(uploadData.map(d => d.storagePath)).catch(() => {});
      throw new Error(`Failed to save image metadata: ${insertError.message}`);
    }

    logger.info('LoraService', `Batch uploaded ${photos.length} training images`, { loraId });
  }

  // ---- R2 Image Upload (NEW) ----

  private async uploadTrainingImagesToR2(
    loraId: string,
    userId: string,
    photos: File[],
  ): Promise<string[]> {
    const RUNPOD_BASE = import.meta.env.VITE_RUNPOD_LORA_BASE_URL || '/api/runpod';
    const isLocal = RUNPOD_BASE.startsWith('http://localhost') || RUNPOD_BASE.startsWith('http://127.0.0.1');
    const uploadUrlEndpoint = isLocal
      ? `${RUNPOD_BASE}/upload-url`
      : `${RUNPOD_BASE}/v2/${LORA_TRAINING_ENDPOINT_ID}/upload-url`;

    const headers: Record<string, string> = {};
    if (!isLocal) {
      headers['Authorization'] = `Bearer ${import.meta.env.VITE_RUNPOD_API_KEY || ''}`;
    }

    const uploadedUrls: string[] = [];

    logger.info('LoraService', `Uploading ${photos.length} training images to R2...`);

    for (let i = 0; i < photos.length; i++) {
      const file = photos[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filename = `training/${userId}/${loraId}/${Date.now()}_${i}.${ext}`;

      try {
        // Get pre-signed upload URL from handler
        const urlResponse = await fetch(`${uploadUrlEndpoint}?filename=${encodeURIComponent(filename)}&content_type=${file.type}`, {
          method: 'GET',
          headers,
        });

        if (!urlResponse.ok) {
          throw new Error(`Failed to get upload URL: ${urlResponse.status}`);
        }

        const { upload_url: presignedUrl } = await urlResponse.json();

        // Upload to R2 using pre-signed URL
        const uploadResponse = await fetch(presignedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error(`R2 upload failed: ${uploadResponse.status}`);
        }

        // Construct public R2 URL
        const r2Endpoint = import.meta.env.VITE_R2_ENDPOINT || 'https://r2-media-upload.tnguyen633.workers.dev';
        const r2Bucket = import.meta.env.VITE_R2_BUCKET || 'lora-training-images';
        const publicUrl = `${r2Endpoint}/${r2Bucket}/${filename}`;
        
        uploadedUrls.push(publicUrl);
        logger.info('LoraService', `Uploaded ${i + 1}/${photos.length}: ${file.name}`);
      } catch (error) {
        logger.error('LoraService', `Failed to upload ${file.name}`, error);
        throw new Error(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    logger.info('LoraService', `Successfully uploaded ${uploadedUrls.length} images to R2`);
    return uploadedUrls;
  }

  // ---- Training polling ----

  async pollTrainingStatus(
    loraId: string,
    jobId: string,
    apiKey: string,
  ): Promise<void> {
    logger.info('LoraService', 'Starting training poll', { loraId, jobId });

    const isLocal = RUNPOD_BASE.startsWith('http://localhost') || RUNPOD_BASE.startsWith('http://127.0.0.1');
    const statusUrl = isLocal
      ? `${RUNPOD_BASE}/status/${jobId}`
      : `${RUNPOD_BASE}/v2/${LORA_TRAINING_ENDPOINT_ID}/status/${jobId}`;

    const headers: Record<string, string> = {};
    if (!isLocal) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await fetch(statusUrl, { headers });

      if (!response.ok) {
        logger.warn('LoraService', 'Status check failed', {
          attempt,
          status: response.status,
        });
        continue;
      }

      const job = await response.json();
      const status = job.status;
      const progress = job.output?.progress || 0;

      // Update progress in database
      await supabase
        .from('lora_models' as AnyRecord)
        .update({ training_progress: Math.round(progress) } as AnyRecord)
        .eq('id', loraId);

      if (status === 'COMPLETED' && job.output?.success) {
        const modelUrl = job.output.model_url;
        if (!modelUrl) throw new Error('No model URL in output');

        await this.downloadAndStoreModel(loraId, modelUrl);
        logger.info('LoraService', 'Training completed', { loraId });
        return;
      }

      if (status === 'FAILED' || status === 'CANCELLED') {
        const errorMsg =
          job.error || job.output?.error || 'Training failed';
        await supabase
          .from('lora_models' as AnyRecord)
          .update({ status: 'failed', error_message: errorMsg } as AnyRecord)
          .eq('id', loraId);
        throw new Error(errorMsg);
      }
    }

    // Timeout
    await supabase
      .from('lora_models' as AnyRecord)
      .update({ status: 'failed', error_message: 'Training timed out' } as AnyRecord)
      .eq('id', loraId);
    throw new Error('Training timed out after polling');
  }

  // ---- Download & store trained model ----

  private async downloadAndStoreModel(
    loraId: string,
    modelUrl: string,
  ): Promise<void> {
    const userId = await this.requireUserId();
    const storagePath = `${userId}/${loraId}/model.safetensors`;

    logger.info('LoraService', 'Downloading trained model', { loraId, modelUrl });

    // Download from RunPod output URL
    const response = await fetch(modelUrl, {
      signal: AbortSignal.timeout(120000), // 2 min for large .safetensors
    });

    if (!response.ok) {
      throw new Error(`Failed to download trained model: ${response.status}`);
    }

    const blob = await response.blob();

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('lora-models')
      .upload(storagePath, blob, {
        contentType: 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) {
      logger.error('LoraService', 'Failed to store trained model', uploadError);
      throw new Error('Failed to store trained model');
    }

    // Get public URL for the stored model
    const { data: urlData } = supabase.storage
      .from('lora-models')
      .getPublicUrl(storagePath);

    // Update DB: status → ready, storage URL, file size
    const { error: updateError } = await supabase
      .from('lora_models' as AnyRecord)
      .update({
        status: 'ready',
        storage_url: urlData.publicUrl,
        file_size_bytes: blob.size,
        training_progress: 100,
      } as AnyRecord)
      .eq('id', loraId);

    if (updateError) {
      logger.error('LoraService', 'Failed to update model status', updateError);
    }

    logger.info('LoraService', 'Model stored', {
      loraId,
      size: blob.size,
      path: storagePath,
    });
  }

  // ---- Status check (for UI polling) ----

  async getTrainingStatus(
    loraId: string,
  ): Promise<{ status: LoraStatus; progress: number; error?: string }> {
    const { data, error } = await supabase
      .from('lora_models' as AnyRecord)
      .select('status, training_progress, error_message')
      .eq('id', loraId)
      .single();

    if (error || !data) {
      return { status: 'failed', progress: 0, error: 'Model not found' };
    }

    const row = (data as unknown) as {
      status: string;
      training_progress: number | null;
      error_message: string | null;
    };

    return {
      status: row.status as LoraStatus,
      progress: row.training_progress ?? 0,
      error: row.error_message ?? undefined,
    };
  }

  // ---- Signed download URL ----

  async getLoraDownloadUrl(
    loraId: string,
    expiresIn = 3600,
  ): Promise<string> {
    const userId = await this.requireUserId();
    const storagePath = `${userId}/${loraId}/model.safetensors`;

    const { data, error } = await supabase.storage
      .from('lora-models')
      .createSignedUrl(storagePath, expiresIn);

    if (error || !data?.signedUrl) {
      throw new Error('Failed to generate download URL');
    }

    return data.signedUrl;
  }
}

// ---------------------------------------------------------------------------
// Export singleton
// ---------------------------------------------------------------------------

export const loraService = new LoraModelServiceImpl();

// ---------------------------------------------------------------------------
// Backward-compatible function exports (for existing components)
// ---------------------------------------------------------------------------

export async function listUserLoras(userId: string): Promise<LoraModel[]> {
  return loraService.listLoras();
}

export async function createLora(
  userId: string,
  name: string,
  triggerWord: string,
  trainingConfig?: LoraTrainingConfig,
): Promise<LoraModel> {
  // Convert old-style params to new-style
  // Note: This is a partial implementation - the full createLora logic
  // needs to be adapted from the original standalone function
  throw new Error('createLora: Use loraService.startTraining instead with full config');
}

export async function uploadTrainingImages(
  loraId: string,
  userId: string,
  files: File[],
): Promise<{ id: string; storagePath: string }[]> {
  throw new Error('uploadTrainingImages: Use loraService.startTraining instead');
}

export async function startTraining(loraId: string, apiKey: string): Promise<string> {
  throw new Error('startTraining: Use loraService.startTraining instead with full LoraTrainingConfig');
}

export async function deleteLoraById(loraId: string, userId: string): Promise<void> {
  await loraService.deleteLora(loraId);
}

export async function deleteLora(loraId: string): Promise<void> {
  await loraService.deleteLora(loraId);
}

export async function getTrainingImageUrl(storagePath: string): Promise<string> {
  // Simple implementation for image URL
  const { data } = supabase.storage
    .from('lora-training-images')
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

export const DEFAULT_LORA_TRAINING_CONFIG: Partial<LoraTrainingConfig> = {
  steps: 1000,
  learningRate: 1e-4,
  networkDim: 32,
  networkAlpha: 32,
  resolution: 1024,
};

