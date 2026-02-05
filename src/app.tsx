import React, { useState, useEffect, useRef } from 'react';
import LeftPanel from './components/left-panel';
import RightPanel from './components/right-panel';
import ApiKeyModal from './components/api-key-modal';
import ModifyImageModal from './components/modify-image-modal';
import { AppSettings, Run, GeneratedImage, PromptItem, ReferenceImage } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { generateImage, modifyImage } from './services/gemini-service';
import { getAllRunsFromDB, saveRunToDB, deleteRunFromDB } from './services/db';
import { processBatchQueue, QueueTask, calculateOptimalBatchSize } from './services/batch-queue';
import { withRateLimitRetry } from './services/rate-limiter';
import { useSeedreamCredits } from './hooks/use-seedream-credits';
import { generateWithSeedream, mapAspectRatio } from './services/seedream-service';
import { logger } from './services/logger';

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

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setLoadingStatus('Cancelled');
      setTimeout(() => setLoadingStatus(''), 2000);
    }
  };

  // --- RETRY LOGIC ---
  const handleRetry = async (image: GeneratedImage) => {
    if (isGenerating || !apiKey) return;

    logger.info('App', 'Retrying generation', { imageId: image.id });
    setIsGenerating(true);
    setLoadingStatus(`Retrying generation...`);
    abortControllerRef.current = new AbortController();

    try {
      // NOTE: Retrying currently uses the EXACT text prompt from history.
      // It does NOT re-upload original reference images because we didn't store them in DB
      // to save space. A robust solution would store ref images in IndexedDB.
      // For this version, retries are Text + Settings only unless re-constructed.

      const result = await generateImage({
        prompt: image.promptUsed,
        referenceImages: [], // Cannot retrieve old images easily without blowing up DB size
        settings: image.settingsSnapshot,
        apiKey: apiKey,
        signal: abortControllerRef.current.signal
      });

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
      logger.info('App', 'Retry successful', { newRunId: newRun.id });
      setLoadingStatus(`Retry Successful!`);

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
  const handleModifyImage = async (prompt: string, additionalRefs: ReferenceImage[]) => {
    if (!modifyingImage || !apiKey) return;

    logger.info('App', 'Modifying image', { sourceId: modifyingImage.id });
    setIsModifying(true);
    setLoadingStatus('Modifying image...');

    try {
      const result = await modifyImage({
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

    // Spicy Mode requires at least one reference image
    const globalRefs = settings.globalReferenceImages || [];
    if (isSpicyMode) {
      for (const item of validItems) {
        if (item.referenceImages.length + globalRefs.length === 0) {
          logger.warn('App', 'Spicy Mode requires reference image', { prompt: item.text.slice(0, 30) });
          alert(`Spicy Mode requires at least one reference image per prompt. Add an image to "${item.text.slice(0, 30)}..."`);
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

    const batchSize = isSpicyMode ? Math.min(5, calculateOptimalBatchSize(taskQueue.length)) : calculateOptimalBatchSize(taskQueue.length);
    setLoadingStatus(`Queued ${taskQueue.length} images${isSpicyMode ? ' (Spicy)' : ''} (batches of ${batchSize})...`);

    // Process with batch queue
    try {
      await processBatchQueue(
        taskQueue,
        async (task) => {
          if (isSpicyMode) {
            // Use Seedream service
            if (task.refs.length === 0) {
              throw new Error('Spicy Mode requires at least one reference image');
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
                setLoadingStatus(`🌶️ ${stage}: ${detail || ''}`);
              }
            );
            // Convert to GeneratedImage format
            const generatedImage: GeneratedImage = {
              id: crypto.randomUUID(),
              base64: result.base64,
              mimeType: result.mimeType,
              createdAt: Date.now(),
              promptUsed: task.prompt,
              settingsSnapshot: task.settings
            };
            return generatedImage;
          } else {
            // Use Gemini service
            return withRateLimitRetry(
              () => generateImage({
                prompt: task.prompt,
                referenceImages: task.refs,
                settings: task.settings,
                apiKey: effectiveApiKey,
                signal: abortControllerRef.current?.signal
              }),
              { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 30000 }
            );
          }
        },
        {
          batchSize,
          batchDelayMs: isSpicyMode ? 1000 : 3000, // Faster for Seedream (rate limiter handles it)
          signal: abortControllerRef.current.signal,
          onProgress: (completed, total, batchNum, totalBatches) => {
            const prefix = isSpicyMode ? '🌶️ ' : '';
            setLoadingStatus(`${prefix}Batch ${batchNum}/${totalBatches}: ${completed}/${total} images`);
          },
          onResult: (result) => {
            // Update run with new image incrementally
            setRuns(prev => prev.map(r => {
              if (r.id === newRunId) {
                const updated = { ...r, images: [...r.images, result] };
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
          }
        }
      );
      logger.info('App', `Generation complete`, { mode: isSpicyMode ? 'spicy' : 'gemini' });
      setLoadingStatus(isSpicyMode ? "🌶️ Done!" : "Done!");

      // Refresh credits after batch completes (Spicy Mode only)
      if (isSpicyMode) {
        refreshCredits();
      }

    } catch (err: any) {
      if (err.message === 'Aborted') {
        logger.info('App', 'Generation cancelled by user');
        setLoadingStatus("Cancelled");
      } else {
        logger.error('App', 'Batch generation error', err);
        setLoadingStatus("Error during batch generation");
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
      />

      {/* Toast */}
      {loadingStatus && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-2 bg-dash-900/90 text-dash-100 rounded-full border border-dash-300 shadow-lg backdrop-blur animate-pulse font-mono text-sm">
          {loadingStatus}
        </div>
      )}

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
            onStop={handleStop}
            onOpenApiKey={() => {
              setKeyModalMode('gemini');
              setIsKeyModalOpen(true);
            }}
            onOpenSpicyKey={() => {
              setKeyModalMode('spicy');
              setIsKeyModalOpen(true);
            }}
            hasApiKey={!!apiKey}
            hasKieApiKey={!!kieApiKey}
            credits={credits}
            creditsLoading={creditsLoading}
            creditsError={creditsError}
            isLowCredits={isLowCredits}
            isCriticalCredits={isCriticalCredits}
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
          />
        </>
      )}
    </div>
  );
};

export default App;
