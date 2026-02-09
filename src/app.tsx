import React, { useState, useEffect, useRef } from 'react';
import LeftPanel from './components/left-panel';
import RightPanel from './components/right-panel';
import ApiKeyModal from './components/api-key-modal';
import ModifyImageModal from './components/modify-image-modal';
import { AppSettings, Run, GeneratedImage, PromptItem, ReferenceImage, ReferenceVideo, AppMode, VideoScene, VideoSettings, GeneratedVideo, VideoModel, KlingProDuration, KlingProAspectRatio, Kling3ImageListItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { generateImage, modifyImage } from './services/gemini-service';
import { getAllRunsFromDB, saveRunToDB, deleteRunFromDB } from './services/db';
import { getAllGeneratedVideosFromDB, saveGeneratedVideoToDB, deleteGeneratedVideoFromDB } from './services/indexeddb-video-storage';
import { processBatchQueue, QueueTask, calculateOptimalBatchSize, BATCH_DELAYS } from './services/batch-queue';
import { withRateLimitRetry } from './services/rate-limiter';
import { useSeedreamCredits } from './hooks/use-seedream-credits';
import { generateWithSeedream, mapAspectRatio, uploadImageBase64 } from './services/seedream-service';
import { generateWithSeedreamTxt2Img } from './services/seedream-txt2img-service';
import { generateMotionVideo } from './services/kling-motion-control-service';
import { createFreepikProI2VTask, pollFreepikProI2VTask, createKling3Task, pollKling3Task, createKling3OmniTask, createKling3OmniReferenceTask, pollKling3OmniTask, pollKling3OmniReferenceTask, createAndPollWithRetry } from './services/freepik-kling-service';
import { logger } from './services/logger';
import { generateThumbnail, base64ToBlob, blobToBase64 } from './services/image-blob-manager';
import { useActivityQueue } from './hooks/use-activity-queue';
import ActivityPanel from './components/activity-panel';
import PromptLibraryPanel from './components/prompt-library-panel';
import { SavedPrompt } from './types/prompt-library';

const App: React.FC = () => {
  // State: Settings & Inputs
  const [prompts, setPrompts] = useState<PromptItem[]>([
    { id: crypto.randomUUID(), text: '', referenceImages: [] }
  ]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [kieApiKey, setKieApiKey] = useState('');
  const [freepikApiKey, setFreepikApiKey] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [keyModalMode, setKeyModalMode] = useState<'gemini' | 'spicy' | 'freepik'>('gemini');

  // Video Mode State
  const [appMode, setAppMode] = useState<AppMode>('image');
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
    // Kling 3 defaults
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
    navigator.storage?.persist?.();
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

        const savedFreepikKey = localStorage.getItem('freepik_api_key');
        if (savedFreepikKey) {
          setFreepikApiKey(savedFreepikKey);
          logger.debug('App', 'Loaded Freepik API key from storage');
        }

        // Prompt for Gemini key if missing
        if (!savedGeminiKey) {
          logger.info('App', 'No Gemini API key found, showing modal');
          setKeyModalMode('gemini');
          setIsKeyModalOpen(true);
        }

        // Load Settings (exclude image arrays to avoid localStorage quota issues)
        const savedSettings = localStorage.getItem('raw_studio_settings');
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            // Exclude image arrays from loaded settings to prevent quota issues
            const { globalReferenceImages, fixedBlockImages, ...settingsWithoutImages } = parsed;
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

        // Migrate old images: generate thumbnails in background
        const migrateOldThumbnails = async (loadedRuns: Run[]) => {
          for (const run of loadedRuns) {
            let updated = false;
            for (const img of run.images) {
              if (img.base64 && !img.thumbnailBase64) {
                try {
                  const blob = base64ToBlob(img.base64, img.mimeType);
                  const thumbBlob = await generateThumbnail(blob, 400);
                  img.thumbnailBase64 = await blobToBase64(thumbBlob);
                  img.thumbnailMimeType = 'image/jpeg';
                  updated = true;
                } catch { /* skip */ }
              }
            }
            if (updated) {
              saveRunToDB(run).catch(() => {});
            }
          }
          setRuns([...loadedRuns]);
        };
        migrateOldThumbnails(dbRuns).catch(() => {});

        // Load generated videos from IndexedDB (skip failed ones)
        const savedVideos = await getAllGeneratedVideosFromDB();
        const validVideos = savedVideos.filter(v => v.status === 'success');
        setGeneratedVideos(validVideos);
        logger.info('App', `Loaded ${validVideos.length} generated videos from database (filtered ${savedVideos.length - validVideos.length} failed)`);
      } catch (e) {
        logger.error('App', 'Failed to load data', e);
      } finally {
        setIsDbLoaded(true);
      }
    };
    loadData();
  }, []);

  // Save Settings to LocalStorage (exclude image arrays to avoid quota exceeded)
  useEffect(() => {
    const { fixedBlockImages, ...settingsToSave } = settings;
    try {
      localStorage.setItem('raw_studio_settings', JSON.stringify(settingsToSave));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }, [settings]);

  // --- RETRY LOGIC ---
  const handleRetry = async (image: GeneratedImage) => {
    // Allow concurrent retries - no isGenerating guard

    const model = image.generatedBy || 'gemini'; // Default to gemini for legacy

    logger.info('App', 'Retrying generation', { imageId: image.id, model });
    setIsGenerating(true);
    setLoadingStatus(`Retrying with ${model}...`);
    abortControllerRef.current = new AbortController();

    // Find the original run to get stored reference images
    const originalRun = runs.find(run =>
      run.images.some(img => img.id === image.id)
    );

    // Get original reference images from the run (stored at generation time)
    // Falls back to current prompt cards / fixed block for legacy runs without stored refs
    const originalRefs: ReferenceImage[] = [];
    if (originalRun?.referenceImages?.length) {
      // Preferred: use refs stored on the run
      originalRefs.push(...originalRun.referenceImages);
    } else if (originalRun) {
      // Legacy fallback: try prompt cards + fixed block
      const promptCard = prompts.find(p => p.text === originalRun.promptRaw || p.text === originalRun.finalPrompt);
      if (promptCard?.referenceImages?.length) {
        originalRefs.push(...promptCard.referenceImages);
      }
      if (originalRun.fixedBlockUsed && settings.fixedBlockImages?.length) {
        originalRefs.push(...settings.fixedBlockImages);
      }
    }

    try {
      let result: GeneratedImage;

      if (model === 'gemini') {
        if (!apiKey) {
          setKeyModalMode('gemini');
          setIsKeyModalOpen(true);
          return;
        }

        // Build retry refs: original references + failed image for analysis
        const retryRefs: ReferenceImage[] = originalRefs.map((ref, i) => ({
          ...ref, id: crypto.randomUUID(), label: `[ORIGINAL REFERENCE #${i + 1}]`
        }));
        if (image.base64) {
          retryRefs.push({
            id: crypto.randomUUID(),
            base64: image.base64,
            mimeType: image.mimeType,
            label: `[FAILED GENERATED IMAGE — DO NOT REPRODUCE THIS]`,
          });
        }

        const retryPrompt = `RETRY GENERATION — Analyze and improve.

You previously attempted to generate an image from the prompt below but the result was unsatisfactory.

ORIGINAL PROMPT: ${image.promptUsed}

INSTRUCTIONS:
- The images labeled [ORIGINAL REFERENCE] are the source/character references — match their appearance, features, and style.
- The image labeled [FAILED GENERATED IMAGE] is your previous failed attempt — analyze what went wrong (wrong pose, bad face, wrong angle, artifacts, etc.) and fix those issues.
- Generate a NEW, IMPROVED image that follows the original prompt more accurately.
- Do NOT reproduce the failed image. Improve upon it.`;

        const genResult = await generateImage({
          prompt: retryPrompt,
          referenceImages: retryRefs,
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

        // SeedDream txt2img: if we have original refs, use seedream-edit instead
        // (edit mode gives better results with a reference image)
        if (originalRefs.length > 0 && originalRefs[0].base64) {
          const genResult = await generateWithSeedream(
            kieApiKey,
            image.promptUsed,
            originalRefs[0].base64,
            originalRefs[0].mimeType || 'image/jpeg',
            {
              aspectRatio: mapAspectRatio(image.settingsSnapshot.aspectRatio),
              quality: image.settingsSnapshot.spicyMode?.quality || 'high'
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
        } else {
          // No refs available — pure txt2img retry
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
        }

      } else { // seedream-edit
        if (!kieApiKey) {
          setKeyModalMode('spicy');
          setIsKeyModalOpen(true);
          return;
        }
        // Use original reference image if available, otherwise fall back to the failed image
        const sourceImage = (originalRefs.length > 0 && originalRefs[0].base64)
          ? originalRefs[0]
          : { base64: image.base64, mimeType: image.mimeType };

        const genResult = await generateWithSeedream(
          kieApiKey,
          image.promptUsed,
          sourceImage.base64,
          sourceImage.mimeType || 'image/jpeg',
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
          fixedBlockUsed: image.settingsSnapshot.fixedBlockEnabled ?? false,
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
          fixedBlockUsed: false,
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

    // Fixed block images count toward refs when enabled
    const fixedBlockRefs = settings.fixedBlockEnabled ? (settings.fixedBlockImages || []) : [];

    // Spicy Edit Mode requires at least one reference image
    const isSpicyEditMode = isSpicyMode && settings.spicyMode?.subMode === 'edit';
    if (isSpicyEditMode) {
      for (const item of validItems) {
        if (item.referenceImages.length + fixedBlockRefs.length === 0) {
          logger.warn('App', 'Spicy Edit Mode requires reference image', { prompt: item.text.slice(0, 30) });
          alert(`Spicy Edit Mode requires at least one reference image per prompt. Add an image to "${item.text.slice(0, 30)}..." or switch to Generate mode.`);
          return;
        }
      }
    }

    for (const item of validItems) {
      if (item.referenceImages.length + fixedBlockRefs.length > 7) {
        logger.warn('App', 'Too many reference images', { count: item.referenceImages.length + fixedBlockRefs.length });
        alert(`Error: Prompt "${item.text.slice(0, 20)}..." exceeds 7 reference images limit.`);
        return;
      }
    }

    logger.info('App', `Generating ${validItems.length} prompts`, {
      mode: isSpicyMode ? 'spicy' : 'gemini',
      outputCount: settings.outputCount,
      fixedBlockRefs: fixedBlockRefs.length
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
    const hasRefs = validItems.some(p => p.referenceImages.length > 0) || fixedBlockRefs.length > 0;
    const modeLabel = isSpicyMode ? '[🌶️]' : '';
    const finalPromptSummary = validItems.length > 1
      ? `${modeLabel}${validItems.length} Prompts. First: ${validItems[0].text.slice(0, 50)}...`
      : `${modeLabel}${validItems[0].text}` + (settings.fixedBlockEnabled ? ` (+Fixed)` : '') + (hasRefs ? ` (+Images)` : '');

    const newRun: Run = {
      id: newRunId,
      name: `Run #${runs.length + 1}${isSpicyMode ? ' 🌶️' : ''}`,
      createdAt: Date.now(),
      promptRaw: summaryPrompt,
      fixedBlockUsed: settings.fixedBlockEnabled,
      finalPrompt: finalPromptSummary,
      settingsSnapshot: { ...settings },
      images: [],
      // Store reference images for reliable retry access
      referenceImages: [
        ...(settings.fixedBlockEnabled ? (settings.fixedBlockImages || []) : []),
        ...validItems.flatMap(item => item.referenceImages),
      ],
    };

    setRuns(prev => [newRun, ...prev]);
    await saveRunToDB(newRun);

    // Build Task Queue
    const taskQueue: QueueTask[] = [];
    const fixedBlockImages = settings.fixedBlockImages || [];
    validItems.forEach(item => {
      let finalPrompt = item.text.trim();

      // Apply fixed block text based on position
      if (settings.fixedBlockEnabled && settings.fixedBlockText.trim()) {
        const blockText = settings.fixedBlockText.trim();
        if (settings.fixedBlockPosition === 'top') {
          finalPrompt = `${blockText}\n\n${finalPrompt}`;
        } else {
          finalPrompt += `\n\n${blockText}`;
        }
      }

      // Combine refs: fixed block images go at top or bottom based on position
      let allRefs: ReferenceImage[];
      if (settings.fixedBlockEnabled && fixedBlockImages.length > 0) {
        if (settings.fixedBlockPosition === 'top') {
          allRefs = [...fixedBlockImages, ...item.referenceImages];
        } else {
          allRefs = [...item.referenceImages, ...fixedBlockImages];
        }
      } else {
        allRefs = [...item.referenceImages];
      }

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
            // Use Gemini service — with Seedream fallback on no-image response
            try {
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
            } catch (geminiError: any) {
              // Fallback to Seedream if Gemini returned no image
              const isNoImage = geminiError.message?.includes('No image in response') ||
                geminiError.message?.includes('returned text instead of image');
              if (!isNoImage) throw geminiError;

              logger.info('App', 'Gemini returned no image, falling back to Seedream', {
                promptPreview: task.prompt.slice(0, 50),
              });
              setLoadingStatus('🔄 Gemini failed, retrying with Seedream...');

              const kieApiKey = localStorage.getItem('raw_studio_kie_api_key') || '';
              if (!kieApiKey) throw new Error('Gemini returned no image and no Kie.ai API key set for Seedream fallback.');

              const seedreamSettings = {
                aspectRatio: mapAspectRatio(task.settings.aspectRatio || '1:1'),
                quality: 'high' as const,
              };

              // If we have reference images, use seedream-edit
              if (task.refs && task.refs.length > 0 && task.refs[0].base64) {
                const result = await generateWithSeedream(
                  kieApiKey,
                  task.prompt,
                  task.refs[0].base64,
                  task.refs[0].mimeType || 'image/jpeg',
                  seedreamSettings,
                );
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
              } else {
                // No reference image — use txt2img
                const result = await generateWithSeedreamTxt2Img(
                  kieApiKey,
                  task.prompt,
                  seedreamSettings,
                );
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
              }
            }
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
            // Generate thumbnail in background, then update state
            const generateThumb = async () => {
              let thumbnailBase64: string | undefined;
              let thumbnailMimeType: string | undefined;
              try {
                if (result.base64) {
                  const blob = base64ToBlob(result.base64, result.mimeType);
                  const thumbBlob = await generateThumbnail(blob, 400);
                  thumbnailBase64 = await blobToBase64(thumbBlob);
                  thumbnailMimeType = 'image/jpeg';
                }
              } catch {
                // Thumbnail generation failed, not critical
              }
              return { thumbnailBase64, thumbnailMimeType };
            };

            generateThumb().then(({ thumbnailBase64, thumbnailMimeType }) => {
              setRuns(prev => prev.map(r => {
                if (r.id === newRunId) {
                  const updatedImages = r.images.map(img =>
                    img.id === task.id
                      ? { ...result, id: task.id, status: 'success' as const, thumbnailBase64, thumbnailMimeType }
                      : img
                  );
                  const updated = { ...r, images: updatedImages };
                  saveRunToDB(updated).catch(err =>
                    console.error('Failed to save run to DB:', err)
                  );
                  return updated;
                }
                return r;
              }));
            });
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

  /**
   * Upload base64 image to Kie.ai and return public URL
   */
  const uploadImageToKie = async (
    imageBase64: string,
    mimeType: string
  ): Promise<string> => {
    if (!kieApiKey) {
      throw new Error('Kie.ai API key required for image upload');
    }
    return uploadImageBase64(kieApiKey, imageBase64, mimeType);
  };

  /**
   * Pro I2V generation: upload image via Kie.ai → Freepik Pro I2V → poll
   */
  const generateProI2V = async (
    scene: VideoScene,
    sceneIndex: number,
    totalScenes: number,
    onProgress?: (detail: string) => void
  ): Promise<GeneratedVideo> => {
    const startTime = Date.now();
    const duration = (videoSettings as any).klingProDuration as KlingProDuration || '5';
    const aspectRatio = (videoSettings as any).klingProAspectRatio as KlingProAspectRatio || 'widescreen_16_9';
    const cfgScale = (videoSettings as any).klingCfgScale ?? 0.5;
    const negativePrompt = (videoSettings as any).klingProNegativePrompt || '';
    const generateAudio = (videoSettings as any).klingProGenerateAudio || false;

    try {
      // Upload image (use Kie.ai if available, else send base64 directly)
      onProgress?.('Uploading image...');
      let imageRef: string;
      if (kieApiKey) {
        imageRef = await uploadImageBase64(kieApiKey, scene.referenceImage.base64, scene.referenceImage.mimeType);
      } else {
        // Freepik accepts base64 directly
        imageRef = `data:${scene.referenceImage.mimeType};base64,${scene.referenceImage.base64}`;
      }

      // Create + poll with auto-retry on FAILED
      const result = await createAndPollWithRetry(
        () => createFreepikProI2VTask(
          freepikApiKey, imageRef, scene.prompt, duration, aspectRatio,
          cfgScale, negativePrompt, generateAudio
        ),
        (taskId, onPollProgress) => pollFreepikProI2VTask(freepikApiKey, taskId, onPollProgress),
        (status, attempt) => onProgress?.(status)
      );

      if (result.success && result.videoUrl) {
        logger.info('App', 'Pro I2V complete', { sceneId: scene.id, durationMs: Date.now() - startTime });
        return {
          id: `video-${Date.now()}`,
          sceneId: scene.id,
          url: result.videoUrl,
          duration: parseInt(duration),
          prompt: scene.prompt,
          createdAt: Date.now(),
          status: 'success',
          provider: 'freepik',
        };
      }

      return {
        id: `video-${Date.now()}`,
        sceneId: scene.id,
        url: '',
        duration: 0,
        prompt: scene.prompt,
        createdAt: Date.now(),
        status: 'failed',
        error: result.error || 'Pro I2V generation failed',
      };
    } catch (error) {
      logger.error('App', 'Pro I2V failed', { error, sceneId: scene.id });
      return {
        id: `video-${Date.now()}`,
        sceneId: scene.id,
        url: '',
        duration: 0,
        prompt: scene.prompt,
        createdAt: Date.now(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  /**
   * Kling 3 MultiShot generation: single API call with all scenes
   */
  const generateKling3 = async (
    onProgress?: (detail: string) => void
  ): Promise<GeneratedVideo> => {
    const startTime = Date.now();
    const shotType = (videoSettings as any).kling3ShotType || 'intelligent';
    const cfgScale = (videoSettings as any).kling3CfgScale ?? 0.5;
    const negativePrompt = (videoSettings as any).kling3NegativePrompt || '';
    const aspectRatio = (videoSettings as any).kling3AspectRatio || '16:9';
    const duration = (videoSettings as any).kling3Duration || 5;
    const generateAudio = (videoSettings as any).kling3GenerateAudio || false;
    const tierRaw = (videoSettings as any).kling3Tier || 'pro';
    const tier = tierRaw === 'standard' ? 'std' : tierRaw; // UI stores 'standard', API expects 'std'
    const startImage = (videoSettings as any).kling3StartImage as ReferenceImage | null;
    const endImage = (videoSettings as any).kling3EndImage as ReferenceImage | null;

    try {
      // Build prompt or multi_prompt based on shot type
      let prompt: string | undefined;
      let multiPrompt: Array<{index: number; prompt: string; duration: number}> | undefined;

      if (shotType === 'intelligent') {
        prompt = (videoSettings as any).kling3Prompt || '';
      } else {
        const shots: Array<{prompt: string; duration: number}> = (videoSettings as any).kling3MultiPrompt || [];
        multiPrompt = shots.map((s, i) => ({
          index: i,
          prompt: s.prompt,
          duration: s.duration || 3,
        }));
      }

      // Upload start/end frame images if provided
      let imageList: Kling3ImageListItem[] | undefined;
      if (startImage) {
        onProgress?.('Uploading start frame...');
        const startUrl = kieApiKey
          ? await uploadImageToKie(startImage.base64, startImage.mimeType)
          : `data:${startImage.mimeType};base64,${startImage.base64}`;
        imageList = [{ image_url: startUrl, type: 'first_frame' }];
      }
      if (endImage) {
        onProgress?.('Uploading end frame...');
        const endUrl = kieApiKey
          ? await uploadImageToKie(endImage.base64, endImage.mimeType)
          : `data:${endImage.mimeType};base64,${endImage.base64}`;
        if (!imageList) imageList = [];
        imageList.push({ image_url: endUrl, type: 'end_frame' });
      }

      // Create + poll with auto-retry on FAILED
      const result = await createAndPollWithRetry(
        () => createKling3Task(freepikApiKey, tier as 'pro' | 'std', {
          prompt,
          imageList,
          multiShot: shotType === 'customize',
          multiPrompt,
          negativePrompt,
          aspectRatio: aspectRatio as any,
          duration,
          cfgScale,
          shotType,
          generateAudio,
        }),
        (taskId, onPollProgress) => pollKling3Task(freepikApiKey, taskId, onPollProgress),
        (status, attempt) => onProgress?.(status)
      );

      const promptSummary = prompt || (multiPrompt?.map(s => s.prompt).join(' || ') || '');
      const videoDuration = shotType === 'intelligent'
        ? duration
        : (multiPrompt?.reduce((a, s) => a + s.duration, 0) || duration);

      if (result.success && result.videoUrl) {
        logger.info('App', 'Kling 3 complete', { durationMs: Date.now() - startTime });
        return {
          id: `video-${Date.now()}`,
          sceneId: 'kling3-direct',
          url: result.videoUrl,
          duration: videoDuration,
          prompt: promptSummary,
          createdAt: Date.now(),
          status: 'success',
          provider: 'freepik',
        };
      }

      return {
        id: `video-${Date.now()}`,
        sceneId: 'kling3-direct',
        url: '',
        duration: 0,
        prompt: promptSummary,
        createdAt: Date.now(),
        status: 'failed',
        error: result.error || 'Kling 3 generation failed',
      };
    } catch (error) {
      logger.error('App', 'Kling 3 failed', { error });
      return {
        id: `video-${Date.now()}`,
        sceneId: 'kling3-direct',
        url: '',
        duration: 0,
        prompt: '',
        createdAt: Date.now(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  /**
   * Kling 3 Omni generation: supports T2V, I2V, V2V modes
   * Reads ALL inputs from videoSettings (kling3Omni* prefixed fields)
   */
  const generateKling3Omni = async (
    onProgress?: (detail: string) => void
  ): Promise<GeneratedVideo> => {
    const startTime = Date.now();

    // Read all settings from videoSettings
    const inputMode = (videoSettings as any).kling3OmniInputMode || 'image-to-video';
    const multiEnabled = !!(videoSettings as any).kling3OmniMultiPromptEnabled;
    const prompt = (videoSettings as any).kling3OmniPrompt || '';
    const multiPrompt: string[] = (videoSettings as any).kling3OmniMultiPrompt || [];
    const startImage = (videoSettings as any).kling3OmniStartImage as ReferenceImage | null;
    const endImage = (videoSettings as any).kling3OmniEndImage as ReferenceImage | null;
    const imageUrls: ReferenceImage[] = (videoSettings as any).kling3OmniImageUrls || [];
    const refVideo = (videoSettings as any).kling3OmniReferenceVideo as ReferenceVideo | null;

    // Shared settings
    const tierRaw = (videoSettings as any).kling3Tier || 'pro';
    const tier = tierRaw === 'standard' ? 'std' : tierRaw; // UI stores 'standard', API expects 'std'
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

        // Upload reference video to Kie.ai to get URL
        onProgress?.('Uploading reference video...');
        let videoUrl: string;
        if (kieApiKey) {
          // Use blob upload — convert File to base64
          const videoBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              const base64 = dataUrl.split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(refVideo.file);
          });
          const mimeType = refVideo.file.type || 'video/mp4';
          videoUrl = await uploadImageBase64(kieApiKey, videoBase64, mimeType);
        } else {
          throw new Error('Kie.ai API key required to upload reference video');
        }

        // Optional start frame for V2V
        let startFrameUrl: string | undefined;
        if (startImage) {
          onProgress?.('Uploading start frame...');
          startFrameUrl = kieApiKey
            ? await uploadImageToKie(startImage.base64, startImage.mimeType)
            : `data:${startImage.mimeType};base64,${startImage.base64}`;
        }

        // Create + poll with auto-retry on FAILED
        const result = await createAndPollWithRetry(
          () => createKling3OmniReferenceTask(freepikApiKey, tier as 'pro' | 'std', {
            videoUrl,
            prompt,
            imageUrl: startFrameUrl,
            aspectRatio: aspectRatio as any,
            duration,
            cfgScale,
            negativePrompt,
          }),
          (taskId, onPollProgress) => pollKling3OmniReferenceTask(freepikApiKey, taskId, onPollProgress),
          (status, attempt) => onProgress?.(status)
        );

        if (result.success && result.videoUrl) {
          return {
            id: `video-${Date.now()}`,
            sceneId: 'kling3-omni-v2v',
            url: result.videoUrl,
            duration,
            prompt,
            createdAt: Date.now(),
            status: 'success',
            provider: 'freepik',
          };
        }
        throw new Error(result.error || 'Kling 3 Omni V2V failed');
      }

      // ---------- T2V / I2V Mode ----------
      const options: any = {
        aspectRatio: aspectRatio as any,
        duration,
        generateAudio,
      };

      // Build prompt or multi_prompt
      if (multiEnabled && !isV2V) {
        // Multi-shot mode (T2V or I2V)
        const validShots = multiPrompt.filter(s => s.trim());
        if (validShots.length > 0) {
          options.multiPrompt = validShots;
        } else {
          options.prompt = prompt || 'Create an engaging video.';
        }
      } else {
        options.prompt = prompt || 'Create an engaging video.';
      }

      // Upload start/end frames for I2V
      if (isI2V && startImage) {
        onProgress?.('Uploading start frame...');
        const startUrl = kieApiKey
          ? await uploadImageToKie(startImage.base64, startImage.mimeType)
          : `data:${startImage.mimeType};base64,${startImage.base64}`;
        options.imageUrl = startUrl;
      }
      if (isI2V && endImage) {
        onProgress?.('Uploading end frame...');
        const endUrl = kieApiKey
          ? await uploadImageToKie(endImage.base64, endImage.mimeType)
          : `data:${endImage.mimeType};base64,${endImage.base64}`;
        options.endImageUrl = endUrl;
      }

      // Upload reference images (@Image1, @Image2, etc.)
      if (imageUrls.length > 0 && (isT2V || isI2V)) {
        onProgress?.('Uploading reference images...');
        const uploadedUrls: string[] = [];
        for (const img of imageUrls) {
          const url = kieApiKey
            ? await uploadImageToKie(img.base64, img.mimeType)
            : `data:${img.mimeType};base64,${img.base64}`;
          uploadedUrls.push(url);
        }
        options.imageUrls = uploadedUrls;
      }

      // Create + poll with auto-retry on FAILED
      const result = await createAndPollWithRetry(
        () => createKling3OmniTask(freepikApiKey, tier as 'pro' | 'std', options),
        (taskId, onPollProgress) => pollKling3OmniTask(freepikApiKey, taskId, onPollProgress),
        (status, attempt) => onProgress?.(status)
      );

      const promptSummary = multiEnabled && options.multiPrompt
        ? options.multiPrompt.join(' || ')
        : (options.prompt || '');

      if (result.success && result.videoUrl) {
        return {
          id: `video-${Date.now()}`,
          sceneId: `kling3-omni-${inputMode}`,
          url: result.videoUrl,
          duration,
          prompt: promptSummary,
          createdAt: Date.now(),
          status: 'success',
          provider: 'freepik',
        };
      }
      throw new Error(result.error || 'Kling 3 Omni generation failed');

    } catch (error) {
      logger.error('App', 'Kling 3 Omni failed', { error, inputMode });
      return {
        id: `video-${Date.now()}`,
        sceneId: `kling3-omni-${inputMode}`,
        url: '',
        duration: 0,
        prompt: prompt || multiPrompt.join(' || '),
        createdAt: Date.now(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
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
        freepikApiKey,
        scene,
        videoSettings.globalReferenceVideo,
        videoSettings,
        (stage, detail) => setLoadingStatus(`Retry: ${detail || stage}`)
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

  // Load a saved prompt from the Prompt Library into the active prompt slot
  const handleLoadSavedPrompt = (saved: SavedPrompt) => {
    const newPrompt: PromptItem = {
      id: crypto.randomUUID(),
      text: saved.prompt,
      referenceImages: saved.referenceImages.map(img => ({
        id: img.id || crypto.randomUUID(),
        base64: img.base64,
        mimeType: img.mimeType,
        previewUrl: `data:${img.mimeType};base64,${img.base64}`,
      })),
    };
    setPrompts([newPrompt, ...prompts]);

    if (saved.settings) {
      setSettings(prev => ({
        ...prev,
        ...(saved.settings?.aspectRatio && { aspectRatio: saved.settings.aspectRatio as any }),
        ...(saved.settings?.temperature != null && { temperature: saved.settings.temperature }),
        ...(saved.settings?.imageSize && { imageSize: saved.settings.imageSize as any }),
      }));
    }
  };

  const handleVideoGenerate = async () => {
    // Kling 3 and Kling 2.6 Pro only need Freepik key; Motion Control needs Kie.ai key
    const needsFreepikOnly = ['kling-2.6-pro', 'kling-3', 'kling-3-omni'].includes(videoModel);
    if (needsFreepikOnly) {
      if (!freepikApiKey) {
        setKeyModalMode('freepik');
        setIsKeyModalOpen(true);
        return;
      }
    } else {
      if (!kieApiKey) {
        logger.warn('App', 'No Kie.ai API key for video generation');
        setKeyModalMode('spicy');
        setIsKeyModalOpen(true);
        return;
      }
    }

    // Kling 3: validate new UI fields (prompt or multi-shot)
    if (videoModel === 'kling-3') {
      const shotType = (videoSettings as any).kling3ShotType || 'intelligent';
      if (shotType === 'intelligent') {
        if (!(videoSettings as any).kling3Prompt?.trim()) {
          alert('Please enter a video prompt');
          return;
        }
      } else {
        const shots: any[] = (videoSettings as any).kling3MultiPrompt || [];
        if (shots.length === 0) { alert('Add at least one shot'); return; }
        if (shots.some((s: any) => !s.prompt?.trim())) { alert('All shots need prompts'); return; }
      }
    } else if (videoModel === 'kling-3-omni') {
      // Kling 3 Omni: validate based on input mode and multi-prompt setting
      const omniMode = (videoSettings as any).kling3OmniInputMode || 'image-to-video';
      const multiEnabled = !!(videoSettings as any).kling3OmniMultiPromptEnabled;

      if (multiEnabled && omniMode !== 'video-to-video') {
        const shots = (videoSettings as any).kling3OmniMultiPrompt || [];
        if (shots.length === 0 || shots.every((s: string) => !s.trim())) {
          alert('Add at least one shot prompt');
          return;
        }
      } else {
        const prompt = (videoSettings as any).kling3OmniPrompt?.trim();
        if (!prompt) {
          alert('Please enter a video prompt');
          return;
        }
      }

      if (omniMode === 'image-to-video' && !(videoSettings as any).kling3OmniStartImage) {
        alert('I2V mode requires a start frame image');
        return;
      }
      if (omniMode === 'video-to-video' && !(videoSettings as any).kling3OmniReferenceVideo) {
        alert('V2V mode requires a reference video');
        return;
      }
    } else {
      // Kling 2.6 and other models
      if (videoScenes.length === 0) { alert('Add at least one scene to generate videos'); return; }
    }

    // Log start — Kling 3 doesn't use videoScenes anymore
    const kling3PromptSummary = videoModel === 'kling-3'
      ? ((videoSettings as any).kling3ShotType === 'customize'
          ? ((videoSettings as any).kling3MultiPrompt || []).map((s: any) => s.prompt).join(' || ')
          : (videoSettings as any).kling3Prompt || 'Kling 3 video')
      : '';
    const logPrompt = videoModel === 'kling-3'
      ? kling3PromptSummary.slice(0, 50)
      : (videoScenes[0]?.prompt || 'Motion video').slice(0, 50) + (videoScenes.length > 1 ? ` (+${videoScenes.length - 1} more)` : '');

    logger.info('App', `Starting ${videoModel} generation`);
    setIsGenerating(true);

    const jobId = addJob({
      type: 'video',
      status: 'active',
      prompt: logPrompt
    });
    addLog({ level: 'info', message: `Starting ${videoModel} video generation`, jobId });

    // --------------- Kling 3 / Kling 3 Omni (single API call, multi-shot) ---------------
    if (videoModel === 'kling-3' || videoModel === 'kling-3-omni') {
      // Single placeholder for Kling 3 multi-shot
      const placeholderId = `video-${Date.now()}-kling3`;
      const placeholder: GeneratedVideo = {
        id: placeholderId,
        sceneId: videoModel === 'kling-3' ? 'kling3-direct' : videoScenes[0]?.id || 'kling3-omni',
        url: '',
        duration: 0,
        prompt: videoModel === 'kling-3' ? kling3PromptSummary : videoScenes.map(s => s.prompt).join(' || '),
        createdAt: Date.now(),
        status: 'generating',
      };
      setGeneratedVideos(prev => [placeholder, ...prev]);

      try {
        setLoadingStatus(`Generating ${videoModel} video...`);

        const video = videoModel === 'kling-3'
          ? await generateKling3((detail) => setLoadingStatus(detail))
          : await generateKling3Omni((detail) => setLoadingStatus(detail));

        setGeneratedVideos(prev => prev.map(v =>
          v.id === placeholderId ? { ...video, id: placeholderId } : v
        ));

        if (video.status === 'success') {
          setLoadingStatus(`🎬 Kling 3 done! ${video.duration}s video generated`);
          saveGeneratedVideoToDB({ ...video, id: placeholderId }).catch(e =>
            logger.warn('App', 'Failed to persist video to IndexedDB', e)
          );
          updateJob(jobId, { status: 'completed' });
          addLog({ level: 'info', message: 'Kling 3 video generated successfully', jobId });
        } else {
          setLoadingStatus('🎬 Kling 3 failed');
          updateJob(jobId, { status: 'failed', error: video.error });
          addLog({ level: 'error', message: `Kling 3 failed: ${video.error}`, jobId });
          setTimeout(() => {
            setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId));
          }, 8000);
        }
      } catch (error: any) {
        logger.error('App', 'Kling 3 generation error', { error });
        setLoadingStatus('🎬 Kling 3 error');
        updateJob(jobId, { status: 'failed', error: error.message });
        addLog({ level: 'error', message: `Kling 3 error: ${error.message}`, jobId });
        setGeneratedVideos(prev => prev.map(v =>
          v.id === placeholderId ? { ...v, status: 'failed' as const, error: error.message } : v
        ));
        setTimeout(() => {
          setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId));
        }, 8000);
      } finally {
        setIsGenerating(false);
        refreshCredits();
        setTimeout(() => setLoadingStatus(''), 3000);
      }
      return;
    }

    // --------------- Parallel generation (Kling 2.6 / Pro I2V) ---------------
    // Fire all scenes concurrently. Stagger task creation by 500ms to
    // respect Freepik rate-limit (10 req/s avg over 2 min) while polling
    // all tasks in parallel.

    const placeholderIds: string[] = [];

    // Create placeholders for ALL scenes up-front so the UI shows them all
    for (let i = 0; i < videoScenes.length; i++) {
      const scene = videoScenes[i];
      const placeholderId = `video-${Date.now()}-${i}`;
      placeholderIds.push(placeholderId);
      const placeholder: GeneratedVideo = {
        id: placeholderId,
        sceneId: scene.id,
        url: '',
        duration: 0,
        prompt: scene.prompt,
        createdAt: Date.now(),
        status: 'generating',
      };
      setGeneratedVideos(prev => [placeholder, ...prev]);
    }

    setLoadingStatus(`Generating ${videoScenes.length} videos in parallel...`);

    // Track per-scene status for the combined status line
    const sceneStatuses: string[] = videoScenes.map((_, i) => `Scene ${i + 1}: queued`);
    const updateCombinedStatus = () => {
      setLoadingStatus(sceneStatuses.join(' · '));
    };

    // Build one promise per scene
    const scenePromises = videoScenes.map(async (scene, i) => {
      const placeholderId = placeholderIds[i];

      // Stagger task creation: 500ms between each to avoid rate-limit bursts
      if (i > 0) {
        await new Promise(r => setTimeout(r, i * 500));
      }

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
            kieApiKey,
            freepikApiKey,
            scene,
            videoSettings.globalReferenceVideo,
            videoSettings,
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
          logger.info('App', `Scene ${i + 1} completed successfully`);
          saveGeneratedVideoToDB({ ...video, id: placeholderId }).catch(e =>
            logger.warn('App', 'Failed to persist video to IndexedDB', e)
          );
        } else {
          sceneStatuses[i] = `Scene ${i + 1}: ❌`;
          logger.warn('App', `Scene ${i + 1} failed`, { error: video.error });
          setTimeout(() => {
            setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId));
          }, 8000);
        }
        updateCombinedStatus();
        return video;
      } catch (error: any) {
        sceneStatuses[i] = `Scene ${i + 1}: ❌`;
        updateCombinedStatus();
        logger.error('App', `Scene ${i + 1} generation error`, { error });
        setGeneratedVideos(prev => prev.map(v =>
          v.id === placeholderId ? { ...v, status: 'failed' as const, error: error.message } : v
        ));
        const failedVideo: GeneratedVideo = {
          id: placeholderId,
          sceneId: scene.id,
          url: '',
          duration: 0,
          prompt: scene.prompt,
          createdAt: Date.now(),
          status: 'failed',
          error: error.message
        };
        setTimeout(() => {
          setGeneratedVideos(prev => prev.filter(v => v.id !== placeholderId));
        }, 8000);
        return failedVideo;
      }
    });

    try {
      // Await all scenes in parallel
      const results = await Promise.all(scenePromises);

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
    } finally {
      setIsGenerating(false);
      refreshCredits();
      setTimeout(() => setLoadingStatus(''), 3000);
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
        freepikApiKey={freepikApiKey}
        setFreepikApiKey={setFreepikApiKey}
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
            videoModel={videoModel}
            setVideoModel={setVideoModel}
            videoScenes={videoScenes}
            setVideoScenes={setVideoScenes}
            videoSettings={videoSettings}
            setVideoSettings={setVideoSettings}
            onVideoGenerate={handleVideoGenerate}
            geminiApiKey={apiKey}
          />
          <PromptLibraryPanel
            onLoadPrompt={handleLoadSavedPrompt}
            currentPrompt={prompts[0]?.text || ''}
            currentNegativePrompt=""
            currentReferenceImages={prompts[0]?.referenceImages?.map(img => ({
              id: img.id,
              base64: img.base64,
              mimeType: img.mimeType,
            }))}
            currentSettings={{
              model: settings.spicyMode?.enabled ? 'seedream' : 'gemini',
              aspectRatio: settings.aspectRatio,
              temperature: settings.temperature,
              imageSize: settings.imageSize,
            }}
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
          />
        </>
      )}
    </div>
  );
};

export default App;
