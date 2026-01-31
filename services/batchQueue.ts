import { GeneratedImage, AppSettings, ReferenceImage } from '../types';

/**
 * Task for batch queue processing
 */
export interface QueueTask {
  id: string;
  prompt: string;
  refs: ReferenceImage[];
  settings: AppSettings;
}

/**
 * Configuration for batch queue processing
 */
export interface BatchQueueConfig {
  batchSize: number;
  batchDelayMs: number;
  onProgress: (completed: number, total: number, batchNum: number, totalBatches: number) => void;
  onResult: (result: GeneratedImage) => void;
  onError: (error: Error, task: QueueTask) => void;
  signal?: AbortSignal;
}

/**
 * Utility to split array into chunks
 */
const chunkArray = <T>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

/**
 * Delay utility
 */
const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate optimal batch size based on queue length
 */
export const calculateOptimalBatchSize = (queueLength: number): number => {
  if (queueLength <= 5) return queueLength;  // All at once
  if (queueLength <= 20) return 5;            // 5 per batch
  return 10;                                  // Max concurrent for large batches
};

/**
 * Process a queue of tasks in concurrent batches with rate limiting
 *
 * @param tasks - Array of tasks to process
 * @param generateFn - Async function to generate image for each task
 * @param config - Configuration for batch processing
 * @returns Array of successfully generated images
 */
export const processBatchQueue = async (
  tasks: QueueTask[],
  generateFn: (task: QueueTask) => Promise<GeneratedImage>,
  config: BatchQueueConfig
): Promise<GeneratedImage[]> => {
  const results: GeneratedImage[] = [];
  const batches = chunkArray(tasks, config.batchSize);
  const totalBatches = batches.length;

  for (let i = 0; i < batches.length; i++) {
    // Check for abort signal
    if (config.signal?.aborted) {
      throw new Error('Aborted');
    }

    const batch = batches[i];
    const batchNum = i + 1;

    // Process all tasks in this batch concurrently
    const batchResults = await Promise.allSettled(
      batch.map(task => generateFn(task))
    );

    // Process results and handle successes/failures
    batchResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
        config.onResult(result.value);
      } else {
        const error = result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason));
        config.onError(error, batch[idx]);
      }
    });

    // Update progress
    config.onProgress(results.length, tasks.length, batchNum, totalBatches);

    // Wait between batches (except for last batch)
    if (i < batches.length - 1 && !config.signal?.aborted) {
      await delay(config.batchDelayMs);
    }
  }

  return results;
};
