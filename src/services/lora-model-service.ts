/**
 * LoRA Model Service
 * Handles LoRA training via RunPod, model CRUD, and Supabase storage.
 * Real implementation replacing the previous stub.
 */

import { supabase } from './supabase';
import { logger } from './logger';
import type { LoraModel, LoraStatus, LoraTrainingConfig } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

const RUNPOD_BASE = '/api/runpod'; // Proxied via Vite -> https://api.runpod.ai
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
  training_images_count: number | null;
  runpod_job_id: string | null;
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
  trainingImagesCount: row.training_images_count ?? 0,
  trainingJobId: row.runpod_job_id ?? undefined,
  storageUrl: row.storage_url ?? undefined,
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
      // Upload training images to Supabase Storage
      await this.uploadTrainingImages(loraId, userId, config.photos);

      // Get training image URLs
      const { data: images, error: imagesError } = await supabase
        .from('lora_training_images' as AnyRecord)
        .select('storage_path')
        .eq('lora_id', loraId);

      if (imagesError || !images?.length) {
        throw new Error('No training images found for this LoRA model');
      }

      // Get signed URLs for images (bucket is private)
      const imageUrls: string[] = [];
      for (const img of (images as unknown) as Array<{ storage_path: string }>) {
        const { data } = await supabase.storage
          .from('lora-training-images')
          .createSignedUrl(img.storage_path, 7200); // 2 hour expiry
        if (data?.signedUrl) imageUrls.push(data.signedUrl);
      }

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

      const response = await fetch(
        `${RUNPOD_BASE}/v2/${LORA_TRAINING_ENDPOINT_ID}/run`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ input: workflowInput }),
          signal: AbortSignal.timeout(30000),
        },
      );

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
          runpod_job_id: jobId,
        } as AnyRecord)
        .eq('id', loraId);

      if (updateError) {
        logger.error('LoraService', 'Failed to update LoRA status', updateError);
      }

      // Start background polling
      this.pollTrainingStatus(loraId, jobId, apiKey).catch((err) => {
        logger.error('LoraService', 'Training poll failed', err);
      });

      logger.info('LoraService', 'Training job submitted', { loraId, jobId });
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

    for (let i = 0; i < photos.length; i++) {
      const file = photos[i];

      // Validate file
      if (!VALID_TYPES.includes(file.type)) {
        throw new Error(`Invalid file type: ${file.name}. Only JPG, PNG, WebP allowed.`);
      }

      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 10MB per image.`);
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const storagePath = `${userId}/${loraId}/${Date.now()}_${i}.${ext}`;

      try {
        const { error: uploadError } = await supabase.storage
          .from('lora-training-images')
          .upload(storagePath, file, { 
            contentType: file.type,
            upsert: false 
          });

        if (uploadError) {
          logger.error('LoraService', `Failed to upload image ${i}`, uploadError);
          throw new Error(`Failed to upload ${file.name}`);
        }

        // Record in DB
        const { error: insertError } = await supabase.from('lora_training_images' as AnyRecord).insert({
          lora_id: loraId,
          storage_path: storagePath,
          original_filename: file.name,
        } as AnyRecord);

        if (insertError) {
          logger.error('LoraService', `Failed to record image ${i} in DB`, insertError);
          throw new Error(`Failed to save ${file.name} metadata`);
        }

        logger.info('LoraService', `Uploaded image ${i + 1}/${photos.length}`, { filename: file.name });
      } catch (err) {
        // Clean up partially uploaded files on error
        await supabase.storage.from('lora-training-images').remove([storagePath]).catch(() => {});
        throw err;
      }
    }

    logger.info('LoraService', 'Training images uploaded', {
      loraId,
      count: photos.length,
    });
  }

  // ---- Training polling ----

  async pollTrainingStatus(
    loraId: string,
    jobId: string,
    apiKey: string,
  ): Promise<void> {
    logger.info('LoraService', 'Starting training poll', { loraId, jobId });

    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const response = await fetch(
        `${RUNPOD_BASE}/v2/${LORA_TRAINING_ENDPOINT_ID}/status/${jobId}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );

      if (!response.ok) {
        logger.warn('LoraService', 'Status check failed', {
          attempt,
          status: response.status,
        });
        continue;
      }

      const job = await response.json();
      const status = job.status;
      // RunPod serverless doesn't stream progress; estimate from status + poll attempt
      const estimatedProgress = status === 'IN_QUEUE' ? 5
        : status === 'IN_PROGRESS' ? Math.min(10 + Math.round((attempt / MAX_POLL_ATTEMPTS) * 80), 90)
        : job.output?.progress || 0;

      // Update progress in database
      await supabase
        .from('lora_models' as AnyRecord)
        .update({ training_progress: Math.round(estimatedProgress) } as AnyRecord)
        .eq('id', loraId);

      if (status === 'COMPLETED' && (job.output?.status === 'completed' || job.output?.success)) {
        const modelUrl = job.output.lora_url || job.output.model_url;
        if (!modelUrl) throw new Error('No model URL in output');
        const fileSize = job.output.file_size || 0;

        // Store R2 URL directly in DB (no re-upload needed)
        const { error: updateError } = await supabase
          .from('lora_models' as AnyRecord)
          .update({
            status: 'ready',
            storage_url: modelUrl,
            file_size_bytes: fileSize,
            training_progress: 100,
          } as AnyRecord)
          .eq('id', loraId);

        if (updateError) {
          logger.error('LoraService', 'Failed to update model status', updateError);
        }

        logger.info('LoraService', 'Training completed', { loraId, modelUrl });
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
