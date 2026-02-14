/**
 * useCrashRecovery Hook
 * Extracted from app.tsx — handles pending request detection
 * and resumption for video generation tasks (Veo, Kling, etc.)
 */

import { useState, useCallback } from 'react';
import type { PendingRequest } from '../services/db';
import { requestManager } from '../services/request-manager';
import { logger } from '../services/logger';

interface UseCrashRecoveryOptions {
    resumeVeoPolling: (request: PendingRequest) => Promise<void>;
}

interface UseCrashRecoveryReturn {
    showRecoveryModal: boolean;
    setShowRecoveryModal: (b: boolean) => void;
    pendingRequests: PendingRequest[];
    setPendingRequests: (reqs: PendingRequest[]) => void;
    handleResumeAll: () => void;
    handleCancelAll: () => void;
    resumePolling: (request: PendingRequest) => Promise<void>;
}

export function useCrashRecovery(opts: UseCrashRecoveryOptions): UseCrashRecoveryReturn {
    const [showRecoveryModal, setShowRecoveryModal] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

    const { resumeVeoPolling } = opts;

    const resumePolling = useCallback(async (request: PendingRequest) => {
        logger.info('Recovery', `Resuming ${request.type} task ${request.taskId}`);

        switch (request.type) {
            case 'veo':
                await resumeVeoPolling(request);
                break;
            case 'kling':
                logger.warn('Recovery', 'Kling recovery not yet implemented');
                break;
            case 'amt':
                logger.warn('Recovery', 'AMT recovery not yet implemented');
                break;
            case 'freepik':
                logger.warn('Recovery', 'Freepik recovery not yet implemented');
                break;
        }
    }, [resumeVeoPolling]);

    const handleResumeAll = useCallback(() => {
        pendingRequests.forEach(req => {
            resumePolling(req);
        });
        setShowRecoveryModal(false);
    }, [pendingRequests, resumePolling]);

    const handleCancelAll = useCallback(() => {
        pendingRequests.forEach(req => {
            requestManager.failRequest(req.requestId, 'User cancelled');
        });
        setShowRecoveryModal(false);
    }, [pendingRequests]);

    return {
        showRecoveryModal,
        setShowRecoveryModal,
        pendingRequests,
        setPendingRequests,
        handleResumeAll,
        handleCancelAll,
        resumePolling,
    };
}
