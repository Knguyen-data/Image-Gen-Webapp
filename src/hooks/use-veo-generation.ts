/**
 * useVeoGeneration Hook
 * Extracted from app.tsx — handles all Veo 3.1 generation logic
 * (create, poll, 1080p upgrade, 4K upgrade, extend, crash recovery)
 */

import { useState, useCallback } from 'react';
import type { GeneratedVideo, ReferenceImage } from '../types';
import type { VeoTaskResult, VeoSettings } from '../components/veo3';
import type { VeoGenerateRequest } from '../services/veo3-service';
import type { VeoGenerationType } from '../types';
import { uploadBase64ToR2, uploadUrlToR2 } from '../services/supabase-storage-service';
import { createVeoTask, pollVeoTask, getVeo1080pVideo, requestVeo4kVideo, pollVeo4kTask, extendVeoTask } from '../services/veo3-service';
import { saveGeneratedVideoToDB } from '../services/indexeddb-video-storage';
import { requestManager } from '../services/request-manager';
import { logger } from '../services/logger';
import type { PendingRequest } from '../services/db';

interface UseVeoGenerationOptions {
    kieApiKey: string;
    setIsGenerating: (b: boolean) => void;
    addJob: (params: any) => string;
    updateJob: (id: string, params: any) => void;
    addLog: (params: any) => void;
    setKeyModalMode: (m: 'gemini' | 'spicy' | 'freepik' | 'runpod') => void;
    setIsKeyModalOpen: (b: boolean) => void;
    setGeneratedVideos: React.Dispatch<React.SetStateAction<GeneratedVideo[]>>;
}

interface UseVeoGenerationReturn {
    veoTaskResult: VeoTaskResult | null;
    setVeoTaskResult: React.Dispatch<React.SetStateAction<VeoTaskResult | null>>;
    isVeoUpgrading: boolean;
    handleVeoGenerate: (params: {
        mode: VeoGenerationType;
        prompt: string;
        settings: VeoSettings;
        startImage?: ReferenceImage;
        endImage?: ReferenceImage;
        materials?: ReferenceImage[];
    }) => Promise<void>;
    handleVeoGet1080p: (taskId: string) => Promise<void>;
    handleVeoGet4k: (taskId: string) => Promise<void>;
    handleVeoExtend: (taskId: string) => Promise<void>;
    resumeVeoPolling: (request: PendingRequest) => Promise<void>;
}

export function useVeoGeneration(opts: UseVeoGenerationOptions): UseVeoGenerationReturn {
    const [veoTaskResult, setVeoTaskResult] = useState<VeoTaskResult | null>(null);
    const [isVeoUpgrading, setIsVeoUpgrading] = useState(false);

    const {
        kieApiKey, setIsGenerating,
        addJob, updateJob, addLog,
        setKeyModalMode, setIsKeyModalOpen,
        setGeneratedVideos,
    } = opts;

    const handleVeoGenerate = useCallback(async (params: {
        mode: VeoGenerationType;
        prompt: string;
        settings: VeoSettings;
        startImage?: ReferenceImage;
        endImage?: ReferenceImage;
        materials?: ReferenceImage[];
    }) => {
        if (!kieApiKey) {
            setKeyModalMode('spicy');
            setIsKeyModalOpen(true);
            return;
        }

        setIsGenerating(true);
        const jobId = addJob({ type: 'video', status: 'active', prompt: params.prompt.slice(0, 50) });
        addLog({ level: 'info', message: `Starting Veo 3.1 ${params.mode} generation`, jobId });

        const requestId = await requestManager.createRequest('veo', params);
        const taskIdPlaceholder = `veo-pending-${Date.now()}`;
        setVeoTaskResult({ taskId: taskIdPlaceholder, status: 'generating', progress: 'Initializing...' });

        try {
            const request: VeoGenerateRequest = {
                prompt: params.prompt,
                model: params.settings.model,
                generationType: params.mode,
                aspectRatio: params.settings.aspectRatio,
                enableTranslation: params.settings.enableTranslation,
                seeds: params.settings.seeds,
                watermark: params.settings.watermark,
                callBackUrl: params.settings.callBackUrl,
            };

            const imageUrls: string[] = [];

            try {
                if (params.mode === 'FIRST_AND_LAST_FRAMES_2_VIDEO') {
                    if (params.startImage) {
                        setVeoTaskResult(prev => prev ? { ...prev, progress: 'Uploading start frame...' } : prev);
                        await requestManager.updateProgress(requestId, 'Uploading start frame...');
                        imageUrls.push(await uploadBase64ToR2(params.startImage.base64, params.startImage.mimeType));
                    }
                    if (params.endImage) {
                        setVeoTaskResult(prev => prev ? { ...prev, progress: 'Uploading end frame...' } : prev);
                        await requestManager.updateProgress(requestId, 'Uploading end frame...');
                        imageUrls.push(await uploadBase64ToR2(params.endImage.base64, params.endImage.mimeType));
                    }
                } else if (params.mode === 'REFERENCE_2_VIDEO' && params.materials) {
                    for (let i = 0; i < params.materials.length; i++) {
                        setVeoTaskResult(prev => prev ? { ...prev, progress: `Uploading material ${i + 1}/${params.materials!.length}...` } : prev);
                        await requestManager.updateProgress(requestId, `Uploading material ${i + 1}/${params.materials.length}...`);
                        imageUrls.push(await uploadBase64ToR2(params.materials[i].base64, params.materials[i].mimeType));
                    }
                }
            } catch (uploadError) {
                logger.error('Veo', 'R2 upload failed', { error: uploadError });
                setVeoTaskResult({
                    taskId: taskIdPlaceholder, status: 'failed',
                    error: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
                });
                updateJob(jobId, { status: 'failed', error: 'Upload failed' });
                addLog({ level: 'error', message: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`, jobId });
                await requestManager.failRequest(requestId, `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
                setIsGenerating(false);
                return;
            }

            if (imageUrls.length > 0) request.imageUrls = imageUrls;

            setVeoTaskResult(prev => prev ? { ...prev, status: 'generating', progress: 'Creating task...' } : prev);
            await requestManager.updateProgress(requestId, 'Creating task...');
            const createResult = await createVeoTask(kieApiKey, request);
            const taskId = createResult.data.taskId;
            await requestManager.updateTaskId(requestId, taskId);
            setVeoTaskResult({ taskId, status: 'generating', progress: 'Generating video...' });

            const pollResult = await pollVeoTask(kieApiKey, taskId, async (status, attempt) => {
                setVeoTaskResult(prev => prev ? { ...prev, progress: `${status} (${attempt + 1}/180)` } : prev);
                await requestManager.updateProgress(requestId, `${status} (${attempt + 1}/180)`);
            });

            const videoUrls = pollResult.data.response?.resultUrls || [];
            const resolution = pollResult.data.response?.resolution;

            if (videoUrls.length > 0) {
                let finalUrl = videoUrls[0];
                try { finalUrl = await uploadUrlToR2(videoUrls[0]); } catch (e) {
                    logger.warn('Veo', 'R2 re-upload failed, using original URL', e);
                }

                setVeoTaskResult({ taskId, status: 'success', videoUrls, resolution });

                const video: GeneratedVideo = {
                    id: `video-${Date.now()}-veo3`, sceneId: 'veo3-direct',
                    url: finalUrl, duration: 0, prompt: params.prompt,
                    createdAt: Date.now(), status: 'success',
                };
                setGeneratedVideos(prev => [video, ...prev]);
                saveGeneratedVideoToDB(video).catch(e =>
                    logger.warn('Veo', 'Failed to persist Veo video to IndexedDB', e)
                );

                await requestManager.completeRequest(requestId, finalUrl);
                updateJob(jobId, { status: 'completed' });
                addLog({ level: 'info', message: 'Veo 3.1 video generated successfully', jobId });
            } else {
                throw new Error('No video URLs in response');
            }
        } catch (error: any) {
            logger.error('Veo', 'Generation error', { error });
            setVeoTaskResult({ taskId: taskIdPlaceholder, status: 'failed', error: error.message || 'Unknown error' });
            updateJob(jobId, { status: 'failed', error: error.message });
            addLog({ level: 'error', message: `Veo 3.1 error: ${error.message}`, jobId });
            await requestManager.failRequest(requestId, error.message || 'Unknown error');
        } finally {
            setIsGenerating(false);
        }
    }, [kieApiKey, setIsGenerating, addJob, updateJob, addLog, setKeyModalMode, setIsKeyModalOpen, setGeneratedVideos]);

    const handleVeoGet1080p = useCallback(async (taskId: string) => {
        if (!kieApiKey) return;
        setIsVeoUpgrading(true);
        const jobId = addJob({ type: 'video', status: 'active', prompt: 'Veo 3.1: Upgrading to 1080P' });
        try {
            const result = await getVeo1080pVideo(kieApiKey, { taskId });
            const url1080p = result.data.resultUrl;
            setVeoTaskResult(prev => prev ? {
                ...prev, videoUrls: [url1080p, ...(prev.videoUrls?.slice(1) || [])], resolution: '1080P',
            } : prev);
            updateJob(jobId, { status: 'completed' });
            addLog({ level: 'info', message: 'Veo 3.1: 1080P video ready', jobId });
        } catch (error: any) {
            logger.error('Veo', '1080P upgrade failed', { error });
            updateJob(jobId, { status: 'failed', error: error.message });
            addLog({ level: 'error', message: `Veo 1080P failed: ${error.message}`, jobId });
        } finally {
            setIsVeoUpgrading(false);
        }
    }, [kieApiKey, addJob, updateJob, addLog]);

    const handleVeoGet4k = useCallback(async (taskId: string) => {
        if (!kieApiKey) return;
        setIsVeoUpgrading(true);
        const jobId = addJob({ type: 'video', status: 'active', prompt: 'Veo 3.1: Upgrading to 4K' });
        try {
            const request4k = await requestVeo4kVideo(kieApiKey, { taskId });
            const fourKTaskId = request4k.data.taskId;

            const pollResult = await pollVeo4kTask(kieApiKey, fourKTaskId, (status, attempt) => {
                setVeoTaskResult(prev => prev ? { ...prev, progress: `4K: ${status} (${attempt + 1}/180)` } : prev);
            });

            const fourKUrls = pollResult.data.response?.resultUrls || [];
            if (fourKUrls.length > 0) {
                setVeoTaskResult(prev => prev ? {
                    ...prev, videoUrls: fourKUrls, resolution: '4K', progress: undefined,
                } : prev);
                updateJob(jobId, { status: 'completed' });
                addLog({ level: 'info', message: 'Veo 3.1: 4K video ready', jobId });
            }
        } catch (error: any) {
            logger.error('Veo', '4K upgrade failed', { error });
            updateJob(jobId, { status: 'failed', error: error.message });
            addLog({ level: 'error', message: `Veo 4K failed: ${error.message}`, jobId });
        } finally {
            setIsVeoUpgrading(false);
        }
    }, [kieApiKey, addJob, updateJob, addLog]);

    const handleVeoExtend = useCallback(async (taskId: string) => {
        if (!kieApiKey) return;
        setIsVeoUpgrading(true);
        try {
            setVeoTaskResult(prev => prev ? { ...prev, status: 'generating', progress: 'Extending video...' } : prev);
            const extendResult = await extendVeoTask(kieApiKey, { taskId, prompt: 'Continue the video seamlessly.' });
            const extendTaskId = extendResult.data.taskId;

            const pollResult = await pollVeoTask(kieApiKey, extendTaskId, (status, attempt) => {
                setVeoTaskResult(prev => prev ? { ...prev, progress: `Extend: ${status} (${attempt + 1}/180)` } : prev);
            });

            const videoUrls = pollResult.data.response?.resultUrls || [];
            if (videoUrls.length > 0) {
                setVeoTaskResult({
                    taskId: extendTaskId, status: 'success', videoUrls,
                    resolution: pollResult.data.response?.resolution,
                });
                addLog({ level: 'info', message: 'Veo 3.1: video extended successfully' });
            }
        } catch (error: any) {
            logger.error('Veo', 'Extend failed', { error });
            setVeoTaskResult(prev => prev ? { ...prev, status: 'failed', error: error.message } : prev);
            addLog({ level: 'error', message: `Veo extend failed: ${error.message}` });
        } finally {
            setIsVeoUpgrading(false);
        }
    }, [kieApiKey, addLog]);

    const resumeVeoPolling = useCallback(async (request: PendingRequest) => {
        if (!kieApiKey) {
            logger.warn('Recovery', 'Cannot resume Veo task - no API key');
            return;
        }
        if (!request.taskId) {
            logger.warn('Recovery', 'Cannot resume Veo task - no taskId');
            await requestManager.failRequest(request.requestId, 'No taskId found');
            return;
        }

        try {
            setVeoTaskResult({ taskId: request.taskId, status: 'generating', progress: 'Resuming...' });

            const pollResult = await pollVeoTask(kieApiKey, request.taskId, async (status, attempt) => {
                setVeoTaskResult(prev => prev ? { ...prev, progress: `${status} (${attempt + 1}/180)` } : prev);
                await requestManager.updateProgress(request.requestId, `${status} (${attempt + 1}/180)`);
            });

            const videoUrls = pollResult.data.response?.resultUrls || [];
            const resolution = pollResult.data.response?.resolution;

            if (videoUrls.length > 0) {
                let finalUrl = videoUrls[0];
                try { finalUrl = await uploadUrlToR2(videoUrls[0]); } catch (e) {
                    logger.warn('Recovery', 'Veo R2 re-upload failed, using original URL', e);
                }

                setVeoTaskResult({ taskId: request.taskId, status: 'success', videoUrls, resolution });

                const video: GeneratedVideo = {
                    id: `video-${Date.now()}-veo3-recovered`, sceneId: 'veo3-direct',
                    url: finalUrl, duration: 0, prompt: request.prompt,
                    createdAt: Date.now(), status: 'success',
                };
                setGeneratedVideos(prev => [video, ...prev]);
                saveGeneratedVideoToDB(video).catch(e =>
                    logger.warn('Recovery', 'Failed to persist recovered Veo video to IndexedDB', e)
                );

                await requestManager.completeRequest(request.requestId, finalUrl);
                addLog({ level: 'info', message: 'Veo 3.1 video recovered successfully' });
            } else {
                throw new Error('No video URLs in response');
            }
        } catch (error: any) {
            logger.error('Recovery', 'Failed to resume Veo task', { error });
            setVeoTaskResult({
                taskId: request.taskId, status: 'failed',
                error: error.message || 'Unknown error',
            });
            await requestManager.failRequest(request.requestId, error.message || 'Unknown error');
            addLog({ level: 'error', message: `Veo recovery failed: ${error.message}` });
        }
    }, [kieApiKey, addLog, setGeneratedVideos]);

    return {
        veoTaskResult,
        setVeoTaskResult,
        isVeoUpgrading,
        handleVeoGenerate,
        handleVeoGet1080p,
        handleVeoGet4k,
        handleVeoExtend,
        resumeVeoPolling,
    };
}
