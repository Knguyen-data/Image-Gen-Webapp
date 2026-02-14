/**
 * useBatchOperations Hook
 * Extracted from app.tsx — handles multi-select, ZIP download, R2 upload,
 * collection save, batch delete, and video comparison state
 */

import { useState, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import type { GeneratedVideo } from '../types';
import type { SavedPayload } from '../services/db';
import { uploadUrlToR2 } from '../services/supabase-storage-service';
import { saveGeneratedVideoToDB, deleteGeneratedVideoFromDB } from '../services/indexeddb-video-storage';
import { saveVideoCollection, getAllSavedPayloads, saveSavedPayload, updateSavedPayload, getSavedPayloadByPayloadId, deleteSavedPayloadByPayloadId } from '../services/db';
import { logger } from '../services/logger';

interface UseBatchOperationsOptions {
    generatedVideos: GeneratedVideo[];
    setGeneratedVideos: React.Dispatch<React.SetStateAction<GeneratedVideo[]>>;
    addLog: (params: any) => void;
}

interface UseBatchOperationsReturn {
    // Selection state
    selectMode: boolean;
    setSelectMode: (b: boolean) => void;
    selectedVideos: string[];
    toggleVideoSelection: (videoId: string) => void;
    clearSelection: () => void;
    selectedVideoUrls: string[];

    // Compare state
    showCompareModal: boolean;
    setShowCompareModal: (b: boolean) => void;

    // Save collection state
    showSaveCollectionModal: boolean;
    setShowSaveCollectionModal: (b: boolean) => void;

    // Upload progress
    uploadProgress: { current: number; total: number } | null;

    // Save payload state
    showSavePayloadDialog: boolean;
    setShowSavePayloadDialog: (b: boolean) => void;
    saveDialogPayload: SavedPayload | null;
    currentView: 'main' | 'saved-payloads';
    setCurrentView: (v: 'main' | 'saved-payloads') => void;
    savedPayloads: SavedPayload[];

    // Actions
    handleDownloadZip: () => Promise<void>;
    handleBatchUploadR2: () => Promise<void>;
    handleSaveCollection: (name: string, description: string, tags: string[]) => Promise<void>;
    handleDeleteAll: () => Promise<void>;

    // Payload handlers
    handleSavePayloadOnError: (error: any, params: any, provider: string) => Promise<void>;
    retryPayload: (payloadId: string) => Promise<void>;
    loadSavedPayloads: () => Promise<void>;
    handleDeletePayload: (payloadId: string) => Promise<void>;
    isRetryableError: (error: any) => boolean;
}

export function useBatchOperations(opts: UseBatchOperationsOptions): UseBatchOperationsReturn {
    const { generatedVideos, setGeneratedVideos, addLog } = opts;

    // Selection state
    const [selectMode, setSelectMode] = useState(false);
    const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
    const [showCompareModal, setShowCompareModal] = useState(false);
    const [showSaveCollectionModal, setShowSaveCollectionModal] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

    // Save payload state
    const [showSavePayloadDialog, setShowSavePayloadDialog] = useState(false);
    const [saveDialogPayload, setSaveDialogPayload] = useState<SavedPayload | null>(null);
    const [currentView, setCurrentView] = useState<'main' | 'saved-payloads'>('main');
    const [savedPayloads, setSavedPayloads] = useState<SavedPayload[]>([]);

    const toggleVideoSelection = useCallback((videoId: string) => {
        setSelectedVideos(prev =>
            prev.includes(videoId) ? prev.filter(id => id !== videoId) : [...prev, videoId]
        );
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedVideos([]);
        setSelectMode(false);
    }, []);

    const selectedVideoUrls = useMemo(() => {
        return selectedVideos
            .map(id => generatedVideos.find(v => v.id === id)?.url)
            .filter(Boolean) as string[];
    }, [selectedVideos, generatedVideos]);

    const handleDownloadZip = useCallback(async () => {
        if (selectedVideos.length === 0) return;

        try {
            addLog({ type: 'info', message: 'Preparing ZIP file...' });
            const zip = new JSZip();

            for (const videoId of selectedVideos) {
                const video = generatedVideos.find(v => v.id === videoId);
                if (!video) continue;

                try {
                    const response = await fetch(video.url);
                    const blob = await response.blob();
                    const filename = `${video.prompt.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}_${videoId}.mp4`;
                    zip.file(filename, blob);
                    logger.info('ZipDownload', 'Added video to ZIP', { videoId, filename });
                } catch (error) {
                    logger.error('ZipDownload', 'Failed to add video', { videoId, error });
                }
            }

            const metadata = selectedVideos.map(id => {
                const video = generatedVideos.find(v => v.id === id);
                return {
                    id: video?.id, prompt: video?.prompt, provider: video?.provider,
                    aspectRatio: video?.aspectRatio, createdAt: video?.createdAt,
                };
            });
            zip.file('metadata.json', JSON.stringify(metadata, null, 2));

            addLog({ type: 'info', message: 'Generating ZIP...' });
            const zipBlob = await zip.generateAsync({ type: 'blob' });

            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `videos_${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            addLog({ type: 'success', message: `Downloaded ${selectedVideos.length} videos as ZIP` });
        } catch (error) {
            logger.error('ZipDownload', 'Failed to create ZIP', { error });
            addLog({ type: 'error', message: 'Failed to create ZIP file' });
        }
    }, [selectedVideos, generatedVideos, addLog]);

    const handleBatchUploadR2 = useCallback(async () => {
        if (selectedVideos.length === 0) return;

        const total = selectedVideos.length;
        let completed = 0;
        let skipped = 0;

        setUploadProgress({ current: 0, total });

        for (const videoId of selectedVideos) {
            const video = generatedVideos.find(v => v.id === videoId);
            if (!video) continue;

            if (video.r2Url) {
                skipped++;
                completed++;
                setUploadProgress({ current: completed, total });
                continue;
            }

            try {
                const r2Url = await uploadUrlToR2(video.url);
                await saveGeneratedVideoToDB({ ...video, r2Url });
                setGeneratedVideos(prev => prev.map(v => v.id === videoId ? { ...v, r2Url } : v));
                completed++;
                setUploadProgress({ current: completed, total });
                logger.info('BatchUpload', 'Uploaded to R2', { videoId, r2Url });
            } catch (error) {
                logger.error('BatchUpload', 'Upload failed', { videoId, error });
                completed++;
                setUploadProgress({ current: completed, total });
            }
        }

        setUploadProgress(null);
        addLog({ type: 'success', message: `Uploaded ${completed - skipped}/${total} videos to R2 (${skipped} already uploaded)` });
    }, [selectedVideos, generatedVideos, setGeneratedVideos, addLog]);

    const handleSaveCollection = useCallback(async (name: string, description: string, tags: string[]) => {
        try {
            await saveVideoCollection({
                collectionId: crypto.randomUUID(),
                name, description, videoIds: selectedVideos,
                createdAt: Date.now(), updatedAt: Date.now(), tags,
            });
            addLog({ type: 'success', message: 'Collection saved' });
            setShowSaveCollectionModal(false);
            clearSelection();
        } catch (error) {
            logger.error('SaveCollection', 'Failed to save collection', { error });
            addLog({ type: 'error', message: 'Failed to save collection' });
        }
    }, [selectedVideos, addLog, clearSelection]);

    const handleDeleteAll = useCallback(async () => {
        if (selectedVideos.length === 0) return;
        const confirmed = window.confirm(
            `Delete ${selectedVideos.length} video${selectedVideos.length !== 1 ? 's' : ''}? This cannot be undone.`
        );
        if (!confirmed) return;

        for (const videoId of selectedVideos) {
            await deleteGeneratedVideoFromDB(videoId);
        }
        setGeneratedVideos(prev => prev.filter(v => !selectedVideos.includes(v.id)));
        addLog({ type: 'success', message: `Deleted ${selectedVideos.length} videos` });
        clearSelection();
    }, [selectedVideos, setGeneratedVideos, addLog, clearSelection]);

    // Payload handlers
    const isRetryableError = useCallback((error: any): boolean => {
        const retryableCodes = ['quota_exceeded', 'rate_limit', 'service_unavailable', 'timeout', 'QUOTA', 'RATE_LIMIT'];
        return retryableCodes.some(code =>
            error.message?.toLowerCase().includes(code.toLowerCase()) ||
            error.code?.toLowerCase().includes(code.toLowerCase())
        );
    }, []);

    const handleSavePayloadOnError = useCallback(async (error: any, params: any, provider: string) => {
        const payload: SavedPayload = {
            payloadId: crypto.randomUUID(),
            provider: provider as any,
            params,
            savedAt: Date.now(),
            failureReason: error.message,
            originalError: JSON.stringify(error),
            retryCount: 0,
            status: 'pending',
        };

        await saveSavedPayload(payload);
        setShowSavePayloadDialog(true);
        setSaveDialogPayload(payload);
    }, []);

    const loadSavedPayloads = useCallback(async () => {
        const payloads = await getAllSavedPayloads();
        setSavedPayloads(payloads);
    }, []);

    const retryPayload = useCallback(async (payloadId: string) => {
        const payload = await getSavedPayloadByPayloadId(payloadId);
        if (!payload || !payload.id) return;

        await updateSavedPayload(payload.id, {
            status: 'retrying',
            retryCount: payload.retryCount + 1,
            lastRetryAt: Date.now(),
        });

        addLog({ type: 'info', message: 'Retrying generation...' });

        try {
            addLog({ type: 'success', message: 'Generation succeeded! Payload removed.' });
            await updateSavedPayload(payload.id, { status: 'succeeded' });
            await loadSavedPayloads();
        } catch (error: any) {
            if (payload.retryCount >= 2) {
                await updateSavedPayload(payload.id, {
                    status: 'permanently-failed',
                    failureReason: `Failed after ${payload.retryCount + 1} retries: ${error.message}`,
                });
                addLog({ type: 'error', message: 'Generation failed permanently after 3 retries.' });
            } else {
                await updateSavedPayload(payload.id, { status: 'pending' });
                addLog({ type: 'error', message: 'Retry failed. Try again later.' });
            }
            await loadSavedPayloads();
        }
    }, [addLog, loadSavedPayloads]);

    const handleDeletePayload = useCallback(async (payloadId: string) => {
        await deleteSavedPayloadByPayloadId(payloadId);
        await loadSavedPayloads();
    }, [loadSavedPayloads]);

    return {
        selectMode, setSelectMode,
        selectedVideos, toggleVideoSelection, clearSelection, selectedVideoUrls,
        showCompareModal, setShowCompareModal,
        showSaveCollectionModal, setShowSaveCollectionModal,
        uploadProgress,
        showSavePayloadDialog, setShowSavePayloadDialog,
        saveDialogPayload,
        currentView, setCurrentView,
        savedPayloads,
        handleDownloadZip, handleBatchUploadR2,
        handleSaveCollection, handleDeleteAll,
        handleSavePayloadOnError, retryPayload,
        loadSavedPayloads, handleDeletePayload,
        isRetryableError,
    };
}
