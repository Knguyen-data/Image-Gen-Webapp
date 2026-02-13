import React, { useState, useEffect } from 'react';
import LeftPanel from '../components/left-panel';
import RightPanel from '../components/right-panel';
import ApiKeyModal from '../components/api-key-modal';
import AnimatedBackground from '../components/animated-background';
import { RecoveryModal } from '../components/recovery-modal';
import { BatchActionsToolbar } from '../components/batch-actions-toolbar';
import { SuspenseFallback, ModalSuspenseFallback, PanelSuspenseFallback } from '../components/suspense-fallback';
import { AppSettings, Run, GeneratedImage, PromptItem, ReferenceImage, VideoScene, VideoSettings, GeneratedVideo, VideoModel } from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { generateImage, modifyImage } from '../services/gemini-service';
import { getAllRunsFromDB, saveRunToDB, deleteRunFromDB, saveRunToDBWithSync, type PendingRequest, type SavedPayload } from '../services/db';
import { getAllGeneratedVideosFromDB, saveGeneratedVideoToDB, deleteGeneratedVideoFromDB } from '../services/indexeddb-video-storage';
import { processBatchQueue, QueueTask, calculateOptimalBatchSize, BATCH_DELAYS } from '../services/batch-queue';
import { withRateLimitRetry } from '../services/rate-limiter';
import { useSeedreamCredits } from '../hooks/use-seedream-credits';
import { generateWithSeedream } from '../services/seedream-service';
import { uploadBase64ToR2, uploadUrlToR2 } from '../services/supabase-storage-service';
import { generateWithSeedreamTxt2Img } from '../services/seedream-txt2img-service';
import { generateWithComfyUI, mapAspectRatioToDimensions } from '../services/comfyui-runpod-service';
import { generateMotionVideo } from '../services/kling-motion-control-service';
import { createFreepikProI2VTask, pollFreepikProI2VTask, createKling3Task, pollKling3Task, createKling3OmniTask, createKling3OmniReferenceTask, pollKling3OmniTask, pollKling3OmniReferenceTask } from '../services/freepik-kling-service';
import { generateThumbnail, base64ToBlob, blobToBase64 } from '../services/image-blob-manager';
import { useActivityQueue } from '../hooks/use-activity-queue';
import { logger } from '../services/logger';
import { requestManager } from '../services/request-manager';
import { useAuth } from '../hooks/use-auth';

// Lazy components
import { lazy, Suspense } from 'react';
const SettingsPage = lazy(() => import('../components/settings-page'));
const ModifyImageModal = lazy(() => import('../components/modify-image-modal'));
const CompareModal = lazy(() => import('../components/compare-modal'));
const SaveCollectionModal = lazy(() => import('../components/save-collection-modal'));
const AuthPage = lazy(() => import('../components/auth-page'));
const VideoEditorModal = lazy(() => import('../components/video-editor/video-editor-modal-capcut-style'));

interface HomePageProps {
  currentView: 'main';
  setCurrentView: (view: 'main' | 'saved-payloads') => void;
}

export const HomePage: React.FC<HomePageProps> = () => {
  // State: Settings & Inputs
  const [prompts, setPrompts] = useState<PromptItem[]>([
    { id: crypto.randomUUID(), text: '', referenceImages: [] }
  ]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [kieApiKey, setKieApiKey] = useState('');
  const [freepikApiKey, setFreepikApiKey] = useState('');
  const [runpodApiKey, setRunpodApiKey] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyModalMode, setKeyModalMode] = useState<'gemini' | 'spicy' | 'freepik' | 'runpod'>('gemini');
  const [showSettings, setShowSettings] = useState(false);

  // Crash Recovery State
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  // Video Mode State
  const [appMode, setAppMode] = useState<'image' | 'video'>('image');
  const [videoModel, setVideoModel] = useState<VideoModel>('kling-2.6');
  const [videoScenes, setVideoScenes] = useState<VideoScene[]>([]);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    referenceVideoMode: 'global',
    orientation: 'image',
    resolution: '720p',
    klingProvider: 'freepik',
    klingProDuration: '5',
    klingProAspectRatio: 'widescreen_16_9',
    klingCfgScale: 0.5,
    klingProNegativePrompt: '',
    klingProGenerateAudio: false,
    kling3AspectRatio: '16:9',
    kling3Duration: 5,
    kling3CfgScale: 0.5,
    kling3NegativePrompt: '',
    kling3GenerateAudio: false,
    kling3InputMode: 'image-to-video',
  } as any);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);

  // State: Data
  const [runs, setRuns] = useState<Run[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // State: UI
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [modifyingImage, setModifyingImage] = useState<GeneratedImage | null>(null);
  const [isModifying, setIsModifying] = useState(false);

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // Hooks
  const {
    credits,
    loading: creditsLoading,
    error: creditsError,
    isLow: isLowCredits,
    isCritical: isCriticalCredits,
    refresh: refreshCredits
  } = useSeedreamCredits(kieApiKey || null, settings.spicyMode?.enabled || false);

  const {
    jobs: activityJobs,
    logs: activityLogs,
    addJob,
    updateJob,
    addLog
  } = useActivityQueue();

  const { isAuthenticated, loading: authLoading } = useAuth();

  // Load data from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [loadedRuns, loadedVideos] = await Promise.all([
          getAllRunsFromDB(),
          getAllGeneratedVideosFromDB()
        ]);
        setRuns(loadedRuns);
        setGeneratedVideos(loadedVideos);
        setIsDbLoaded(true);
      } catch (error) {
        logger.error('App', 'Failed to load data from IndexedDB', { error });
        setIsDbLoaded(true);
      }
    };
    loadData();
  }, []);

  // Handle crash recovery on mount
  useEffect(() => {
    const checkRecovery = async () => {
      try {
        const pending = await requestManager.getPendingRequests();
        if (pending.length > 0) {
          setPendingRequests(pending);
          setShowRecoveryModal(true);
        }
      } catch (error) {
        logger.error('App', 'Failed to check for pending requests', { error });
      }
    };
    if (isDbLoaded) {
      checkRecovery();
    }
  }, [isDbLoaded]);

  // Save runs to DB when they change
  useEffect(() => {
    if (isDbLoaded) {
      saveRunToDBWithSync(runs).catch(e => logger.warn('App', 'Failed to sync runs', { error: e }));
    }
  }, [runs, isDbLoaded]);

  // Persist generated videos
  useEffect(() => {
    if (isDbLoaded && generatedVideos.length > 0) {
      const latestVideo = generatedVideos[0];
      saveGeneratedVideoToDB(latestVideo).catch(e => logger.warn('App', 'Failed to persist video', { error: e }));
    }
  }, [generatedVideos, isDbLoaded]);

  // Add this useEffect to handle pending requests state updates
  useEffect(() => {
    const syncPending = async () => {
      if (isDbLoaded) {
        try {
          const pending = await requestManager.getPendingRequests();
          setPendingRequests(pending);
        } catch (e) {
          logger.warn('App', 'Failed to sync pending requests', { error: e });
        }
      }
    };
    syncPending();
  }, [isDbLoaded]);

  const handleGenerate = async () => {
    // Validation: Check API keys
    const needsGeminiKey = settings.model.startsWith('gemini');
    const needsSpicyKey = settings.model.startsWith('se/edream');
    const needsVeoKey = settings.model.startsWith('veo');
    const needsComfyUI = settings.model === 'comfy-ui';
    const needsFreepik = settings.model === 'freepik';

    if (needsGeminiKey && !apiKey) {
      setKeyModalMode('gemini');
      setIsKeyModalOpen(true);
      return;
    }

    if (needsSpicyKey && !kieApiKey) {
      setKeyModalMode('spicy');
      setIsKeyModalOpen(true);
      return;
    }

    if (needsComfyUI && !runpodApiKey) {
      setKeyModalMode('runpod');
      setIsKeyModalOpen(true);
      return;
    }

    if (needsFreepik && !freepikApiKey) {
      setKeyModalMode('freepik');
      setIsKeyModalOpen(true);
      return;
    }

    const activePrompts = prompts.filter(p => p.text.trim());
    if (activePrompts.length === 0) {
      alert('Please enter at least one prompt');
      return;
    }

    // Check credits for seedream
    if (needsSpicyKey && isCriticalCredits) {
      alert('Credits critically low. Please add more credits.');
      return;
    }

    logger.info('App', `Starting generation with ${activePrompts.length} prompts`);
    setIsGenerating(true);

    // Create a job for batch tracking
    const jobId = addJob({
      type: 'image',
      status: 'active',
      prompt: activePrompts[0].text.slice(0, 50)
    });
    addLog({ level: 'info', message: `Starting generation of ${activePrompts.length} images`, jobId });

    try {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const { optimalBatchSize, delayMs } = calculateOptimalBatchSize(activePrompts.length);
      const batchQueue: QueueTask[] = activePrompts.map((promptItem, index) => ({
        id: promptItem.id,
        prompt: promptItem,
        index,
        referenceImages: promptItem.referenceImages
      }));

      let completedCount = 0;
      const newRuns: Run[] = [];

      await processBatchQueue(
        batchQueue,
        async (task) => {
          const { prompt, referenceImages } = task;
          setLoadingStatus(`Generating ${completedCount + 1}/${activePrompts.length}`);

          try {
            let result: { images: string[]; revisedPrompt?: string; };
            
            if (settings.model.startsWith('gemini') && apiKey) {
              result = await withRateLimitRetry(() => 
                generateImage(apiKey, prompt.text, referenceImages, settings)
              );
            } else if (settings.model.startsWith('se/edream') && kieApiKey) {
              result = await withRateLimitRetry(() => 
                generateWithSeedream(kieApiKey, prompt.text, referenceImages, settings)
              );
            } else if (settings.model === 'comfy-ui' && runpodApiKey) {
              const { width, height } = mapAspectRatioToDimensions(settings.aspectRatio);
              result = await withRateLimitRetry(() => 
                generateWithComfyUI(runpodApiKey, prompt.text, width, height, settings.seed)
              );
            } else if (settings.model === 'freepik' && freepikApiKey) {
              result = await withRateLimitRetry(() => 
                generateWithSeedreamTxt2Img(freepikApiKey, prompt.text, referenceImages, settings)
              );
            } else {
              throw new Error('No valid API configuration');
            }

            const thumbnail = result.images[0] ? await generateThumbnail(result.images[0]) : undefined;
            
            const run: Run = {
              id: task.id,
              prompt: prompt.text,
              revisedPrompt: result.revisedPrompt,
              images: result.images,
              thumbnail,
              model: settings.model,
              aspectRatio: settings.aspectRatio,
              createdAt: Date.now(),
              status: 'success',
            };

            newRuns.push(run);
            setRuns(prev => [run, ...prev]);
            completedCount++;
            
            updateJob(jobId, { 
              progress: Math.round((completedCount / activePrompts.length) * 100) 
            });
            addLog({ 
              level: 'info', 
              message: `Generated image ${completedCount}/${activePrompts.length}`,
              jobId 
            });

          } catch (error: any) {
            logger.error('App', `Failed to generate image ${completedCount + 1}`, { error });
            
            const failedRun: Run = {
              id: task.id,
              prompt: prompt.text,
              model: settings.model,
              aspectRatio: settings.aspectRatio,
              createdAt: Date.now(),
              status: 'failed',
              error: error.message,
            };

            newRuns.push(failedRun);
            setRuns(prev => [failedRun, ...prev]);
            completedCount++;
            
            addLog({ 
              level: 'error', 
              message: `Failed: ${prompt.text.slice(0, 30)}... - ${error.message}`,
              jobId 
            });

            // Persist failed request for recovery
            await requestManager.addPendingRequest({
              requestId: task.id,
              type: 'image',
              payload: {
                prompt: prompt.text,
                referenceImages,
                settings,
                model: settings.model
              },
              timestamp: Date.now(),
              retryCount: 0
            });
          }
        },
        optimalBatchSize,
        delayMs
      );

      setLoadingStatus(`🎉 Done! ${completedCount}/${activePrompts.length} images generated`);
      logger.info('App', `Generation complete: ${completedCount}/${activePrompts.length}`);
      
      updateJob(jobId, { 
        status: completedCount === activePrompts.length ? 'completed' : 'failed',
        progress: 100 
      });
      
      addLog({ 
        level: completedCount === activePrompts.length ? 'info' : 'warn', 
        message: `Generation complete: ${completedCount}/${activePrompts.length} success`,
        jobId 
      });

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        logger.error('App', 'Generation failed', { error });
        setLoadingStatus(`❌ Error: ${error.message}`);
        updateJob(jobId, { status: 'failed', error: error.message });
        addLog({ level: 'error', message: error.message, jobId });
      }
    } finally {
      setIsGenerating(false);
      refreshCredits();
      abortControllerRef.current = null;
      setTimeout(() => setLoadingStatus(''), 3000);
    }
  };

  const handleDeleteRun = async (runId: string) => {
    await deleteRunFromDB(runId);
    setRuns(prev => prev.filter(r => r.id !== runId));
  };

  const handleClearAll = async () => {
    if (confirm('Clear all generations? This cannot be undone.')) {
      for (const run of runs) {
        await deleteRunFromDB(run.id);
      }
      setRuns([]);
      addLog({ level: 'info', message: 'Cleared all generations' });
    }
  };

  const handleBatchDelete = async (runIds: string[]) => {
    for (const id of runIds) {
      await deleteRunFromDB(id);
    }
    setRuns(prev => prev.filter(r => !runIds.includes(r.id)));
  };

  const handleBatchSave = async (runIds: string[]) => {
    const runsToSave = runs.filter(r => runIds.includes(r.id));
    setUploadProgress({ current: 0, total: runsToSave.length });
    
    try {
      for (let i = 0; i < runsToSave.length; i++) {
        const run = runsToSave[i];
        setUploadProgress({ current: i + 1, total: runsToSave.length });
        
        const imageBuffers = await Promise.all(run.images.map(async (img) => {
          if (img.startsWith('data:')) {
            const base64 = img.split(',')[1];
            return base64ToBlob(base64);
          }
          const response = await fetch(img);
          return response.blob();
        }));

        const saved = await saveVideoCollection(run.prompt, run.model, imageBuffers, kieApiKey);
        await deleteRunFromDB(run.id);
      }
      
      setRuns(prev => prev.filter(r => !runIds.includes(r.id)));
      setUploadProgress(null);
      addLog({ level: 'info', message: `Saved ${runsToSave.length} videos to collection` });
    } catch (error: any) {
      logger.error('App', 'Batch save failed', { error });
      setUploadProgress(null);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-gray-200 font-sans bg-gray-950 transition-colors duration-300 relative">
      <AnimatedBackground opacity={0.35} particleCount={15} speed={0.8} showGrid={true} />
      
      {showSettings && (
        <Suspense fallback={<SuspenseFallback message="Loading settings..." minHeight="100vh" />}>
          <SettingsPage
            onClose={() => setShowSettings(false)}
            apiKey={apiKey}
            setApiKey={setApiKey}
            kieApiKey={kieApiKey}
            setKieApiKey={setKieApiKey}
            freepikApiKey={freepikApiKey}
            setFreepikApiKey={setFreepikApiKey}
            credits={credits}
            creditsLoading={creditsLoading}
            creditsError={creditsError}
            isLowCredits={isLowCredits}
            isCriticalCredits={isCriticalCredits}
            refreshCredits={refreshCredits}
          />
        </Suspense>
      )}

      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        mode={keyModalMode}
        kieApiKey={kieApiKey}
        setKieApiKey={setKieApiKey}
        freepikApiKey={freepikApiKey}
        setFreepikApiKey={setFreepikApiKey}
        runpodApiKey={runpodApiKey}
        setRunpodApiKey={setRunpodApiKey}
      />

      {modifyingImage && (
        <Suspense fallback={<ModalSuspenseFallback />}>
          <ModifyImageModal
            isOpen={!!modifyingImage}
            image={modifyingImage}
            apiKey={apiKey}
            onClose={() => {
              setModifyingImage(null);
              setIsModifying(false);
            }}
            onRegenerate={async (newImages) => {
              if (!modifyingImage) return;
              
              const run: Run = {
                ...modifyingImage,
                images: newImages,
                revisedPrompt: modifyingImage.revisedPrompt,
                createdAt: Date.now(),
                status: 'success'
              };
              
              setRuns(prev => [run, ...prev]);
              setModifyingImage(null);
              setIsModifying(false);
            }}
          />
        </Suspense>
      )}

      <RecoveryModal
        isOpen={showRecoveryModal}
        pendingRequests={pendingRequests}
        onClose={() => setShowRecoveryModal(false)}
        onRecoveryComplete={() => {
          setShowRecoveryModal(false);
          setPendingRequests([]);
        }}
      />

      <LeftPanel
        prompts={prompts}
        setPrompts={setPrompts}
        settings={settings}
        setSettings={setSettings}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
        loadingStatus={loadingStatus}
        credits={credits}
        creditsLoading={creditsLoading}
        isLowCredits={isLowCredits}
        isCriticalCredits={isCriticalCredits}
        kieApiKey={kieApiKey}
        onOpenSettings={() => setShowSettings(true)}
        appMode={appMode}
        setAppMode={setAppMode}
        videoModel={videoModel}
        setVideoModel={setVideoModel}
        videoScenes={videoScenes}
        setVideoScenes={setVideoScenes}
        videoSettings={videoSettings}
        setVideoSettings={setVideoSettings}
        generatedVideos={generatedVideos}
        setGeneratedVideos={setGeneratedVideos}
        isDbLoaded={isDbLoaded}
        runs={runs}
        setRuns={setRuns}
        onDeleteRun={handleDeleteRun}
        onClearAll={handleClearAll}
        onOpenPayloads={() => {}}
        onOpenHistory={() => {}}
      />

      <RightPanel
        runs={runs}
        onDeleteRun={handleDeleteRun}
        modifyingImage={modifyingImage}
        setModifyingImage={setModifyingImage}
        isModifying={isModifying}
        setIsModifying={setIsModifying}
        settings={settings}
        onBatchDelete={handleBatchDelete}
        onBatchSave={handleBatchSave}
        generatedVideos={generatedVideos}
        onDeleteVideo={(id) => {
          deleteGeneratedVideoFromDB(id);
          setGeneratedVideos(prev => prev.filter(v => v.id !== id));
        }}
        onClearVideos={() => {
          setGeneratedVideos([]);
        }}
      />

      {uploadProgress && (
        <div className="fixed bottom-4 right-4 bg-gray-800 px-4 py-2 rounded-lg shadow-lg z-50">
          Uploading {uploadProgress.current}/{uploadProgress.total}
        </div>
      )}

      {/* Video Editor Modal */}
      {false && <VideoEditorModal />}
    </div>
  );
};

export default HomePage;
