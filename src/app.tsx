import React, { useState, useEffect, useRef, useMemo } from 'react';
import LeftPanel from './components/left-panel';
import RightPanel from './components/right-panel';
import ApiKeyModal from './components/api-key-modal';
import ModifyImageModal from './components/modify-image-modal';
import AuthPage from './components/auth-page';
import { useAuth } from './hooks/use-auth';
import { RecoveryModal } from './components/recovery-modal';
import SettingsPage from './components/settings-page';
import { CompareModal } from './components/compare-modal';
import { BatchActionsToolbar } from './components/batch-actions-toolbar';
import { SaveCollectionModal } from './components/save-collection-modal';
import { SavePayloadDialog } from './components/save-payload-dialog';
import { SavedPayloadsPage } from './components/saved-payloads-page';
import { AppSettings, Run, GeneratedImage, PromptItem, ReferenceImage, ReferenceVideo, AppMode, VideoScene, VideoSettings, GeneratedVideo, VideoModel, KlingProDuration, KlingProAspectRatio, Kling3ImageListItem, VeoGenerationType } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { generateImage, modifyImage } from './services/gemini-service';
import { getAllRunsFromDB, saveRunToDB, deleteRunFromDB, type PendingRequest, type SavedPayload, saveVideoCollection, getAllSavedPayloads, saveSavedPayload, updateSavedPayload, getSavedPayloadByPayloadId, deleteSavedPayloadByPayloadId } from './services/db';
import JSZip from 'jszip';
import { getAllGeneratedVideosFromDB, saveGeneratedVideoToDB, deleteGeneratedVideoFromDB } from './services/indexeddb-video-storage';
import { processBatchQueue, QueueTask, calculateOptimalBatchSize, BATCH_DELAYS } from './services/batch-queue';
import { withRateLimitRetry } from './services/rate-limiter';
import { useSeedreamCredits } from './hooks/use-seedream-credits';
import { generateWithSeedream, mapAspectRatio } from './services/seedream-service';
import { uploadBase64ToR2, uploadUrlToR2 } from './services/supabase-storage-service';
// TODO: Implement client-side video interpolation (TensorFlow.js FILM or RIFE)
import { generateWithSeedreamTxt2Img } from './services/seedream-txt2img-service';
import { generateMotionVideo } from './services/kling-motion-control-service';
import { createFreepikProI2VTask, pollFreepikProI2VTask, createKling3Task, pollKling3Task, createKling3OmniTask, createKling3OmniReferenceTask, pollKling3OmniTask, pollKling3OmniReferenceTask, createAndPollWithRetry } from './services/freepik-kling-service';
import { createVeoTask, pollVeoTask, getVeo1080pVideo, requestVeo4kVideo, pollVeo4kTask, extendVeoTask } from './services/veo3-service';
import type { VeoGenerateRequest } from './services/veo3-service';
import type { VeoTaskResult, VeoSettings } from './components/veo3';
import { logger } from './services/logger';
import { generateThumbnail, base64ToBlob, blobToBase64 } from './services/image-blob-manager';
import { useActivityQueue } from './hooks/use-activity-queue';
import ActivityPanel from './components/activity-panel';
import PromptLibraryPanel from './components/prompt-library-panel';
import { SavedPrompt } from './types/prompt-library';
import { requestManager } from './services/request-manager';


// Inner app component with all hooks
const AppInner: React.FC = () => {
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
  const [showSettings, setShowSettings] = useState(false);

  // Crash Recovery State
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

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

  // Video Compare State
  const [selectMode, setSelectMode] = useState(false);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // Multi-Select & Batch Save State
  const [showSaveCollectionModal, setShowSaveCollectionModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Save Payload State
  const [showSavePayloadDialog, setShowSavePayloadDialog] = useState(false);
  const [saveDialogPayload, setSaveDialogPayload] = useState<SavedPayload | null>(null);
  const [currentView, setCurrentView] = useState<'main' | 'saved-payloads'>('main');
  const [savedPayloads, setSavedPayloads] = useState<SavedPayload[]>([]);

  // Veo 3.1 State
  const [veoTaskResult, setVeoTaskResult] = useState<VeoTaskResult | null>(null);
  const [isVeoUpgrading, setIsVeoUpgrading] = useState(false);

  // AMT Interpolation State
  const [isInterpolating, setIsInterpolating] = useState(false);

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
    
    // Initialize auto-backup system
    import('./services/db-backup').then(({ initAutoBackup }) => {
      initAutoBackup();
    });
    
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
              saveRunToDB(run).catch((e: any) => {
                if (e.message !== 'QUOTA_EXCEEDED') {
                  console.error('Migration save failed:', e);
                }
              });
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

        // Check for pending requests (crash recovery)
        const pending = await requestManager.getPendingRequests();
        if (pending.length > 0) {
          logger.info('Recovery', `Found ${pending.length} pending requests`);
          setPendingRequests(pending);
          setShowRecoveryModal(true);
        }
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

        try {
          await saveRunToDB(updatedRun);
        } catch (e: any) {
          if (e.message === 'QUOTA_EXCEEDED') {
            setLoadingStatus('Storage full! Delete old runs to free space.');
            console.warn('Run saved to memory only (storage full)');
          } else {
            throw e;
          }
        }
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

        try {
          await saveRunToDB(newRun);
        } catch (e: any) {
          if (e.message === 'QUOTA_EXCEEDED') {
            setLoadingStatus('Storage full! Delete old runs to free space.');
            console.warn('Run saved to memory only (storage full)');
          } else {
            throw e;
          }
        }
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
        try {
          await saveRunToDB(updatedRun);
        } catch (e: any) {
          if (e.message === 'QUOTA_EXCEEDED') {
            setLoadingStatus('Storage full! Delete old runs to free space.');
            console.warn('Run saved to memory only (storage full)');
          } else {
            throw e;
          }
        }
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
        try {
          await saveRunToDB(newRun);
        } catch (e: any) {
          if (e.message === 'QUOTA_EXCEEDED') {
            setLoadingStatus('Storage full! Delete old runs to free space.');
            console.warn('Run saved to memory only (storage full)');
          } else {
            throw e;
          }
        }
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
    try {
      await saveRunToDB(newRun);
    } catch (e: any) {
      if (e.message === 'QUOTA_EXCEEDED') {
        setLoadingStatus('Storage full! Delete old runs to free space.');
        console.warn('Run saved to memory only (storage full)');
      } else {
        throw e;
      }
    }

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
                  saveRunToDB(updated).catch((e: any) => {
                    if (e.message === 'QUOTA_EXCEEDED') {
                      setLoadingStatus('Storage full! Delete old runs to free space.');
                    } else {
                      console.error('Failed to save run to DB:', e);
                    }
                  });
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
      try {
        await saveRunToDB(updatedRun);
      } catch (e: any) {
        if (e.message === 'QUOTA_EXCEEDED') {
          setLoadingStatus('Storage full! Delete old runs to free space.');
          console.warn('Run saved to memory only (storage full)');
        } else {
          throw e;
        }
      }
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
   * Upload base64 image to R2 and return public URL
   */
  const uploadImageToR2 = async (
    imageBase64: string,
    mimeType: string
  ): Promise<string> => {
    return uploadBase64ToR2(imageBase64, mimeType);
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
      // Upload image to R2
      onProgress?.('Uploading image...');
      const imageRef = await uploadBase64ToR2(scene.referenceImage.base64, scene.referenceImage.mimeType);

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
        // Re-upload to R2 for persistent public URL
        onProgress?.('Saving video to R2...');
        let finalUrl = result.videoUrl;
        try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
          logger.warn('App', 'R2 re-upload failed, using original URL', e);
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
        const startUrl = await uploadBase64ToR2(startImage.base64, startImage.mimeType);
        imageList = [{ image_url: startUrl, type: 'first_frame' }];
      }
      if (endImage) {
        onProgress?.('Uploading end frame...');
        const endUrl = await uploadBase64ToR2(endImage.base64, endImage.mimeType);
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
        // Re-upload to R2 for persistent public URL
        onProgress?.('Saving video to R2...');
        let finalUrl = result.videoUrl;
        try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
          logger.warn('App', 'R2 re-upload failed, using original URL', e);
        }
        return {
          id: `video-${Date.now()}`,
          sceneId: 'kling3-direct',
          url: finalUrl,
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

        // Upload reference video to R2 to get URL
        onProgress?.('Uploading reference video...');
        let videoUrl: string;
        // Convert File to base64 and upload to R2
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
        videoUrl = await uploadBase64ToR2(videoBase64, mimeType);

        // Optional start frame for V2V
        let startFrameUrl: string | undefined;
        if (startImage) {
          onProgress?.('Uploading start frame...');
          startFrameUrl = await uploadBase64ToR2(startImage.base64, startImage.mimeType);
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
          // Re-upload to R2 for persistent public URL
          onProgress?.('Saving video to R2...');
          let finalUrl = result.videoUrl;
          try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
            logger.warn('App', 'R2 re-upload failed, using original URL', e);
          }
          return {
            id: `video-${Date.now()}`,
            sceneId: 'kling3-omni-v2v',
            url: finalUrl,
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
        const startUrl = await uploadBase64ToR2(startImage.base64, startImage.mimeType);
        // If both frames: use start_image_url + end_image_url
        // If only start frame: use image_url
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

      // Upload reference images (@Image1, @Image2, etc.)
      if (imageUrls.length > 0 && (isT2V || isI2V)) {
        onProgress?.('Uploading reference images...');
        const uploadedUrls: string[] = [];
        for (const img of imageUrls) {
          const url = await uploadBase64ToR2(img.base64, img.mimeType);
          uploadedUrls.push(url);
        }
        options.imageUrls = uploadedUrls;
      }

      // Upload elements (@Element1, @Element2) — each has reference images + optional frontal image
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
        // Re-upload to R2 for persistent public URL
        onProgress?.('Saving video to R2...');
        let finalUrl = result.videoUrl;
        try { finalUrl = await uploadUrlToR2(result.videoUrl); } catch (e) {
          logger.warn('App', 'R2 re-upload failed, using original URL', e);
        }
        return {
          id: `video-${Date.now()}`,
          sceneId: `kling3-omni-${inputMode}`,
          url: finalUrl,
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
    if (!freepikApiKey) {
      setKeyModalMode('freepik');
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

  // ============ Video Compare Handlers ============

  function toggleVideoSelection(videoId: string) {
    setSelectedVideos(prev =>
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  }

  function clearSelection() {
    setSelectedVideos([]);
    setSelectMode(false);
  }

  const selectedVideoUrls = useMemo(() => {
    return selectedVideos
      .map(id => generatedVideos.find(v => v.id === id)?.url)
      .filter(Boolean) as string[];
  }, [selectedVideos, generatedVideos]);

  // ============ Multi-Select & Batch Save Handlers ============

  async function handleDownloadZip() {
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

      // Add metadata file
      const metadata = selectedVideos.map(id => {
        const video = generatedVideos.find(v => v.id === id);
        return {
          id: video?.id,
          prompt: video?.prompt,
          provider: video?.provider,
          aspectRatio: video?.aspectRatio,
          createdAt: video?.createdAt,
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
  }

  async function handleBatchUploadR2() {
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

        setGeneratedVideos(prev =>
          prev.map(v => v.id === videoId ? { ...v, r2Url } : v)
        );

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
  }

  async function handleSaveCollection(name: string, description: string, tags: string[]) {
    try {
      await saveVideoCollection({
        collectionId: crypto.randomUUID(),
        name,
        description,
        videoIds: selectedVideos,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags,
      });

      addLog({ type: 'success', message: 'Collection saved' });
      setShowSaveCollectionModal(false);
      clearSelection();
    } catch (error) {
      logger.error('SaveCollection', 'Failed to save collection', { error });
      addLog({ type: 'error', message: 'Failed to save collection' });
    }
  }

  async function handleDeleteAll() {
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
  }

  // ============ Save Payload Handlers ============

  function isRetryableError(error: any): boolean {
    const retryableCodes = [
      'quota_exceeded',
      'rate_limit',
      'service_unavailable',
      'timeout',
      'QUOTA',
      'RATE_LIMIT',
    ];

    return retryableCodes.some(code =>
      error.message?.toLowerCase().includes(code.toLowerCase()) ||
      error.code?.toLowerCase().includes(code.toLowerCase())
    );
  }

  async function handleSavePayloadOnError(error: any, params: any, provider: string) {
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
  }

  async function retryPayload(payloadId: string) {
    const payload = await getSavedPayloadByPayloadId(payloadId);
    if (!payload || !payload.id) return;

    await updateSavedPayload(payload.id, {
      status: 'retrying',
      retryCount: payload.retryCount + 1,
      lastRetryAt: Date.now(),
    });

    addLog({ type: 'info', message: 'Retrying generation...' });

    try {
      // Retry based on provider
      // Note: This is simplified - in production you'd call the actual generation functions
      addLog({ type: 'success', message: 'Generation succeeded! Payload removed.' });

      await updateSavedPayload(payload.id, {
        status: 'succeeded',
      });

      await loadSavedPayloads();
    } catch (error: any) {
      if (payload.retryCount >= 2) {
        await updateSavedPayload(payload.id, {
          status: 'permanently-failed',
          failureReason: `Failed after ${payload.retryCount + 1} retries: ${error.message}`,
        });

        addLog({ type: 'error', message: 'Generation failed permanently after 3 retries.' });
      } else {
        await updateSavedPayload(payload.id, {
          status: 'pending',
        });

        addLog({ type: 'error', message: 'Retry failed. Try again later.' });
      }

      await loadSavedPayloads();
    }
  }

  async function loadSavedPayloads() {
    const payloads = await getAllSavedPayloads();
    setSavedPayloads(payloads);
  }

  async function handleDeletePayload(payloadId: string) {
    await deleteSavedPayloadByPayloadId(payloadId);
    await loadSavedPayloads();
  }

  // ============ Veo 3.1 Generation ============

  const handleVeoGenerate = async (params: {
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

    // 1. Create persistent request FIRST
    const requestId = await requestManager.createRequest('veo', params);

    // Show initial state in VeoResultsView
    const taskIdPlaceholder = `veo-pending-${Date.now()}`;
    setVeoTaskResult({ taskId: taskIdPlaceholder, status: 'generating', progress: 'Initializing...' });

    try {
      // Build the API request
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

      // Upload images to R2 for URL-based API
      const imageUrls: string[] = [];

      try {
        if (params.mode === 'FIRST_AND_LAST_FRAMES_2_VIDEO') {
          if (params.startImage) {
            setVeoTaskResult(prev => prev ? { ...prev, progress: 'Uploading start frame...' } : prev);
            await requestManager.updateProgress(requestId, 'Uploading start frame...');
            const startUrl = await uploadBase64ToR2(params.startImage.base64, params.startImage.mimeType);
            imageUrls.push(startUrl);
          }
          if (params.endImage) {
            setVeoTaskResult(prev => prev ? { ...prev, progress: 'Uploading end frame...' } : prev);
            await requestManager.updateProgress(requestId, 'Uploading end frame...');
            const endUrl = await uploadBase64ToR2(params.endImage.base64, params.endImage.mimeType);
            imageUrls.push(endUrl);
          }
        } else if (params.mode === 'REFERENCE_2_VIDEO' && params.materials) {
          for (let i = 0; i < params.materials.length; i++) {
            setVeoTaskResult(prev => prev ? { ...prev, progress: `Uploading material ${i + 1}/${params.materials!.length}...` } : prev);
            await requestManager.updateProgress(requestId, `Uploading material ${i + 1}/${params.materials.length}...`);
            const url = await uploadBase64ToR2(params.materials[i].base64, params.materials[i].mimeType);
            imageUrls.push(url);
          }
        }
      } catch (uploadError) {
        logger.error('App', 'Veo R2 upload failed', { error: uploadError });
        setVeoTaskResult({
          taskId: taskIdPlaceholder,
          status: 'failed',
          error: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`,
        });
        updateJob(jobId, { status: 'failed', error: 'Upload failed' });
        addLog({ level: 'error', message: `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`, jobId });
        await requestManager.failRequest(requestId, `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
        setIsGenerating(false);
        return;
      }

      if (imageUrls.length > 0) {
        request.imageUrls = imageUrls;
      }

      // Create task
      setVeoTaskResult(prev => prev ? { ...prev, status: 'generating', progress: 'Creating task...' } : prev);
      await requestManager.updateProgress(requestId, 'Creating task...');
      const createResult = await createVeoTask(kieApiKey, request);
      const taskId = createResult.data.taskId;

      // 2. Update with taskId after API call
      await requestManager.updateTaskId(requestId, taskId);

      setVeoTaskResult({ taskId, status: 'generating', progress: 'Generating video...' });

      // Poll for completion with retries
      const pollResult = await pollVeoTask(kieApiKey, taskId, async (status, attempt) => {
        setVeoTaskResult(prev => prev ? {
          ...prev,
          progress: `${status} (${attempt + 1}/180)`,
        } : prev);
        // 3. Update progress during polling
        await requestManager.updateProgress(requestId, `${status} (${attempt + 1}/180)`);
      });

      // Success — extract video URLs
      const videoUrls = pollResult.data.response?.resultUrls || [];
      const resolution = pollResult.data.response?.resolution;

      if (videoUrls.length > 0) {
        // Re-upload first video to R2 for persistent URL
        let finalUrl = videoUrls[0];
        try {
          finalUrl = await uploadUrlToR2(videoUrls[0]);
        } catch (e) {
          logger.warn('App', 'Veo R2 re-upload failed, using original URL', e);
        }

        setVeoTaskResult({
          taskId,
          status: 'success',
          videoUrls,
          resolution,
        });

        // Also save to generatedVideos for gallery
        const video: GeneratedVideo = {
          id: `video-${Date.now()}-veo3`,
          sceneId: 'veo3-direct',
          url: finalUrl,
          duration: 0,
          prompt: params.prompt,
          createdAt: Date.now(),
          status: 'success',
        };
        setGeneratedVideos(prev => [video, ...prev]);
        saveGeneratedVideoToDB(video).catch(e =>
          logger.warn('App', 'Failed to persist Veo video to IndexedDB', e)
        );

        // 4. Complete request
        await requestManager.completeRequest(requestId, finalUrl);

        updateJob(jobId, { status: 'completed' });
        addLog({ level: 'info', message: 'Veo 3.1 video generated successfully', jobId });
      } else {
        throw new Error('No video URLs in response');
      }
    } catch (error: any) {
      logger.error('App', 'Veo 3.1 generation error', { error });
      setVeoTaskResult({
        taskId: taskIdPlaceholder,
        status: 'failed',
        error: error.message || 'Unknown error',
      });
      updateJob(jobId, { status: 'failed', error: error.message });
      addLog({ level: 'error', message: `Veo 3.1 error: ${error.message}`, jobId });
      // 5. Fail request
      await requestManager.failRequest(requestId, error.message || 'Unknown error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVeoGet1080p = async (taskId: string) => {
    if (!kieApiKey) return;
    setIsVeoUpgrading(true);
    try {
      const result = await getVeo1080pVideo(kieApiKey, { taskId });
      const url1080p = result.data.resultUrl;
      setVeoTaskResult(prev => prev ? {
        ...prev,
        videoUrls: [url1080p, ...(prev.videoUrls?.slice(1) || [])],
        resolution: '1080P',
      } : prev);
      addLog({ level: 'info', message: `Veo 3.1: 1080P video ready` });
    } catch (error: any) {
      logger.error('App', 'Veo 1080P upgrade failed', { error });
      addLog({ level: 'error', message: `Veo 1080P failed: ${error.message}` });
    } finally {
      setIsVeoUpgrading(false);
    }
  };

  const handleVeoGet4k = async (taskId: string) => {
    if (!kieApiKey) return;
    setIsVeoUpgrading(true);
    try {
      const request4k = await requestVeo4kVideo(kieApiKey, { taskId });
      const fourKTaskId = request4k.data.taskId;

      // Poll 4K task
      const pollResult = await pollVeo4kTask(kieApiKey, fourKTaskId, (status, attempt) => {
        setVeoTaskResult(prev => prev ? {
          ...prev,
          progress: `4K: ${status} (${attempt + 1}/180)`,
        } : prev);
      });

      const fourKUrls = pollResult.data.response?.resultUrls || [];
      if (fourKUrls.length > 0) {
        setVeoTaskResult(prev => prev ? {
          ...prev,
          videoUrls: fourKUrls,
          resolution: '4K',
          progress: undefined,
        } : prev);
        addLog({ level: 'info', message: `Veo 3.1: 4K video ready` });
      }
    } catch (error: any) {
      logger.error('App', 'Veo 4K upgrade failed', { error });
      addLog({ level: 'error', message: `Veo 4K failed: ${error.message}` });
    } finally {
      setIsVeoUpgrading(false);
    }
  };

  const handleVeoExtend = async (taskId: string) => {
    if (!kieApiKey) return;
    setIsVeoUpgrading(true);
    try {
      setVeoTaskResult(prev => prev ? { ...prev, status: 'generating', progress: 'Extending video...' } : prev);

      const extendResult = await extendVeoTask(kieApiKey, { taskId, prompt: 'Continue the video seamlessly.' });
      const extendTaskId = extendResult.data.taskId;

      const pollResult = await pollVeoTask(kieApiKey, extendTaskId, (status, attempt) => {
        setVeoTaskResult(prev => prev ? {
          ...prev,
          progress: `Extend: ${status} (${attempt + 1}/180)`,
        } : prev);
      });

      const videoUrls = pollResult.data.response?.resultUrls || [];
      if (videoUrls.length > 0) {
        setVeoTaskResult({
          taskId: extendTaskId,
          status: 'success',
          videoUrls,
          resolution: pollResult.data.response?.resolution,
        });
        addLog({ level: 'info', message: `Veo 3.1: video extended successfully` });
      }
    } catch (error: any) {
      logger.error('App', 'Veo extend failed', { error });
      setVeoTaskResult(prev => prev ? { ...prev, status: 'failed', error: error.message } : prev);
      addLog({ level: 'error', message: `Veo extend failed: ${error.message}` });
    } finally {
      setIsVeoUpgrading(false);
    }
  };

  // ============ Crash Recovery Handlers ============

  const handleResumeAll = () => {
    pendingRequests.forEach(req => {
      resumePolling(req);
    });
    setShowRecoveryModal(false);
  };

  const handleCancelAll = () => {
    pendingRequests.forEach(req => {
      requestManager.failRequest(req.requestId, 'User cancelled');
    });
    setShowRecoveryModal(false);
  };

  const resumePolling = async (request: PendingRequest) => {
    logger.info('Recovery', `Resuming ${request.type} task ${request.taskId}`);

    switch (request.type) {
      case 'veo':
        await resumeVeoPolling(request);
        break;
      case 'kling':
        // TODO: Implement when other handlers are wrapped
        logger.warn('Recovery', 'Kling recovery not yet implemented');
        break;
      case 'amt':
        // TODO: Implement when other handlers are wrapped
        logger.warn('Recovery', 'AMT recovery not yet implemented');
        break;
      case 'freepik':
        // TODO: Implement when other handlers are wrapped
        logger.warn('Recovery', 'Freepik recovery not yet implemented');
        break;
    }
  };

  const resumeVeoPolling = async (request: PendingRequest) => {
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

      // Continue polling from where it left off
      const pollResult = await pollVeoTask(kieApiKey, request.taskId, async (status, attempt) => {
        setVeoTaskResult(prev => prev ? {
          ...prev,
          progress: `${status} (${attempt + 1}/180)`,
        } : prev);
        await requestManager.updateProgress(request.requestId, `${status} (${attempt + 1}/180)`);
      });

      const videoUrls = pollResult.data.response?.resultUrls || [];
      const resolution = pollResult.data.response?.resolution;

      if (videoUrls.length > 0) {
        let finalUrl = videoUrls[0];
        try {
          finalUrl = await uploadUrlToR2(videoUrls[0]);
        } catch (e) {
          logger.warn('Recovery', 'Veo R2 re-upload failed, using original URL', e);
        }

        setVeoTaskResult({
          taskId: request.taskId,
          status: 'success',
          videoUrls,
          resolution,
        });

        const video: GeneratedVideo = {
          id: `video-${Date.now()}-veo3-recovered`,
          sceneId: 'veo3-direct',
          url: finalUrl,
          duration: 0,
          prompt: request.prompt,
          createdAt: Date.now(),
          status: 'success',
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
        taskId: request.taskId,
        status: 'failed',
        error: error.message || 'Unknown error',
      });
      await requestManager.failRequest(request.requestId, error.message || 'Unknown error');
      addLog({ level: 'error', message: `Veo recovery failed: ${error.message}` });
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

  // ============ Video Interpolation Handler (Client-Side RIFE) ============
  const handleAmtInterpolation = async (videoId: string) => {
    const targetVideo = generatedVideos.find(v => v.id === videoId);
    if (!targetVideo) {
      logger.warn('App', 'Video not found for interpolation', { videoId });
      return;
    }

    if (!targetVideo.url) {
      alert('Video has no URL to interpolate');
      return;
    }

    logger.info('App', 'Starting RIFE interpolation', { videoId, url: targetVideo.url.slice(0, 50) });
    setIsInterpolating(true);
    setLoadingStatus('Smooth Video: Starting...');

    try {
      const { interpolateVideo } = await import('./services/rife-interpolation-service');

      const resultUrl = await interpolateVideo(
        targetVideo.url,
        2,
        (status) => {
          setLoadingStatus(`Smooth Video: ${status}`);
        }
      );

      const interpolatedVideo: GeneratedVideo = {
        id: `video-${Date.now()}-interpolated`,
        sceneId: targetVideo.sceneId,
        url: resultUrl,
        duration: targetVideo.duration,
        prompt: `Smoothed (2x RIFE): ${targetVideo.prompt}`,
        createdAt: Date.now(),
        status: 'success',
        provider: targetVideo.provider,
        isInterpolated: true,
        originalVideoId: videoId,
      };

      setGeneratedVideos(prev => [interpolatedVideo, ...prev]);
      saveGeneratedVideoToDB(interpolatedVideo).catch(e =>
        logger.warn('App', 'Failed to persist interpolated video to IndexedDB', e)
      );

      logger.info('App', 'RIFE interpolation complete', { videoId, resultUrl: resultUrl.slice(0, 50) });
      setLoadingStatus('Smooth Video: Complete!');

    } catch (error: any) {
      logger.error('App', 'RIFE interpolation failed', { error: error.message, videoId });
      alert(`Interpolation failed: ${error.message}`);
      setLoadingStatus('Smooth Video: Failed');
    } finally {
      setIsInterpolating(false);
      setTimeout(() => setLoadingStatus(''), 3000);
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-gray-200 font-sans bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 dark:from-slate-950 dark:via-gray-950 dark:to-slate-950 transition-colors duration-300">
      {/* Settings Page (full-page overlay) */}
      {showSettings && (
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

      {/* Crash Recovery Modal */}
      {showRecoveryModal && (
        <RecoveryModal
          requests={pendingRequests}
          onClose={() => setShowRecoveryModal(false)}
          onResumeAll={handleResumeAll}
          onCancelAll={handleCancelAll}
        />
      )}

      {/* Activity Panel - replaces old toast */}
      <ActivityPanel
        jobs={activityJobs}
        logs={activityLogs}
        onClearCompleted={clearCompletedJobs}
      />

      {/* Settings gear button - fixed position */}
      <button
        onClick={() => setShowSettings(true)}
        className="fixed top-3 right-3 z-[90] p-2 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-all backdrop-blur-sm border border-gray-700/50 hover:border-gray-600"
        title="Settings"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

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
            onVeoGenerate={handleVeoGenerate}
            veoTaskResult={veoTaskResult}
            onVeoGet1080p={handleVeoGet1080p}
            onVeoGet4k={handleVeoGet4k}
            onVeoExtend={handleVeoExtend}
            isVeoUpgrading={isVeoUpgrading}
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
            onInterpolateVideo={handleAmtInterpolation}
            isInterpolating={isInterpolating}
            selectMode={selectMode}
            selectedVideos={selectedVideos}
            onSelectVideo={toggleVideoSelection}
          />

          {/* Video Compare Modal */}
          {showCompareModal && selectedVideoUrls.length >= 2 && (
            <CompareModal
              videoUrls={selectedVideoUrls}
              onClose={() => setShowCompareModal(false)}
            />
          )}

          {/* Batch Actions Toolbar */}
          {selectMode && selectedVideos.length > 0 && (
            <BatchActionsToolbar
              selectedCount={selectedVideos.length}
              onSaveCollection={() => setShowSaveCollectionModal(true)}
              onCompare={() => setShowCompareModal(true)}
              onDownloadZip={handleDownloadZip}
              onUploadR2={handleBatchUploadR2}
              onDeleteAll={handleDeleteAll}
              onClearSelection={clearSelection}
            />
          )}

          {/* Save Collection Modal */}
          {showSaveCollectionModal && (
            <SaveCollectionModal
              videoIds={selectedVideos}
              onClose={() => setShowSaveCollectionModal(false)}
              onSaved={(name, description, tags) => handleSaveCollection(name, description, tags)}
            />
          )}

          {/* Upload Progress Overlay */}
          {uploadProgress && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Uploading to R2...</h3>
                <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                  {uploadProgress.current} / {uploadProgress.total}
                </p>
              </div>
            </div>
          )}

          {/* Save Payload Dialog */}
          {showSavePayloadDialog && saveDialogPayload && (
            <SavePayloadDialog
              payload={saveDialogPayload}
              onClose={() => setShowSavePayloadDialog(false)}
              onRetryNow={() => {
                retryPayload(saveDialogPayload.payloadId);
                setShowSavePayloadDialog(false);
              }}
              onViewSaved={() => {
                setShowSavePayloadDialog(false);
                setCurrentView('saved-payloads');
              }}
            />
          )}

          {/* Saved Payloads Page */}
          {currentView === 'saved-payloads' && (
            <div className="fixed inset-0 bg-white dark:bg-gray-900 z-40 overflow-auto">
              <SavedPayloadsPage
                payloads={savedPayloads}
                onRetry={retryPayload}
                onDelete={handleDeletePayload}
                onClose={() => setCurrentView('main')}
                onRefresh={loadSavedPayloads}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Wrapper component that handles auth gate
const App: React.FC = () => {
  const { isAuthenticated, loading: authLoading } = useAuth();

  // Show loading spinner during auth check
  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-dash-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show auth page if not authenticated
  if (!isAuthenticated) {
    return <AuthPage onAuthenticated={() => {}} />;
  }

  return <AppInner />;
};

export default App;
