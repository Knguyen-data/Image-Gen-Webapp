import {
  savePendingRequest,
  updatePendingRequest,
  getPendingRequestByRequestId,
  getAllPendingRequests,
  deletePendingRequest,
  type PendingRequest,
} from './db';
import { logger } from './logger';

class RequestManager {
  // 1. Create request before API call
  async createRequest(type: string, params: any): Promise<string> {
    const requestId = crypto.randomUUID();

    const request: PendingRequest = {
      requestId,
      type: type as 'kling' | 'veo' | 'freepik' | 'amt',
      taskId: '',
      prompt: params.prompt || '',
      params,
      status: 'queued',
      progress: 'Initializing...',
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: 3,
    };

    await savePendingRequest(request);

    logger.info('RequestManager', 'Request created', { requestId, type });
    return requestId;
  }

  // 2. Update with taskId after API call
  async updateTaskId(requestId: string, taskId: string): Promise<void> {
    const request = await getPendingRequestByRequestId(requestId);
    if (!request || !request.id) return;

    await updatePendingRequest(request.id, {
      taskId,
      status: 'in-progress',
      startedAt: Date.now(),
    });

    logger.info('RequestManager', 'Task ID updated', { requestId, taskId });
  }

  // 3. Update progress during polling
  async updateProgress(requestId: string, progress: string): Promise<void> {
    const request = await getPendingRequestByRequestId(requestId);
    if (!request || !request.id) return;

    await updatePendingRequest(request.id, {
      progress,
      status: 'polling',
      lastPolledAt: Date.now(),
    });
  }

  // 4. Complete request
  async completeRequest(requestId: string, resultUrl: string, r2Url?: string): Promise<void> {
    const request = await getPendingRequestByRequestId(requestId);
    if (!request || !request.id) return;

    await updatePendingRequest(request.id, {
      status: 'completed',
      resultUrl,
      r2Url,
      completedAt: Date.now(),
    });

    logger.info('RequestManager', 'Request completed', { requestId, resultUrl });
  }

  // 5. Fail request (with retry logic)
  async failRequest(requestId: string, error: string): Promise<void> {
    const request = await getPendingRequestByRequestId(requestId);
    if (!request || !request.id) return;

    const shouldRetry = request.retryCount < request.maxRetries;

    if (shouldRetry) {
      logger.warn('RequestManager', 'Retrying request', { requestId, retryCount: request.retryCount + 1 });

      await updatePendingRequest(request.id, {
        status: 'queued',
        retryCount: request.retryCount + 1,
        error,
      });

      // Exponential backoff
      setTimeout(() => {
        // Trigger retry (emit event or call handler)
        window.dispatchEvent(new CustomEvent('retry-request', { detail: { requestId } }));
      }, 5000 * (request.retryCount + 1));
    } else {
      logger.error('RequestManager', 'Request failed permanently', { requestId, error });

      await updatePendingRequest(request.id, {
        status: 'failed',
        error,
        completedAt: Date.now(),
      });
    }
  }

  // Get request by ID
  async getRequest(requestId: string): Promise<PendingRequest | undefined> {
    return await getPendingRequestByRequestId(requestId);
  }

  // Get all pending requests
  async getPendingRequests(): Promise<PendingRequest[]> {
    return await getAllPendingRequests();
  }

  // Delete request
  async deleteRequest(requestId: string): Promise<void> {
    const request = await getPendingRequestByRequestId(requestId);
    if (!request || !request.id) return;

    await deletePendingRequest(request.id);
    logger.info('RequestManager', 'Request deleted', { requestId });
  }
}

export const requestManager = new RequestManager();
