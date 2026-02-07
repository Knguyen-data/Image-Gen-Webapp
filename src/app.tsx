import React, { useState, useEffect, useRef } from 'react';
import LeftPanel from './components/left-panel';
import RightPanel from './components/right-panel';
import ApiKeyModal from './components/api-key-modal';
import ModifyImageModal from './components/modify-image-modal';
import { AppSettings, Run, GeneratedImage, PromptItem, ReferenceImage, AppMode, VideoScene, VideoSettings, GeneratedVideo, AnimateSettings, AnimateJob, VideoModel } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { generateImage, modifyImage } from './services/gemini-service';
import { getAllRunsFromDB, saveRunToDB, deleteRunFromDB } from './services/db';
import { getAllGeneratedVideosFromDB, saveGeneratedVideoToDB, deleteGeneratedVideoFromDB } from './services/indexeddb-video-storage';
import { processBatchQueue, QueueTask, calculateOptimalBatchSize, BATCH_DELAYS } from './services/batch-queue';
import { withRateLimitRetry } from './services/rate-limiter';
import { useSeedreamCredits } from './hooks/use-seedream-credits';
import { generateWithSeedream, mapAspectRatio } from './services/seedream-service';
import { generateWithSeedreamTxt2Img } from './services/seedream-txt2img-service';
import { generateMotionVideo } from './services/kling-motion-control-service';
import { generateAnimateVideo } from './services/wan-animate-service';
import { logger } from './services/logger';
import { useActivityQueue } from './hooks/use-activity-queue';
import ActivityPanel from './components/activity-panel';

const App: React.FC = () => {
  // State: Settings & Inputs
  const [prompts, setPrompts] = useState<PromptItem[]>([
    { id: crypto.randomUUID(), text: '', referenceImages: [] }
  ]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [kieApiKey, setKieApiKey] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyModalMode, setKeyModalMode] = useState<'gemini' | 'spicy'>('gemini');

  // Video Mode State
  const [appMode, setAppMode] = useState<AppMode>('image');
  const [videoModel, setVideoModel] = useState<VideoModel>('kling-2.6');
  const [videoScenes, setVideoScenes] = useState<VideoScene[]>([]);
  const [videoSettings, setVideoSettings] = useState<VideoSettings>({
    referenceVideoMode: 'global',
    orientation: 'image',
    resolution: '720p'
  });
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);

  // Animate Mode State
  const [animateSettings, setAnimateSettings] = useState<AnimateSettings>({
    subMode: 'move',
    resolution: '480p',
  });
  const [animateCharacterImage, setAnimateCharacterImage] = useState<ReferenceImage | null>(null);
  const [animateVideoFile, setAnimateVideoFile] = useState<File | null>(null);
  const [animateVideoPreviewUrl, setAnimateVideoPreviewUrl] = useState<string | null>(null);
  const [animateJobs, setAnimateJobs] = useState<AnimateJob[]>([]);

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

  // Seedream Credits Hook - use kieApiKey state instead of settings
  const {
    credits,
    loading: creditsLoading,
    error: creditsError,
    isLow: isLowCredits,
    isCritical: isCriticalCredits,
    refresh: refreshCredits
  } = useSeedreamCredits(
    kieApiKey || null,
    settings.spicyMode?.enabled || false
  );

  // Activity Queue Hook for unified progress tracking
  const {
    jobs: activityJobs,
    logs: activityLogs,
    addJob,
    updateJob,
    addLog,
    clearCompletedJobs
  } = useActivityQueue();

  // Initial Load
  useEffect(() => {
    const loadData = async () => {
      logger.info('App', 'Loading application data');
      try {
        // Load API Keys
        const savedGeminiKey = localStorage.getItem('raw_studio_api_key');
        if (savedGeminiKey) {
          setApiKey(savedGeminiKey);
          logger.debug('App', 'Loaded Gemini API key from storage');
        }

        const savedKieKey = localStorage.getItem('raw_studio_kie_api_key');
        if (savedKieKey) {
          setKieApiKey(savedKieKey);
          logger.debug('App', 'Loaded Kie.ai API key from storage');
        }

        // Prompt for Gemini key if missing
        if (!savedGeminiKey) {
          logger.info('App', 'No Gemini API key found, showing modal');
          setKeyModalMode('gemini');
          setIsKeyModalOpen(true);
        }

        // Load Settings (exclude globalReferenceImages to avoid localStorage quota issues)
        const savedSettings = localStorage.getItem('raw_studio_settings');
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            // Exclude globalReferenceImages from loaded settings to prevent quota issues
            const { globalReferenceImages, ...settingsWithoutImages } = parsed;
            setSettings(prev => ({
              ...prev,
              ...settingsWithoutImages
            }));
            logger.debug('App', 'Loaded settings from storage');
          } catch (e) {
            logger.warn('App', 'Failed to parse settings, using defaults', e);
          }
        }

        const dbRuns = await getAllRunsFromDB();
        setRuns(dbRuns);
        logger.info('App', `Loaded ${dbRuns.length} runs from database`);

        // Load generated videos from IndexedDB
        const savedVideos = await getAllGeneratedVideosFromDB();
        setGeneratedVideos(savedVideos);
        logger.info('App', `Loaded ${savedVideos.length} generated videos from database`);
      } catch (e) {
        logger.error('App', 'Failed to load data', e);
      } finally {
        setIsDbLoaded(true);
      }
    };
    loadData();
  }, []);

  // Save Settings to LocalStorage (exclude globalReferenceImages to avoid quota exceeded)
  useEffect(() => {
    const { globalReferenceImages, ...settingsToSave } = settings;
    try {
      localStorage.setItem('raw_studio_settings', JSON.stringify(settingsToSave));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }, [settings]);

  // --- RETRY LOGIC ---
  const handleRetry = async (image: GeneratedImage) => {
    if (isGenerating) return;

    const model = image.generatedBy || 'gemini'; // Default to gemini for legacy

    logger.info('App', 'Retrying generation', { imageId: image.id, model });
    setIsGenerating(true);
    setLoadingStatus(`Retrying with ${model}...`);
    abortControllerRef.current = new AbortController();

    try {
      let result: GeneratedImage;

      if (model === 'gemini') {
        if (!apiKey) {
          setKeyModalMode('gemini');
          setIsKeyModalOpen(true);
          return;
        }
        const genResult = await generateImage({
          prompt: image.promptUsed,
          referenceImages: [],
          settings: image.settingsSnapshot,
          apiKey: apiKey,
          signal: abortControllerRef.current.signal
        });
        result = { ...genResult, generatedBy: 'gemini' };

      } else if (model === 'seedream-txt2img') {
        if (!kieApiKey) {
          setKeyModalMode('spicy');
          setIsKeyModalOpen(true);
          return;
        }
        const genResult = await generateWithSeedreamTxt2Img(
          kieApiKey,
          image.promptUsed,
          {
            aspectRatio: mapAspectRatio(image.settingsSnapshot.aspectRatio),
            quality: image.settingsSnapshot.spicyMode?.quality || 'basic'
          },
          (stage) => setLoadingStatus(`🌶️ Retry: ${stage}`)
        );
        result = {
          id: crypto.randomUUID(),
          base64: genResult.base64,
          mimeType: genResult.mimeType,
          createdAt: Date.now(),
          promptUsed: image.promptUsed,
          settingsSnapshot: image.settingsSnapshot,
          generatedBy: 'seedream-txt2img'
        };

      } else { // seedream-edit
        if (!kieApiKey) {
          setKeyModalMode('spicy');
          setIsKeyModalOpen(true);
          return;
        }
        // For edit mode retry, we need the source image
        // Use the image itself as source (re-edit)
        const genResult = await generateWithSeedream(
          kieApiKey,
          image.promptUsed,
          image.base64,
          image.mimeType,
          {
            aspectRatio: mapAspectRatio(image.settingsSnapshot.aspectRatio),
            quality: image.settingsSnapshot.spicyMode?.quality || 'basic'
          },
          (stage) => setLoadingStatus(`🌶️ Retry: ${stage}`)
        );
        result = {
          id: crypto.randomUUID(),
          base64: genResult.base64,
          mimeType: genResult.mimeType,
          createdAt: Date.now(),
          promptUsed: image.promptUsed,
          settingsSnapshot: image.settingsSnapshot,
          generatedBy: 'seedream-edit'
        };
      }

      // Find the original run containing this image
      const originalRun = runs.find(run =>
        run.images.some(img => img.id === image.id)
      );

      if (originalRun) {
        // Append to existing run
        const updatedRun: Run = {
          ...originalRun,
          images: [...originalRun.images, result]
        };

        await saveRunToDB(updatedRun);
        setRuns(prev => prev.map(r =>
          r.id === originalRun.id ? updatedRun : r
        ));
      } else {
        // Fallback: create new run if original not found (legacy images)
        const newRun: Run = {
          id: crypto.randomUUID(),
          name: `Retry: ${image.id.slice(0, 4)}`,
          createdAt: Date.now(),
          promptRaw: image.promptUsed,
          styleHintUsed: image.settingsSnapshot.appendStyleHint,
          finalPrompt: image.promptUsed,
          settingsSnapshot: image.settingsSnapshot,
          images: [result]
        };

        await saveRunToDB(newRun);
        setRuns(prev => [newRun, ...prev]);
      }
      setLoadingStatus('Retry Successful!');

      if (model !== 'gemini') refreshCredits();

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        logger.error('App', 'Retry failed', err);
        alert(`Retry failed: ${err.message}`);
        setLoadingStatus('Failed');
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => setLoadingStatus(''), 2000);
      abortControllerRef.current = null;
    }
  };

  // --- MODIFY LOGIC ---
  const handleModifyImage = async (
    prompt: string,
    additionalRefs: ReferenceImage[],
    model: 'gemini' | 'seedream'
  ) => {
    if (!modifyingImage) return;

    logger.info('App', 'Modifying image', { sourceId: modifyingImage.id, model });
    setIsModifying(true);
    setLoadingStatus(`Modifying with ${model === 'gemini' ? 'Gemini' : 'Seedream'}...`);

    try {
      let result: GeneratedImage;

      if (model === 'seedream') {
        if (!kieApiKey) {
          setKeyModalMode('spicy');
          setIsKeyModalOpen(true);
          return;
        }
        const genResult = await generateWithSeedream(
          kieApiKey,
          prompt,
          modifyingImage.base64,
          modifyingImage.mimeType,
          {
            aspectRatio: mapAspectRatio(modifyingImage.settingsSnapshot.aspectRatio),
            quality: modifyingImage.settingsSnapshot.spicyMode?.quality || 'basic'
          },
          (stage) => setLoadingStatus(`🌶️ ${stage}`)
        );
        result = {
          id: crypto.randomUUID(),
          base64: genResult.base64,
          mimeType: genResult.mimeType,
          createdAt: Date.now(),
          promptUsed: prompt,
          settingsSnapshot: modifyingImage.settingsSnapshot,
          generatedBy: 'seedream-edit'
        };
      } else {
        if (!apiKey) {
          setKeyModalMode('gemini');
          setIsKeyModalOpen(true);
          return;
        }
        result = await modifyImage({
          prompt,
          sourceImage: {
            id: modifyingImage.id,
            base64: modifyingImage.base64,
            mimeType: modifyingImage.mimeType
          },
          referenceImages: additionalRefs,
          settings: modifyingImage.settingsSnapshot,
          apiKey: apiKey
        });
        result.generatedBy = 'gemini';
      }

      // Find the run that contains the source image
      const sourceRun = runs.find(r => r.images.some(i => i.id === modifyingImage.id));

      if (sourceRun) {
        // Append modified image to the same run
        const updatedRun = {
          ...sourceRun,
          images: [...sourceRun.images, result]
        };
        await saveRunToDB(updatedRun);
        setRuns(prev => prev.map(r => r.id === sourceRun.id ? updatedRun : r));
      } else {
        // Create new run if source run not found
        const newRun: Run = {
          id: crypto.randomUUID(),
          name: `Modified: ${new Date().toLocaleTimeString()}`,
          createdAt: Date.now(),
          promptRaw: prompt,
          styleHintUsed: false,
          finalPrompt: prompt,
          settingsSnapshot: modifyingImage.settingsSnapshot,
          images: [result]
        };
        await saveRunToDB(newRun);
        setRuns(prev => [newRun, ...prev]);
      }

      logger.info('App', 'Modification successful');
      setLoadingStatus('Modification successful!');
      setModifyingImage(null);

    } catch (err: any) {
      logger.error('App', 'Modification failed', err);
      alert(`Modification failed: ${err.message}`);
      setLoadingStatus('Modification failed');
    } finally {
      setIsModifying(false);
      setTimeout(() => setLoadingStatus(''), 2000);
    }
  };

  // --- BATCH QUEUE LOGIC ---
  const handleGenerate = async () => {
    const isSpicyMode = settings.spicyMode?.enabled;
    const effectiveApiKey = isSpicyMode ? kieApiKey : apiKey;

    logger.info('App', `Starting generation in ${isSpicyMode ? 'Spicy' : 'Gemini'} mode`);

    if (!effectiveApiKey) {
      if (isSpicyMode) {
        logger.warn('App', 'No Kie.ai API key, showing modal');
        setKeyModalMode('spicy');
        setIsKeyModalOpen(true);
      } else {
        logger.warn('App', 'No Gemini API key, showing modal');
        setKeyModalMode('gemini');
        setIsKeyModalOpen(true);
      }
      return;
    }

    const validItems = prompts.filter(p => p.text.trim().length > 0);
    if (validItems.length === 0) {
      logger.warn('App', 'No valid prompts to generate');
      alert("Please enter at least one prompt.");
      return;
    }

    // Spicy Edit Mode requires at least one reference image
    const globalRefs = settings.globalReferenceImages || [];
    const isSpicyEditMode = isSpicyMode && settings.spicyMode?.subMode === 'edit';
    if (isSpicyEditMode) {
      for (const item of validItems) {
        if (item.referenceImages.length + globalRefs.length === 0) {
          logger.warn('App', 'Spicy Edit Mode requires reference image', { prompt: item.text.slice(0, 30) });
          alert(`Spicy Edit Mode requires at least one reference image per prompt. Add an image to "${item.text.slice(0, 30)}..." or switch to Generate mode.`);
          return;
        }
      }
    }

    for (const item of validItems) {
      if (item.referenceImages.length + globalRefs.length > 7) {
        logger.warn('App', 'Too many reference images', { count: item.referenceImages.length + globalRefs.length });
        alert(`Error: Prompt "${item.text.slice(0, 20)}..." exceeds 7 reference images limit.`);
        return;
      }
    }

    logger.info('App', `Generating ${validItems.length} prompts`, {
      mode: isSpicyMode ? 'spicy' : 'gemini',
      outputCount: settings.outputCount,
      globalRefs: globalRefs.length
    });

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    // Add job to activity queue
    const jobId = addJob({
      type: 'image',
      status: 'pending',
      prompt: validItems[0].text.slice(0, 50) + (validItems.length > 1 ? ` (+${validItems.length - 1} more)` : '')
    });

    const newRunId = crypto.randomUUID();
    const countPerPrompt = settings.outputCount || 1;

    // Construct summary
    const summaryPrompt = validItems.map(p => p.text).join(' || ');
    const hasRefs = validItems.some(p => p.referenceImages.length > 0) || globalRefs.length > 0;
    const modeLabel = isSpicyMode ? '[🌶️]' : '';
    const finalPromptSummary = validItems.length > 1
      ? `${modeLabel}${validItems.length} Prompts. First: ${validItems[0].text.slice(0, 50)}...`
      : `${modeLabel}${validItems[0].text}` + (settings.appendStyleHint ? ` (+Style)` : '') + (hasRefs ? ` (+Images)` : '');

    const newRun: Run = {
      id: newRunId,
      name: `Run #${runs.length + 1}${isSpicyMode ? ' 🌶️' : ''}`,
      createdAt: Date.now(),
      promptRaw: summaryPrompt,
      styleHintUsed: settings.appendStyleHint,
      finalPrompt: finalPromptSummary,
      settingsSnapshot: { ...settings },
      images: []
    };

    setRuns(prev => [newRun, ...prev]);
    await saveRunToDB(newRun);

    // Build Task Queue
    const taskQueue: QueueTask[] = [];
    validItems.forEach(item => {
      let finalPrompt = item.text.trim();
      if (settings.appendStyleHint && settings.styleHintRaw.trim()) {
        finalPrompt += `\n\nSTYLE HINT:\n${settings.styleHintRaw.trim()}`;
      }
      const allRefs = [...globalRefs, ...item.referenceImages];

      for (let i = 0; i < countPerPrompt; i++) {
        taskQueue.push({
          id: crypto.randomUUID(),
          prompt: finalPrompt,
          refs: allRefs,
          settings: settings
        });
      }
    });

    // Create placeholder images immediately for instant visual feedback
    const placeholderImages: GeneratedImage[] = taskQueue.map(task => ({
      id: task.id,
      base64: '',
      mimeType: 'image/png',
      createdAt: Date.now(),
      promptUsed: task.prompt,
      settingsSnapshot: task.settings,
      generatedBy: isSpicyMode ? (settings.spicyMode?.subMode === 'generate' ? 'seedream-txt2img' : 'seedream-edit') : 'gemini',
      status: 'generating' as const
    }));

    // Add placeholders to the run immediately
    newRun.images = [...placeholderImages];
    setRuns(prev => prev.map(r => r.id === newRunId ? { ...r, images: [...placeholderImages] } : r));

    const provider = isSpicyMode ? 'seedream' : 'gemini';
    const batchSize = calculateOptimalBatchSize(taskQueue.length, provider);
    const batchDelayMs = isSpicyMode ? BATCH_DELAYS.seedream : BATCH_DELAYS.gemini;
    setLoadingStatus(`Queued ${taskQueue.length} images${isSpicyMode ? ' (Spicy)' : ''} (batches of ${batchSize})...`);

    // Update job to active status
    updateJob(jobId, { status: 'active' });
    addLog({ level: 'info', message: `Processing ${taskQueue.length} images in batches of ${batchSize}`, jobId });

    // Process with batch queue
    try {
      await processBatchQueue(
        taskQueue,
        async (task) => {
          if (isSpicyMode) {
            const subMode = task.settings.spicyMode?.subMode || 'edit';

            if (subMode === 'generate') {
              // Use Txt2Img service (no image required)
              const result = await generateWithSeedreamTxt2Img(
                effectiveApiKey,
                task.prompt,
                {
                  aspectRatio: mapAspectRatio(task.settings.aspectRatio),
                  quality: task.settings.spicyMode?.quality || 'basic'
                },
                (stage, detail) => {
                  setLoadingStatus(`🌶️ Generate: ${detail || ''}`);
                }
              );
              // Convert to GeneratedImage format
              const generatedImage: GeneratedImage = {
                id: crypto.randomUUID(),
                base64: result.base64,
                mimeType: result.mimeType,
                createdAt: Date.now(),
                promptUsed: task.prompt,
                settingsSnapshot: task.settings,
                generatedBy: 'seedream-txt2img'
              };
              return generatedImage;
            } else {
              // Use Edit service (requires image)
              if (task.refs.length === 0) {
                throw new Error('Spicy Edit Mode requires at least one reference image');
              }
              const sourceImage = task.refs[0];
              const result = await generateWithSeedream(
                effectiveApiKey,
                task.prompt,
                sourceImage.base64,
                sourceImage.mimeType,
                {
                  aspectRatio: mapAspectRatio(task.settings.aspectRatio),
                  quality: task.settings.spicyMode?.quality || 'basic'
                },
                (stage, detail) => {
                  setLoadingStatus(`🌶️ Edit: ${detail || ''}`);
                }
              );
              // Convert to GeneratedImage format
              const generatedImage: GeneratedImage = {
                id: crypto.randomUUID(),
                base64: result.base64,
                mimeType: result.mimeType,
                createdAt: Date.now(),
                promptUsed: task.prompt,
                settingsSnapshot: task.settings,
                generatedBy: 'seedream-edit'
              };
              return generatedImage;
            }
          } else {
            // Use Gemini service
            const geminiResult = await withRateLimitRetry(
              () => generateImage({
                prompt: task.prompt,
                referenceImages: task.refs,
                settings: task.settings,
                apiKey: effectiveApiKey,
                signal: abortControllerRef.current?.signal
              }),
              { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 30000 }
            );
            return { ...geminiResult, generatedBy: 'gemini' };
          }
        },
        {
          batchSize,
          batchDelayMs,
          signal: abortControllerRef.current.signal,
          onProgress: (completed, total, batchNum, totalBatches) => {
            const prefix = isSpicyMode ? '🌶️ ' : '';
            setLoadingStatus(`${prefix}Batch ${batchNum}/${totalBatches}: ${completed}/${total} images`);
          },
          onResult: (result, task) => {
            // Replace placeholder with real image
            setRuns(prev => prev.map(r => {
              if (r.id === newRunId) {
                const updatedImages = r.images.map(img =>
                  img.id === task.id
                    ? { ...result, id: task.id, status: 'success' as const }
                    : img
                );
                const updated = { ...r, images: updatedImages };
                // Save to DB incrementally (fire-and-forget)
                saveRunToDB(updated).catch(err =>
                  console.error('Failed to save run to DB:', err)
                );
                return updated;
              }
              return r;
            }));
          },
          onError: (error, task) => {
            logger.error('App', `Task failed in ${isSpicyMode ? 'Spicy' : 'Gemini'} mode`, {
              promptPreview: task.prompt.slice(0, 50),
              error: error.message,
              stack: error.stack?.split('\n').slice(0, 3)
            });
            // Show error flash for 3 seconds, then remove
            setRuns(prev => prev.map(r => {
              if (r.id === newRunId) {
                return {
                  ...r,
                  images: r.images.map(img =>
                    img.id === task.id
                      ? { ...img, status: 'failed' as const, error: error.message }
                      : img
                  )
                };
              }
              return r;
            }));
            // Remove after 3 seconds
            setTimeout(() => {
              setRuns(prev => prev.map(r => {
                if (r.id === newRunId) {
                  return {
                    ...r,
                    images: r.images.filter(img => img.id !== task.id)
                  };
                }
                return r;
              }));
            }, 3000);
          }
        }
      );
      logger.info('App', `Generation complete`, { mode: isSpicyMode ? 'spicy' : 'gemini' });
      setLoadingStatus(isSpicyMode ? "🌶️ Done!" : "Done!");
      updateJob(jobId, { status: 'completed' });
      addLog({ level: 'info', message: `Generation complete`, jobId });

      // Refresh credits after batch completes (Spicy Mode only)
      if (isSpicyMode) {
        refreshCredits();
      }

    } catch (err: any) {
      if (err.message === 'Aborted') {
        logger.info('App', 'Generation cancelled by user');
        setLoadingStatus("Cancelled");
        updateJob(jobId, { status: 'failed', error: 'Cancelled by user' });
        addLog({ level: 'warn', message: 'Generation cancelled', jobId });
      } else {
        logger.error('App', 'Batch generation error', err);
        setLoadingStatus("Error during batch generation");
        updateJob(jobId, { status: 'failed', error: err.message });
        addLog({ level: 'error', message: `Error: ${err.message}`, jobId });
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
      setTimeout(() => setLoadingStatus(''), 2000);
    }
  };



  // --- DELETE LOGIC ---
  const handleDeleteRun = async (id: string) => {
    if (confirm("Delete this entire run history?")) {
      await deleteRunFromDB(id);
      setRuns(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleDeleteImage = async (runId: string, imgId: string) => {
    const targetRun = runs.find(r => r.id === runId);
    if (!targetRun) return;
    const newImages = targetRun.images.filter(img => img.id !== imgId);

    if (newImages.length === 0) {
      await deleteRunFromDB(runId);
      setRuns(prev => prev.filter(r => r.id !== runId));
    } else {
      const updatedRun = { ...targetRun, images: newImages };
      await saveRunToDB(updatedRun);
      setRuns(prev => prev.map(r => r.id === runId ? updatedRun : r));
    }
  };

  // --- VIDEO HANDLERS ---
  const handleDeleteVideo = async (videoId: string) => {
    setGeneratedVideos(prev => prev.filter(v => v.id !== videoId));
    // Also delete from IndexedDB
    try {
      await deleteGeneratedVideoFromDB(videoId);
      logger.debug('App', 'Deleted video from IndexedDB', { videoId });
    } catch (e) {
      logger.warn('App', 'Failed to delete video from IndexedDB', e);
    }
  };

  const handleRetryVideo = async (video: GeneratedVideo) => {
    // Find the scene for this video
    const scene = videoScenes.find(s => s.id === video.sceneId);
    if (!scene) {
      alert('Original scene not found');
      return;
    }

    // Re-generate video for this single scene
    if (!kieApiKey) {
      setKeyModalMode('spicy');
      setIsKeyModalOpen(true);
      return;
    }

    logger.info('App', 'Retrying video generation', { sceneId: scene.id });
    setIsGenerating(true);
    setLoadingStatus('Retrying video generation...');

    try {
      const result = await generateMotionVideo(
        kieApiKey,
        scene,
        videoSettings.globalReferenceVideo,
        videoSettings,
        (stage, detail) => setLoadingStatus(`🎬 Retry: ${detail || stage}`)
      );

      if (result.status === 'success') {
        // Replace the failed video with new one
        setGeneratedVideos(prev => prev.map(v => v.id === video.id ? result : v));
        setLoadingStatus('Retry successful!');
        // Save to IndexedDB
        saveGeneratedVideoToDB(result).catch(e =>
          logger.warn('App', 'Failed to persist retried video to IndexedDB', e)
        );
      } else {
        // Keep the failed video, just update error message
        setGeneratedVideos(prev => prev.map(v => v.id === video.id ? result : v));
        setLoadingStatus('Retry failed');
      }

      refreshCredits();
    } catch (error: any) {
      logger.error('App', 'Video retry failed', { error });
      alert(`Retry failed: ${error.message}`);
      setLoadingStatus('Failed');
    } finally {
      setIsGenerating(false);
      setTimeout(() => setLoadingStatus(''), 2000);
    }
  };

  const handleVideoGenerate = async () => {
    if (!kieApiKey) {
      logger.warn('App', 'No Kie.ai API key for video generation');
      setKeyModalMode('spicy');
      setIsKeyModalOpen(true);
      return;
    }

    // Wan 2.2 models use animate flow
    if (videoModel === 'wan-2.2-move' || videoModel === 'wan-2.2-replace') {
      if (!animateCharacterImage || !animateVideoFile) {
        alert('Please upload both a character image and a reference video.');
        return;
      }

      const wanSubMode = videoModel === 'wan-2.2-move' ? 'move' : 'replace';
      logger.info('App', `Starting animate generation (${wanSubMode})`);
      setIsGenerating(true);

      const jobId = `animate-${Date.now()}`;
      const newJob: AnimateJob = {
        id: jobId,
        characterImage: animateCharacterImage,
        referenceVideoFile: animateVideoFile,
        referenceVideoPreviewUrl: animateVideoPreviewUrl || '',
        subMode: wanSubMode,
        resolution: animateSettings.resolution,
        status: 'generating',
        createdAt: Date.now(),
      };
      setAnimateJobs(prev => [newJob, ...prev]);

      const activityJobId = addJob({
        type: 'video',
        status: 'active',
        prompt: `Animate ${wanSubMode} (${animateSettings.resolution})`,
      });
      addLog({ level: 'info', message: `Starting animate ${wanSubMode}`, jobId: activityJobId });

      try {
        const result = await generateAnimateVideo(
          kieApiKey,
          animateCharacterImage.base64,
          animateCharacterImage.mimeType,
          animateVideoFile,
          wanSubMode,
          animateSettings.resolution,
          (stage, detail) => setLoadingStatus(`🎭 ${detail || stage}`)
        );

        if (result.success && result.videoUrl) {
          setAnimateJobs(prev => prev.map(j =>
            j.id === jobId ? { ...j, status: 'success' as const, resultVideoUrl: result.videoUrl } : j
          ));
          updateJob(activityJobId, { status: 'completed' });
          addLog({ level: 'info', message: 'Animate video generated', jobId: activityJobId });
          setLoadingStatus('🎭 Animation complete!');
        } else {
          setAnimateJobs(prev => prev.map(j =>
            j.id === jobId ? { ...j, status: 'failed' as const, error: result.error } : j
          ));
          updateJob(activityJobId, { status: 'failed', error: result.error });
          addLog({ level: 'error', message: `Animate failed: ${result.error}`, jobId: activityJobId });
          setLoadingStatus('🎭 Animation failed');
        }
      } catch (error: any) {
        logger.error('App', 'Animate generation error', { error });
        setAnimateJobs(prev => prev.map(j =>
          j.id === jobId ? { ...j, status: 'failed' as const, error: error.message } : j
        ));
        updateJob(activityJobId, { status: 'failed', error: error.message });
        setLoadingStatus('Failed');
      } finally {
        setIsGenerating(false);
        refreshCredits();
        setTimeout(() => setLoadingStatus(''), 3000);
      }
      return;
    }

    // Kling 2.6 flow (original video generation)
    if (videoScenes.length === 0) {
      alert('Add at least one scene to generate videos');
      return;
    }

    // Validate that all scenes have prompts
    const scenesWithoutPrompts = videoScenes.filter(s => !s.prompt.trim());
    if (scenesWithoutPrompts.length > 0) {
      alert('All scenes must have motion prompts');
      return;
    }

    logger.info('App', `Starting video generation for ${videoScenes.length} scene(s)`);
    setIsGenerating(true);

    // Add job to activity queue
    const jobId = addJob({
      type: 'video',
      status: 'active',
      prompt: videoScenes[0].prompt.slice(0, 50) + (videoScenes.length > 1 ? ` (+${videoScenes.length - 1} more)` : '')
    });
    addLog({ level: 'info', message: `Starting ${videoScenes.length} video${videoScenes.length > 1 ? 's' : ''}`, jobId });

    const results: GeneratedVideo[] = [];

    for (let i = 0; i < videoScenes.length; i++) {
      const scene = videoScenes[i];
      setLoadingStatus(`🎬 Generating video ${i + 1}/${videoScenes.length}...`);

      try {
        const video = await generateMotionVideo(
          kieApiKey,
          scene,
          videoSettings.globalReferenceVideo,
          videoSettings,
          (stage, detail) => setLoadingStatus(`🎬 Scene ${i + 1}: ${detail || stage}`)
        );
        results.push(video);

        // Add to gallery immediately
        setGeneratedVideos(prev => [...prev, video]);

        if (video.status === 'success') {
          logger.info('App', `Scene ${i + 1} completed successfully`);
          // Save successful video to IndexedDB for persistence
          saveGeneratedVideoToDB(video).catch(e =>
            logger.warn('App', 'Failed to persist video to IndexedDB', e)
          );
        } else {
          logger.warn('App', `Scene ${i + 1} failed`, { error: video.error });
        }
      } catch (error: any) {
        logger.error('App', `Scene ${i + 1} generation error`, { error });
        // Create failed video entry
        const failedVideo: GeneratedVideo = {
          id: `video-${Date.now()}-${i}`,
          sceneId: scene.id,
          url: '',
          duration: 0,
          prompt: scene.prompt,
          createdAt: Date.now(),
          status: 'failed',
          error: error.message
        };
        results.push(failedVideo);
        setGeneratedVideos(prev => [...prev, failedVideo]);
      }
    }

    const successCount = results.filter(v => v.status === 'success').length;
    const failCount = results.filter(v => v.status === 'failed').length;

    setLoadingStatus(
      successCount > 0
        ? `🎬 Done! ${successCount} success, ${failCount} failed`
        : '🎬 All videos failed'
    );

    logger.info('App', 'Video generation complete', { success: successCount, failed: failCount });

    // Update job status
    if (failCount === videoScenes.length) {
      updateJob(jobId, { status: 'failed', error: 'All videos failed' });
      addLog({ level: 'error', message: 'All videos failed', jobId });
    } else {
      updateJob(jobId, { status: 'completed' });
      addLog({ level: 'info', message: `Videos complete: ${successCount} success, ${failCount} failed`, jobId });
    }

    setIsGenerating(false);
    refreshCredits();
    setTimeout(() => setLoadingStatus(''), 3000);
  };

  // --- ANIMATE HANDLERS ---
  const setAnimateReferenceVideo = (file: File | null, previewUrl: string | null) => {
    // Clean up old preview URL
    if (animateVideoPreviewUrl) URL.revokeObjectURL(animateVideoPreviewUrl);
    setAnimateVideoFile(file);
    setAnimateVideoPreviewUrl(previewUrl);
  };

  const handleAnimateDelete = (jobId: string) => {
    setAnimateJobs(prev => prev.filter(j => j.id !== jobId));
  };

  const handleAnimateRetry = async (job: AnimateJob) => {
    if (!kieApiKey) {
      setKeyModalMode('spicy');
      setIsKeyModalOpen(true);
      return;
    }

    setIsGenerating(true);
    setLoadingStatus('🎭 Retrying animation...');

    // Update job status to generating
    setAnimateJobs(prev => prev.map(j =>
      j.id === job.id ? { ...j, status: 'generating' as const, error: undefined } : j
    ));

    const activityJobId = addJob({
      type: 'video',
      status: 'active',
      prompt: `Retry animate ${job.subMode}`,
    });

    try {
      const result = await generateAnimateVideo(
        kieApiKey,
        job.characterImage.base64,
        job.characterImage.mimeType,
        job.referenceVideoFile,
        job.subMode,
        job.resolution,
        (stage, detail) => setLoadingStatus(`🎭 Retry: ${detail || stage}`)
      );

      if (result.success && result.videoUrl) {
        setAnimateJobs(prev => prev.map(j =>
          j.id === job.id ? { ...j, status: 'success' as const, resultVideoUrl: result.videoUrl, error: undefined } : j
        ));
        updateJob(activityJobId, { status: 'completed' });
        setLoadingStatus('🎭 Retry successful!');
      } else {
        setAnimateJobs(prev => prev.map(j =>
          j.id === job.id ? { ...j, status: 'failed' as const, error: result.error } : j
        ));
        updateJob(activityJobId, { status: 'failed', error: result.error });
        setLoadingStatus('🎭 Retry failed');
      }
    } catch (error: any) {
      setAnimateJobs(prev => prev.map(j =>
        j.id === job.id ? { ...j, status: 'failed' as const, error: error.message } : j
      ));
      updateJob(activityJobId, { status: 'failed', error: error.message });
    } finally {
      setIsGenerating(false);
      refreshCredits();
      setTimeout(() => setLoadingStatus(''), 2000);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-gray-200 font-sans">
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        apiKey={apiKey}
        setApiKey={setApiKey}
        mode={keyModalMode}
        kieApiKey={kieApiKey}
        setKieApiKey={setKieApiKey}
      />

      <ModifyImageModal
        isOpen={!!modifyingImage}
        sourceImage={modifyingImage}
        onClose={() => setModifyingImage(null)}
        onSubmit={handleModifyImage}
        isLoading={isModifying}
        hasGeminiKey={!!apiKey}
        hasKieApiKey={!!kieApiKey}
      />

      {/* Activity Panel - replaces old toast */}
      <ActivityPanel
        jobs={activityJobs}
        logs={activityLogs}
        onClearCompleted={clearCompletedJobs}
      />

      {!isDbLoaded ? (
        <div className="fixed inset-0 bg-gray-950 z-[100] flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-dash-300 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-gray-400 font-mono text-sm">Loading Gallery...</p>
          </div>
        </div>
      ) : (
        <>
          <LeftPanel
            prompts={prompts}
            setPrompts={setPrompts}
            settings={settings}
            setSettings={setSettings}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onOpenApiKey={() => {
              setKeyModalMode('gemini');
              setIsKeyModalOpen(true);
            }}
            hasApiKey={!!apiKey}
            hasKieApiKey={!!kieApiKey}
            credits={credits}
            creditsLoading={creditsLoading}
            creditsError={creditsError}
            isLowCredits={isLowCredits}
            isCriticalCredits={isCriticalCredits}
            appMode={appMode}
            videoScenes={videoScenes}
            setVideoScenes={setVideoScenes}
            videoSettings={videoSettings}
            setVideoSettings={setVideoSettings}
            onVideoGenerate={handleVideoGenerate}
            // Animate Mode props
            animateSettings={animateSettings}
            setAnimateSettings={setAnimateSettings}
            animateCharacterImage={animateCharacterImage}
            setAnimateCharacterImage={setAnimateCharacterImage}
            animateVideoFile={animateVideoFile}
            animateVideoPreviewUrl={animateVideoPreviewUrl}
            setAnimateReferenceVideo={setAnimateReferenceVideo}
            onAnimateGenerate={handleVideoGenerate}
          />
          <RightPanel
            runs={runs}
            onDeleteRun={handleDeleteRun}
            onDeleteImage={handleDeleteImage}
            onRetryImage={handleRetry}
            onModifyImage={setModifyingImage}
            isGenerating={isGenerating}
            isModifying={isModifying}
            loadingStatus={loadingStatus}
            appMode={appMode}
            setAppMode={setAppMode}
            generatedVideos={generatedVideos}
            onDeleteVideo={handleDeleteVideo}
            onRetryVideo={handleRetryVideo}
            // Animate Mode props
            animateJobs={animateJobs}
            onAnimateDelete={handleAnimateDelete}
            onAnimateRetry={handleAnimateRetry}
          />
        </>
      )}
    </div>
  );
};

export default App;
