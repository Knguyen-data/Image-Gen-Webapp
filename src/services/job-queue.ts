/**
 * BullMQ Job Queue Service
 * Replaces polling with event-driven job processing
 */

import { Queue, Worker, Job } from 'bullmq';
import { EventEmitter } from 'events';

// Queue names
export const QUEUES = {
  TRAINING: 'training',
  UPSCALING: 'upscaling',
  GENERATION: 'generation',
} as const;

export type QueueType = typeof QUEUES[keyof typeof QUEUES];

// Job data types
export interface TrainingJobData {
  loraId: string;
  userId: string;
  prompt: string;
  imageUrls: string[];
  settings: {
    maxTrainEpochs?: number;
    learningRate?: number;
    batchSize?: number;
  };
}

export interface UpscalingJobData {
  jobId: string;
  userId: string;
  imageUrl: string;
  scale: number;
  model: string;
}

export interface GenerationJobData {
  jobId: string;
  userId: string;
  prompt: string;
  settings: {
    width?: number;
    height?: number;
    steps?: number;
    cfgScale?: number;
    sampler?: string;
    seed?: number;
  };
}

// Progress tracking
export interface JobProgress {
  jobId: string;
  queue: QueueType;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  progress: number; // 0-100
  message?: string;
  result?: any;
  error?: string;
}

// Singleton queue manager
class QueueManager extends EventEmitter {
  private queues: Map<QueueType, Queue> = new Map();
  private workers: Map<QueueType, Worker> = new Map();
  private connection: any = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Redis connection config
    this.connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    // Create queues
    this.queues.set(QUEUES.TRAINING, new Queue(QUEUES.TRAINING, { connection: this.connection }));
    this.queues.set(QUEUES.UPSCALING, new Queue(QUEUES.UPSCALING, { connection: this.connection }));
    this.queues.set(QUEUES.GENERATION, new Queue(QUEUES.GENERATION, { connection: this.connection }));

    // Set up workers
    await this.setupWorkers();

    this.initialized = true;
    console.log('[QueueManager] Initialized');
  }

  private async setupWorkers(): Promise<void> {
    // Training worker
    const trainingWorker = new Worker(
      QUEUES.TRAINING,
      async (job: Job<TrainingJobData>) => {
        await this.processTrainingJob(job);
      },
      { connection: this.connection, concurrency: 1 }
    );

    trainingWorker.on('active', (job) => {
      this.emitProgress(job.id!, QUEUES.TRAINING, 'active', 0, 'Training started');
    });

    trainingWorker.on('progress', (job, progress) => {
      this.emitProgress(job.id!, QUEUES.TRAINING, 'active', progress, `Epoch ${progress}`);
    });

    trainingWorker.on('completed', (job, result) => {
      this.emitProgress(job.id!, QUEUES.TRAINING, 'completed', 100, 'Training complete', result);
    });

    trainingWorker.on('failed', (job, err) => {
      this.emitProgress(job.id!, QUEUES.TRAINING, 'failed', 0, undefined, undefined, err.message);
    });

    this.workers.set(QUEUES.TRAINING, trainingWorker);

    // Upscaling worker
    const upscalingWorker = new Worker(
      QUEUES.UPSCALING,
      async (job: Job<UpscalingJobData>) => {
        await this.processUpscalingJob(job);
      },
      { connection: this.connection, concurrency: 3 }
    );

    upscalingWorker.on('completed', (job, result) => {
      this.emitProgress(job.id!, QUEUES.UPSCALING, 'completed', 100, 'Upscaling complete', result);
    });

    upscalingWorker.on('failed', (job, err) => {
      this.emitProgress(job.id!, QUEUES.UPSCALING, 'failed', 0, undefined, undefined, err.message);
    });

    this.workers.set(QUEUES.UPSCALING, upscalingWorker);

    // Generation worker
    const generationWorker = new Worker(
      QUEUES.GENERATION,
      async (job: Job<GenerationJobData>) => {
        await this.processGenerationJob(job);
      },
      { connection: this.connection, concurrency: 5 }
    );

    generationWorker.on('completed', (job, result) => {
      this.emitProgress(job.id!, QUEUES.GENERATION, 'completed', 100, 'Generation complete', result);
    });

    generationWorker.on('failed', (job, err) => {
      this.emitProgress(job.id!, QUEUES.GENERATION, 'failed', 0, undefined, undefined, err.message);
    });

    this.workers.set(QUEUES.GENERATION, generationWorker);
  }

  private async processTrainingJob(job: Job<TrainingJobData>): Promise<any> {
    const { loraId, userId, prompt, imageUrls, settings } = job.data;

    console.log(`[TrainingWorker] Starting training: ${loraId}`);

    // TODO: Call actual training API
    // For now, simulate progress
    for (let epoch = 0; epoch <= 10; epoch++) {
      await new Promise((r) => setTimeout(r, 2000)); // Simulate training time
      await job.updateProgress((epoch / 10) * 100);
    }

    return {
      success: true,
      modelUrl: `https://r2-media-upload.tnguyen633.workers.dev/lora-models/${loraId}/final.safetensors`,
      epochs: 10,
    };
  }

  private async processUpscalingJob(job: Job<UpscalingJobData>): Promise<any> {
    const { jobId, imageUrl, scale, model } = job.data;

    console.log(`[UpscalingWorker] Upscaling ${jobId} at ${scale}x`);

    // TODO: Call actual upscaling API
    await new Promise((r) => setTimeout(r, 5000));

    return {
      success: true,
      resultUrl: `https://r2-media-upload.tnguyen633.workers.dev/upscaled/${jobId}_upscaled.png`,
      scale,
      model,
    };
  }

  private async processGenerationJob(job: Job<GenerationJobData>): Promise<any> {
    const { jobId, prompt, settings } = job.data;

    console.log(`[GenerationWorker] Generating: ${jobId}`);

    // TODO: Call actual generation API
    await new Promise((r) => setTimeout(r, 3000));

    return {
      success: true,
      imageUrls: [
        `https://r2-media-upload.tnguyen633.workers.dev/generated/${jobId}/0.png`,
        `https://r2-media-upload.tnguyen633.workers.dev/generated/${jobId}/1.png`,
      ],
    };
  }

  private emitProgress(
    jobId: string,
    queue: QueueType,
    status: JobProgress['status'],
    progress: number,
    message?: string,
    result?: any,
    error?: string
  ): void {
    const progressData: JobProgress = {
      jobId,
      queue,
      status,
      progress,
      message,
      result,
      error,
    };

    this.emit('job:progress', progressData);
  }

  // Public API for enqueueing jobs
  async enqueueTraining(data: TrainingJobData, priority: 'low' | 'normal' | 'high' = 'normal'): Promise<Job<TrainingJobData>> {
    const queue = this.queues.get(QUEUES.TRAINING)!;
    const jobOpts = { priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2 };
    return queue.add('training', data, jobOpts);
  }

  async enqueueUpscaling(data: UpscalingJobData): Promise<Job<UpscalingJobData>> {
    const queue = this.queues.get(QUEUES.UPSCALING)!;
    return queue.add('upscaling', data);
  }

  async enqueueGeneration(data: GenerationJobData): Promise<Job<GenerationJobData>> {
    const queue = this.queues.get(QUEUES.GENERATION)!;
    return queue.add('generation', data);
  }

  async getJobStatus(jobId: string, queue: QueueType): Promise<JobProgress | null> {
    const q = this.queues.get(queue)!;
    const job = await q.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = (job as any).progress();

    return {
      jobId,
      queue,
      status: state as JobProgress['status'],
      progress: typeof progress === 'number' ? progress : 0,
    };
  }

  async close(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.close();
    }
    for (const queue of this.queues.values()) {
      await queue.close();
    }
    this.initialized = false;
  }
}

// Export singleton instance
export const queueManager = new QueueManager();

// Helper function to use in services
export async function enqueueTrainingJob(
  loraId: string,
  userId: string,
  prompt: string,
  imageUrls: string[],
  settings?: any
): Promise<Job<TrainingJobData>> {
  await queueManager.initialize();
  return queueManager.enqueueTraining({
    loraId,
    userId,
    prompt,
    imageUrls,
    settings: settings || {},
  });
}
