/**
 * useVideoGeneration Hook
 * Extracted from app.tsx — handles all video generation logic
 * (Pro I2V, Kling 3, Kling 3 Omni, Motion Control, Kling 2.6)
 */

import { useState, useCallback } from 'react';
import type { VideoScene, VideoSettings, GeneratedVideo, VideoModel, KlingProDuration, KlingProAspectRatio, Kling3ImageListItem, ReferenceImage, ReferenceVideo } from '../types';
import { uploadBase64ToR2, uploadUrlToR2 } from '../services/supabase-storage-service';
import { createFreepikProI2VTask, pollFreepikProI2VTask, createKling3Task, pollKling3Task, createKling3OmniTask, createKling3OmniReferenceTask, pollKling3OmniTask, pollKling3OmniReferenceTask, createAndPollWithRetry } from '../services/freepik-kling-service';
import { generateMotionVideo } from '../services/kling-motion-control-service';
import { saveGeneratedVideoToDB, deleteGeneratedVideoFromDB } from '../services/indexeddb-video-storage';
import { logger } from '../services/logger';

interface UseVideoGenerationOptions {
    freepikApiKey: string;
    kieApiKey: string;
    videoSettings: VideoSettings;
    videoScenes: VideoScene[];
    videoModel: VideoModel;
    setLoadingStatus: (s: string) => void;
    setIsGenerating: (b: boolean) => void;
    refreshCredits: () => void;
    addJob: (params: any) => string;
    updateJob: (id: string, params: any) => void;
    addLog: (params: any) => void;
    setKeyModalMode: (m: 'gemini' | 'spicy' | 'freepik' | 'runpod') => void;
    setIsKeyModalOpen: (b: boolean) => void;
}

interface UseVideoGenerationReturn {
    generatedVideos: GeneratedVideo[];
    setGeneratedVideos: React.Dispatch<React.SetStateAction<GeneratedVideo[]>>;
    handleDeleteVideo: (videoId: string) => Promise<void>;
    handleRetryVideo: (video: GeneratedVideo) => Promise<void>;
    generateProI2V: (scene: VideoScene, sceneIndex: number, totalScenes: number, onProgress?: (detail: string) => void) => Promise<GeneratedVideo>;
    generateKling3: (onProgress?: (detail: string) => void) => Promise<GeneratedVideo>;
    generateKling3Omni: (onProgress?: (detail: string) => void) => Promise<GeneratedVideo>;
    handleVideoGenerate: () => Promise<void>;
}

export function useVideoGeneration(opts: UseVideoGenerationOptions): UseVideoGenerationReturn {
    const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);

    const {
        freepikApiKey, kieApiKey, videoSettings, videoScenes, videoModel,
        setLoadingStatus, setIsGenerating, refreshCredits,
        addJob, updateJob, addLog,
        setKeyModalMode, setIsKeyModalOpen,
    } = opts;

    const handleDeleteVideo = useCallback(async (videoId: string) => {
        const prev = generatedVideos;
        setGeneratedVideos(p => p.filter(v => v.id !== videoId));
        try {
            await deleteGeneratedVideoFromDB(videoId);
            logger.debug('Video', 'Deleted video from IndexedDB', { videoId });
        } catch (e) {
            setGeneratedVideos(prev);
            logger.error('Video', 'Delete video failed', e);
        }
    }, [generatedVideos]);

    /**
     * Pro I2V generation: upload image via R2 → Freepik Pro I2V → poll
     */
    const generateProI2V = useCallback(async (
        scene: VideoScene,
        sceneIndex: number,
        totalScenes: number,
        onProgress?: (detail: string) => void,
    ): Promise<GeneratedVideo> => {
        const startTime = Date.now();
        const duration = (videoSettings as any).klingProDuration as KlingProDuration || '5';
        const aspectRatio = (videoSettings as any).klingProAspectRatio as KlingProAspectRatio || 'widescreen_16_9';
        const cfgScale = (videoSettings as any).klingCfgScale ?? 0.5;
        const negativePrompt = (videoSettings as any).klingProNegativePrompt || '';
        const generateAudio = (videoSettings as any).klingProGenerateAudio || false;

        try {
            onProgress?.('Uploading image...');
            const imageRef = await uploadBase64ToR2(scene.referenceImage.base64, scene.referenceImage.mimeType);

            const result = await createAndPollWithRetry(
                () => createFreepikProI2VTask(
                    freepikApiKey, imageRef, scene.prompt, duration, aspectRatio,
                    cfgScale, negativePrompt, generateAudio
                ),
                (taskId, onPollProgress) => pollFreepikProI2VTask(freepikApiKey, taskId, onPollProgress),
                (status) => onProgress?.(status)
            );

            if (result.success && result.videoUrl) {
                logger.info('Video', 'Pro I2V complete', { sceneId: scene.id, durationMs: Date.now() - startTime });
                onProgress?.('Saving video to R2...');
                let finalUrl = result.videoUrl;
                try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
                    logger.warn('Video', 'R2 re-upload failed, using original URL', e);
                }
                return {
                    id: `video-${Date.now()}`,
                    sceneId: scene.id,
                    url: finalUrl,
                    duration: parseInt(duration),
                    prompt: scene.prompt,
                    createdAt: Date.now(),
                    status: 'success',
                    provider: 'freepik',
                };
            }

            return {
                id: `video-${Date.now()}`,
                sceneId: scene.id, url: '', duration: 0, prompt: scene.prompt,
                createdAt: Date.now(), status: 'failed',
                error: result.error || 'Pro I2V generation failed',
            };
        } catch (error) {
            logger.error('Video', 'Pro I2V failed', { error, sceneId: scene.id });
            return {
                id: `video-${Date.now()}`,
                sceneId: scene.id, url: '', duration: 0, prompt: scene.prompt,
                createdAt: Date.now(), status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }, [freepikApiKey, videoSettings]);

    /**
     * Kling 3 MultiShot generation
     */
    const generateKling3 = useCallback(async (
        onProgress?: (detail: string) => void,
    ): Promise<GeneratedVideo> => {
        const startTime = Date.now();
        const shotType = (videoSettings as any).kling3ShotType || 'intelligent';
        const cfgScale = (videoSettings as any).kling3CfgScale ?? 0.5;
        const negativePrompt = (videoSettings as any).kling3NegativePrompt || '';
        const aspectRatio = (videoSettings as any).kling3AspectRatio || '16:9';
        const duration = (videoSettings as any).kling3Duration || 5;
        const generateAudio = (videoSettings as any).kling3GenerateAudio || false;
        const tierRaw = (videoSettings as any).kling3Tier || 'pro';
        const tier = tierRaw === 'standard' ? 'std' : tierRaw;
        const startImage = (videoSettings as any).kling3StartImage as ReferenceImage | null;
        const endImage = (videoSettings as any).kling3EndImage as ReferenceImage | null;

        try {
            let prompt: string | undefined;
            let multiPrompt: Array<{ index: number; prompt: string; duration: number }> | undefined;

            if (shotType === 'intelligent') {
                prompt = (videoSettings as any).kling3Prompt || '';
            } else {
                const shots: Array<{ prompt: string; duration: number }> = (videoSettings as any).kling3MultiPrompt || [];
                multiPrompt = shots.map((s, i) => ({ index: i, prompt: s.prompt, duration: s.duration || 3 }));
            }

            let imageList: Kling3ImageListItem[] | undefined;
            if (startImage) {
                onProgress?.('Uploading start frame...');
                const startUrl = await uploadBase64ToR2(startImage.base64, startImage.mimeType);
                imageList = [{ imageUrl: startUrl, type: 'first_frame' }];
            }
            if (endImage) {
                onProgress?.('Uploading end frame...');
                const endUrl = await uploadBase64ToR2(endImage.base64, endImage.mimeType);
                if (!imageList) imageList = [];
                imageList.push({ imageUrl: endUrl, type: 'end_frame' });
            }

            const result = await createAndPollWithRetry(
                () => createKling3Task(freepikApiKey, tier as 'pro' | 'std', {
                    prompt, imageList, multiShot: shotType === 'customize', multiPrompt,
                    negativePrompt, aspectRatio: aspectRatio as any, duration, cfgScale, shotType, generateAudio,
                }),
                (taskId, onPollProgress) => pollKling3Task(freepikApiKey, taskId, onPollProgress),
                (status) => onProgress?.(status)
            );

            const promptSummary = prompt || (multiPrompt?.map(s => s.prompt).join(' || ') || '');
            const videoDuration = shotType === 'intelligent'
                ? duration
                : (multiPrompt?.reduce((a, s) => a + s.duration, 0) || duration);

            if (result.success && result.videoUrl) {
                logger.info('Video', 'Kling 3 complete', { durationMs: Date.now() - startTime });
                onProgress?.('Saving video to R2...');
                let finalUrl = result.videoUrl;
                try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
                    logger.warn('Video', 'R2 re-upload failed, using original URL', e);
                }
                return {
                    id: `video-${Date.now()}`, sceneId: 'kling3-direct',
                    url: finalUrl, duration: videoDuration, prompt: promptSummary,
                    createdAt: Date.now(), status: 'success', provider: 'freepik',
                };
            }

            return {
                id: `video-${Date.now()}`, sceneId: 'kling3-direct',
                url: '', duration: 0, prompt: promptSummary,
                createdAt: Date.now(), status: 'failed',
                error: result.error || 'Kling 3 generation failed',
            };
        } catch (error) {
            logger.error('Video', 'Kling 3 failed', { error });
            return {
                id: `video-${Date.now()}`, sceneId: 'kling3-direct',
                url: '', duration: 0, prompt: '',
                createdAt: Date.now(), status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }, [freepikApiKey, videoSettings]);

    /**
     * Kling 3 Omni generation
     */
    const generateKling3Omni = useCallback(async (
        onProgress?: (detail: string) => void,
    ): Promise<GeneratedVideo> => {
        const startTime = Date.now();
        const inputMode = (videoSettings as any).kling3OmniInputMode || 'image-to-video';
        const multiEnabled = !!(videoSettings as any).kling3OmniMultiPromptEnabled;
        const prompt = (videoSettings as any).kling3OmniPrompt || '';
        const multiPrompt: string[] = (videoSettings as any).kling3OmniMultiPrompt || [];
        const startImage = (videoSettings as any).kling3OmniStartImage as ReferenceImage | null;
        const endImage = (videoSettings as any).kling3OmniEndImage as ReferenceImage | null;
        const imageUrls: ReferenceImage[] = (videoSettings as any).kling3OmniImageUrls || [];
        const refVideo = (videoSettings as any).kling3OmniReferenceVideo as ReferenceVideo | null;

        const tierRaw = (videoSettings as any).kling3Tier || 'pro';
        const tier = tierRaw === 'standard' ? 'std' : tierRaw;
        const aspectRatio = (videoSettings as any).kling3AspectRatio || '16:9';
        const duration = (videoSettings as any).kling3Duration || 5;
        const generateAudio = (videoSettings as any).kling3GenerateAudio || false;
        const cfgScale = (videoSettings as any).kling3CfgScale ?? 0.5;
        const negativePrompt = (videoSettings as any).kling3NegativePrompt || 'blur, distort, and low quality';

        const isV2V = inputMode === 'video-to-video';
        const isI2V = inputMode === 'image-to-video';
        const isT2V = inputMode === 'text-to-video';

        try {
            // ---------- V2V Mode ----------
            if (isV2V) {
                if (!refVideo?.file) throw new Error('V2V mode requires a reference video');

                onProgress?.('Uploading reference video...');
                const videoBase64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const dataUrl = reader.result as string;
                        resolve(dataUrl.split(',')[1]);
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(refVideo.file);
                });
                const mimeType = refVideo.file.type || 'video/mp4';
                const videoUrl = await uploadBase64ToR2(videoBase64, mimeType);

                let startFrameUrl: string | undefined;
                if (startImage) {
                    onProgress?.('Uploading start frame...');
                    startFrameUrl = await uploadBase64ToR2(startImage.base64, startImage.mimeType);
                }

                const result = await createAndPollWithRetry(
                    () => createKling3OmniReferenceTask(freepikApiKey, tier as 'pro' | 'std', {
                        videoUrl, prompt, imageUrl: startFrameUrl,
                        aspectRatio: aspectRatio as any, duration, cfgScale, negativePrompt,
                    }),
                    (taskId, onPollProgress) => pollKling3OmniReferenceTask(freepikApiKey, taskId, onPollProgress),
                    (status) => onProgress?.(status)
                );

                if (result.success && result.videoUrl) {
                    onProgress?.('Saving video to R2...');
                    let finalUrl = result.videoUrl;
                    try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
                        logger.warn('Video', 'R2 re-upload failed, using original URL', e);
                    }
                    return {
                        id: `video-${Date.now()}`, sceneId: 'kling3-omni-v2v',
                        url: finalUrl, duration, prompt, createdAt: Date.now(),
                        status: 'success', provider: 'freepik',
                    };
                }
                throw new Error(result.error || 'Kling 3 Omni V2V failed');
            }

            // ---------- T2V / I2V Mode ----------
            const options: any = {
                aspectRatio: aspectRatio as any, duration, generateAudio,
            };

            if (multiEnabled && !isV2V) {
                const validShots = multiPrompt.filter(s => s.trim());
                if (validShots.length > 0) {
                    options.multiPrompt = validShots;
                } else {
                    options.prompt = prompt || 'Create an engaging video.';
                }
            } else {
                options.prompt = prompt || 'Create an engaging video.';
            }

            if (isI2V && startImage) {
                onProgress?.('Uploading start frame...');
                const startUrl = await uploadBase64ToR2(startImage.base64, startImage.mimeType);
                if (endImage) {
                    options.startImageUrl = startUrl;
                } else {
                    options.imageUrl = startUrl;
                }
            }
            if (isI2V && endImage) {
                onProgress?.('Uploading end frame...');
                const endUrl = await uploadBase64ToR2(endImage.base64, endImage.mimeType);
                options.endImageUrl = endUrl;
            }

            if (imageUrls.length > 0 && (isT2V || isI2V)) {
                onProgress?.('Uploading reference images...');
                const uploadedUrls: string[] = [];
                for (const img of imageUrls) {
                    const url = await uploadBase64ToR2(img.base64, img.mimeType);
                    uploadedUrls.push(url);
                }
                options.imageUrls = uploadedUrls;
            }

            const elementData: Array<{ referenceImages: ReferenceImage[]; frontalImage?: ReferenceImage }> =
                (videoSettings as any).kling3OmniElements || [];
            if (elementData.length > 0 && (isT2V || isI2V)) {
                onProgress?.('Uploading element images...');
                const uploadedElements: Array<{ reference_image_urls: string[]; frontal_image_url?: string }> = [];
                for (const el of elementData) {
                    const refUrls: string[] = [];
                    for (const img of el.referenceImages) {
                        const url = await uploadBase64ToR2(img.base64, img.mimeType);
                        refUrls.push(url);
                    }
                    const element: { reference_image_urls: string[]; frontal_image_url?: string } = {
                        reference_image_urls: refUrls,
                    };
                    if (el.frontalImage) {
                        element.frontal_image_url = await uploadBase64ToR2(el.frontalImage.base64, el.frontalImage.mimeType);
                    }
                    uploadedElements.push(element);
                }
                options.elements = uploadedElements;
            }

            const result = await createAndPollWithRetry(
                () => createKling3OmniTask(freepikApiKey, tier as 'pro' | 'std', options),
                (taskId, onPollProgress) => pollKling3OmniTask(freepikApiKey, taskId, onPollProgress),
                (status) => onProgress?.(status)
            );

            const promptSummary = multiEnabled && options.multiPrompt
                ? options.multiPrompt.join(' || ')
                : (options.prompt || '');

            if (result.success && result.videoUrl) {
                onProgress?.('Saving video to R2...');
                let finalUrl = result.videoUrl;
                try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
                    logger.warn('Video', 'R2 re-upload failed, using original URL', e);
                }
                return {
                    id: `video-${Date.now()}`, sceneId: `kling3-omni-${inputMode}`,
                    url: finalUrl, duration, prompt: promptSummary,
                    createdAt: Date.now(), status: 'success', provider: 'freepik',
                };
            }
            throw new Error(result.error || 'Kling 3 Omni generation failed');

        } catch (error) {
            logger.error('Video', 'Kling 3 Omni failed', { error, inputMode });
            return {
                id: `video-${Date.now()}`, sceneId: `kling3-omni-${inputMode}`,
                url: '', duration: 0, prompt: prompt || multiPrompt.join(' || '),
                createdAt: Date.now(), status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }, [freepikApiKey, videoSettings]);

    const handleRetryVideo = useCallback(async (video: GeneratedVideo) => {
        const scene = videoScenes.find(s => s.id === video.sceneId);
        if (!scene) { alert('Original scene not found'); return; }

        if (!freepikApiKey) {
            setKeyModalMode('freepik');
            setIsKeyModalOpen(true);
            return;
        }

        logger.info('Video', 'Retrying video generation', { sceneId: scene.id });
        setIsGenerating(true);
        setLoadingStatus('Retrying video generation...');

        try {
            const result = await generateMotionVideo(
                kieApiKey, freepikApiKey, scene,
                videoSettings.globalReferenceVideo, videoSettings,
                (stage, detail) => setLoadingStatus(`Retry: ${detail || stage}`)
            );

            if (result.status === 'success') {
                setGeneratedVideos(prev => prev.map(v => v.id === video.id ? result : v));
                setLoadingStatus('Retry successful!');
                saveGeneratedVideoToDB(result).catch(e =>
                    logger.warn('Video', 'Failed to persist retried video to IndexedDB', e)
                );
            } else {
                setGeneratedVideos(prev => prev.map(v => v.id === video.id ? result : v));
                setLoadingStatus('Retry failed');
            }
            refreshCredits();
        } catch (error: any) {
            logger.error('Video', 'Video retry failed', { error });
            alert(`Retry failed: ${error.message}`);
            setLoadingStatus('Failed');
        } finally {
            setIsGenerating(false);
            setTimeout(() => setLoadingStatus(''), 2000);
        }
    }, [videoScenes, freepikApiKey, kieApiKey, videoSettings, setLoadingStatus, setIsGenerating, refreshCredits, setKeyModalMode, setIsKeyModalOpen]);

    /**
     * Main video generation handler
     */
    const handleVideoGenerate = useCallback(async () => {
        const needsFreepikOnly = ['kling-2.6-pro', 'kling-3', 'kling-3-omni'].includes(videoModel);
        if (needsFreepikOnly) {
            if (!freepikApiKey) { setKeyModalMode('freepik'); setIsKeyModalOpen(true); return; }
        } else {
            if (!kieApiKey) { setKeyModalMode('spicy'); setIsKeyModalOpen(true); return; }
        }

        // Validate model-specific requirements
        if (videoModel === 'kling-3') {
            const shotType = (videoSettings as any).kling3ShotType || 'intelligent';
            if (shotType === 'intelligent' && !(videoSettings as any).kling3Prompt?.trim()) {
                alert('Please enter a video prompt'); return;
            }
            if (shotType === 'customize') {
                const shots: any[] = (videoSettings as any).kling3MultiPrompt || [];
                if (shots.length === 0) { alert('Add at least one shot'); return; }
                if (shots.some((s: any) => !s.prompt?.trim())) { alert('All shots need prompts'); return; }
            }
        } else if (videoModel === 'kling-3-omni') {
            const omniMode = (videoSettings as any).kling3OmniInputMode || 'image-to-video';
            const multiEnabled = !!(videoSettings as any).kling3OmniMultiPromptEnabled;
            if (multiEnabled && omniMode !== 'video-to-video') {
                const shots = (videoSettings as any).kling3OmniMultiPrompt || [];
                if (shots.length === 0 || shots.every((s: string) => !s.trim())) { alert('Add at least one shot prompt'); return; }
            } else {
                if (!(videoSettings as any).kling3OmniPrompt?.trim()) { alert('Please enter a video prompt'); return; }
            }
            if (omniMode === 'image-to-video' && !(videoSettings as any).kling3OmniStartImage) { alert('I2V mode requires a start frame image'); return; }
            if (omniMode === 'video-to-video' && !(videoSettings as any).kling3OmniReferenceVideo) { alert('V2V mode requires a reference video'); return; }
        } else {
            if (videoScenes.length === 0) { alert('Add at least one scene to generate videos'); return; }
        }

        const kling3PromptSummary = videoModel === 'kling-3'
            ? ((videoSettings as any).kling3ShotType === 'customize'
                ? ((videoSettings as any).kling3MultiPrompt || []).map((s: any) => s.prompt).join(' || ')
                : (videoSettings as any).kling3Prompt || 'Kling 3 video')
            : '';
        const logPrompt = videoModel === 'kling-3'
            ? kling3PromptSummary.slice(0, 50)
            : (videoScenes[0]?.prompt || 'Motion video').slice(0, 50) + (videoScenes.length > 1 ? ` (+${videoScenes.length - 1} more)` : '');

        logger.info('Video', `Starting ${videoModel} generation`);
        setIsGenerating(true);

        const jobId = addJob({ type: 'video', status: 'active', prompt: logPrompt });
        addLog({ level: 'info', message: `Starting ${videoModel} video generation`, jobId });

        // Kling 3 / Kling 3 Omni / Veo 3.1
        if (['kling-3', 'kling-3-omni', 'veo'].includes(videoModel)) {
            const placeholderId = `video-${Date.now()}-${videoModel}`;
            const promptSummary = videoModel === 'kling-3'
                ? kling3PromptSummary
                : videoModel === 'veo'
                    ? ((videoSettings as any).veoPrompt || 'Veo Video')
                    : videoScenes.map(s => s.prompt).join(' || ');

            const placeholder: GeneratedVideo = {
                id: placeholderId,
                sceneId: videoModel === 'kling-3' ? 'kling3-direct' : videoModel === 'veo' ? 'veo-direct' : videoScenes[0]?.id || 'omni-direct',
                url: '', duration: 0,
                prompt: promptSummary,
                createdAt: Date.now(), status: 'generating',
            };
            setGeneratedVideos(prev => [placeholder, ...prev]);

            try {
                setLoadingStatus(`Generating ${videoModel} video...`);
                let video: GeneratedVideo;
                
                if (videoModel === 'veo') {
                    // Import service dynamically to avoid circular refs
                    const { generateVeoVideo } = await import('../services/veo-service');
                    video = await generateVeoVideo(kieApiKey, videoSettings, (detail) => setLoadingStatus(detail));
                } else {
                    video = videoModel === 'kling-3'
                        ? await generateKling3((detail) => setLoadingStatus(detail))
                        : await generateKling3Omni((detail) => setLoadingStatus(detail));
                }

                setGeneratedVideos(prev => prev.map(v =>
                    v.id === placeholderId ? { ...video, id: placeholderId } : v
                ));

                if (video.status === 'success') {
                    setLoadingStatus(`🎬 ${videoModel} done!`);
                    saveGeneratedVideoToDB({ ...video, id: placeholderId }).catch(e =>
                        logger.warn('Video', 'Failed to persist video', e)
                    );
                    updateJob(jobId, { status: 'completed' });
                } else {
                    setLoadingStatus(`🎬 ${videoModel} failed`);
                    updateJob(jobId, { status: 'failed', error: video.error });
                    setTimeout(() => setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId)), 8000);
                }
            } catch (error: any) {
                logger.error('Video', `${videoModel} error`, { error });
                setLoadingStatus(`🎬 ${videoModel} error`);
                updateJob(jobId, { status: 'failed', error: error.message });
                setGeneratedVideos(prev => prev.map(v =>
                    v.id === placeholderId ? { ...v, status: 'failed' as const, error: error.message } : v
                ));
                setTimeout(() => setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId)), 8000);
            } finally {
                setIsGenerating(false);
                refreshCredits();
                setTimeout(() => setLoadingStatus(''), 3000);
            }
            return;
        }

        // Parallel generation (Kling 2.6 / Pro I2V)
        const placeholderIds: string[] = [];
        for (let i = 0; i < videoScenes.length; i++) {
            const scene = videoScenes[i];
            const placeholderId = `video-${Date.now()}-${i}`;
            placeholderIds.push(placeholderId);
            const placeholder: GeneratedVideo = {
                id: placeholderId, sceneId: scene.id, url: '', duration: 0,
                prompt: scene.prompt, createdAt: Date.now(), status: 'generating',
            };
            setGeneratedVideos(prev => [placeholder, ...prev]);
        }

        setLoadingStatus(`Generating ${videoScenes.length} videos in parallel...`);
        const sceneStatuses: string[] = videoScenes.map((_, i) => `Scene ${i + 1}: queued`);
        const updateCombinedStatus = () => setLoadingStatus(sceneStatuses.join(' · '));

        const scenePromises = videoScenes.map(async (scene, i) => {
            const placeholderId = placeholderIds[i];
            if (i > 0) await new Promise(r => setTimeout(r, i * 500));

            try {
                let video: GeneratedVideo;
                sceneStatuses[i] = `Scene ${i + 1}: creating...`;
                updateCombinedStatus();

                if (videoModel === 'kling-2.6-pro') {
                    video = await generateProI2V(scene, i, videoScenes.length, (detail) => {
                        sceneStatuses[i] = `Scene ${i + 1}: ${detail}`;
                        updateCombinedStatus();
                    });
                } else {
                    video = await generateMotionVideo(
                        kieApiKey, freepikApiKey, scene,
                        videoSettings.globalReferenceVideo, videoSettings,
                        (stage, detail) => {
                            sceneStatuses[i] = `Scene ${i + 1}: ${detail || stage}`;
                            updateCombinedStatus();
                        }
                    );
                }

                setGeneratedVideos(prev => prev.map(v =>
                    v.id === placeholderId ? { ...video, id: placeholderId } : v
                ));

                if (video.status === 'success') {
                    sceneStatuses[i] = `Scene ${i + 1}: ✅`;
                    saveGeneratedVideoToDB({ ...video, id: placeholderId }).catch(e =>
                        logger.warn('Video', 'Failed to persist video to IndexedDB', e)
                    );
                } else {
                    sceneStatuses[i] = `Scene ${i + 1}: ❌`;
                    setTimeout(() => setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId)), 8000);
                }
                updateCombinedStatus();
                return video;
            } catch (error: any) {
                sceneStatuses[i] = `Scene ${i + 1}: ❌`;
                updateCombinedStatus();
                logger.error('Video', `Scene ${i + 1} generation error`, { error });
                setGeneratedVideos(prev => prev.map(v =>
                    v.id === placeholderId ? { ...v, status: 'failed' as const, error: error.message } : v
                ));
                setTimeout(() => setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId)), 8000);
                return {
                    id: placeholderId, sceneId: scene.id, url: '', duration: 0,
                    prompt: scene.prompt, createdAt: Date.now(), status: 'failed' as const,
                    error: error.message,
                };
            }
        });

        try {
            const results = await Promise.all(scenePromises);
            const successCount = results.filter(v => v.status === 'success').length;
            const failCount = results.filter(v => v.status === 'failed').length;
            setLoadingStatus(successCount > 0
                ? `🎬 Done! ${successCount} success, ${failCount} failed`
                : '🎬 All videos failed'
            );

            if (failCount === videoScenes.length) {
                updateJob(jobId, { status: 'failed', error: 'All videos failed' });
                addLog({ level: 'error', message: 'All videos failed', jobId });
            } else {
                updateJob(jobId, { status: 'completed' });
                addLog({ level: 'info', message: `Videos complete: ${successCount} success, ${failCount} failed`, jobId });
            }
        } finally {
            setIsGenerating(false);
            refreshCredits();
            setTimeout(() => setLoadingStatus(''), 3000);
        }
    }, [videoModel, freepikApiKey, kieApiKey, videoSettings, videoScenes,
        setLoadingStatus, setIsGenerating, refreshCredits, addJob, updateJob, addLog,
        setKeyModalMode, setIsKeyModalOpen, generateProI2V, generateKling3, generateKling3Omni]);

    return {
        generatedVideos,
        setGeneratedVideos,
        handleDeleteVideo,
        handleRetryVideo,
        generateProI2V,
        generateKling3,
        generateKling3Omni,
        handleVideoGenerate,
    };
}
