import React, { useState, useEffect, useRef } from 'react';
import LeftPanel from './components/LeftPanel';
import RightPanel from './components/RightPanel';
import ApiKeyModal from './components/ApiKeyModal';
import { AppSettings, Run, GeneratedImage, PromptItem } from './types';
import { DEFAULT_SETTINGS } from './constants';
import { generateImage } from './services/geminiService';
import { getAllRunsFromDB, saveRunToDB, deleteRunFromDB } from './services/db';

const App: React.FC = () => {
  // State: Settings & Inputs
  const [prompts, setPrompts] = useState<PromptItem[]>([
    { id: crypto.randomUUID(), text: '', referenceImages: [] }
  ]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiKey, setApiKey] = useState('');
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  // State: Data
  const [runs, setRuns] = useState<Run[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // State: UI
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // Refs
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initial Load
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load API Key
        const savedKey = localStorage.getItem('raw_studio_api_key');
        if (savedKey) setApiKey(savedKey);
        else setIsKeyModalOpen(true); // Prompt if missing

        // Load Settings
        const savedSettings = localStorage.getItem('raw_studio_settings');
        if (savedSettings) {
          try {
            const parsed = JSON.parse(savedSettings);
            setSettings(prev => ({
              ...prev,
              ...parsed,
              globalReferenceImages: parsed.globalReferenceImages || [] // Restore images if saved? Maybe risky if huge.
            }));
          } catch (e) {
            console.warn("Failed to parse settings, using defaults");
          }
        }

        const dbRuns = await getAllRunsFromDB();
        setRuns(dbRuns);
      } catch (e) {
        console.error("Failed to load data", e);
      } finally {
        setIsDbLoaded(true);
      }
    };
    loadData();
  }, []);

  // Save Settings to LocalStorage
  useEffect(() => {
    localStorage.setItem('raw_studio_settings', JSON.stringify(settings));
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
      setLoadingStatus(`Retry Successful!`);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        alert(`Retry failed: ${err.message}`);
        setLoadingStatus('Failed');
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => setLoadingStatus(''), 2000);
      abortControllerRef.current = null;
    }
  };

  // --- RATE LIMITED QUEUE LOGIC ---
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleGenerate = async () => {
    if (!apiKey) {
      setIsKeyModalOpen(true);
      return;
    }

    const validItems = prompts.filter(p => p.text.trim().length > 0);
    if (validItems.length === 0) {
      alert("Please enter at least one prompt.");
      return;
    }

    const globalRefs = settings.globalReferenceImages || [];
    for (const item of validItems) {
      if (item.referenceImages.length + globalRefs.length > 7) {
        alert(`Error: Prompt "${item.text.slice(0, 20)}..." exceeds 7 reference images limit.`);
        return;
      }
    }

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const newRunId = crypto.randomUUID();
    const countPerPrompt = settings.outputCount || 1;

    // Construct summary
    const summaryPrompt = validItems.map(p => p.text).join(' || ');
    const hasRefs = validItems.some(p => p.referenceImages.length > 0) || globalRefs.length > 0;
    const finalPromptSummary = validItems.length > 1
      ? `${validItems.length} Prompts. First: ${validItems[0].text.slice(0, 50)}...`
      : validItems[0].text + (settings.appendStyleHint ? ` (+Style)` : '') + (hasRefs ? ` (+Images)` : '');

    const newRun: Run = {
      id: newRunId,
      name: `Run #${runs.length + 1}`,
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
    const taskQueue: { prompt: string, refs: any[], settings: any }[] = [];
    validItems.forEach(item => {
      let finalPrompt = item.text.trim();
      if (settings.appendStyleHint && settings.styleHintRaw.trim()) {
        finalPrompt += `\n\nSTYLE HINT:\n${settings.styleHintRaw.trim()}`;
      }
      const allRefs = [...globalRefs, ...item.referenceImages];

      for (let i = 0; i < countPerPrompt; i++) {
        taskQueue.push({ prompt: finalPrompt, refs: allRefs, settings: settings });
      }
    });

    setLoadingStatus(`Queued ${taskQueue.length} images...`);

    // Process Queue
    const RATE_DELAY_MS = 3100; // ~20 per min
    let processedCount = 0;
    const accumulatedImages: GeneratedImage[] = []; // Local tracker

    try {
      for (const task of taskQueue) {
        if (signal.aborted) throw new Error('Aborted');

        const startTime = Date.now();
        setLoadingStatus(`Generating ${processedCount + 1}/${taskQueue.length}...`);

        try {
          const result = await generateImage({
            prompt: task.prompt,
            referenceImages: task.refs,
            settings: task.settings,
            apiKey: apiKey,
            signal: signal
          });

          accumulatedImages.push(result);

          // Update UI State
          setRuns(prev => prev.map(r => {
            if (r.id === newRunId) {
              return { ...r, images: [...accumulatedImages] };
            }
            return r;
          }));

          // Update DB incrementally
          // We overwrite the run entry with the new list of images
          const interimRun = { ...newRun, images: [...accumulatedImages] };
          await saveRunToDB(interimRun);

        } catch (err: any) {
          console.error("Gen failed for one item", err);
          // We continue to next item even if one fails
        }

        processedCount++;

        if (signal.aborted) break;

        if (processedCount < taskQueue.length) {
          const elapsed = Date.now() - startTime;
          const waitTime = Math.max(0, RATE_DELAY_MS - elapsed);
          if (waitTime > 0 && !signal.aborted) {
            await delay(waitTime);
          }
        }
      }
      setLoadingStatus("Done!");

    } catch (err: any) {
      if (err.message === 'Aborted') setLoadingStatus("Cancelled");
      else setLoadingStatus("Error occurring during batch.");
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
            onOpenApiKey={() => setIsKeyModalOpen(true)}
            hasApiKey={!!apiKey}
          />
          <RightPanel
            runs={runs}
            onDeleteRun={handleDeleteRun}
            onDeleteImage={handleDeleteImage}
            onRetryImage={handleRetry}
          />
        </>
      )}
    </div>
  );
};

export default App;