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
            name: `Retry: ${image.id.slice(0,4)}`,
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

  // --- RAW GENERATION LOGIC ---
  const handleGenerateRaw = async (forceBatch: boolean) => {
    if (!apiKey) {
        setIsKeyModalOpen(true);
        return;
    }

    const validItems = prompts.filter(p => p.text.trim().length > 0);
    
    if (validItems.length === 0) {
      alert("Please enter at least one prompt.");
      return;
    }

    // Check Image Limits (7 Max per request)
    const globalRefs = settings.globalReferenceImages || [];
    for (const item of validItems) {
        if (item.referenceImages.length + globalRefs.length > 7) {
            alert(`Error: Prompt "${item.text.slice(0,20)}..." exceeds 7 images limit (Global + Local).`);
            return;
        }
    }

    const countPerPrompt = forceBatch ? settings.outputCount : 1;
    const totalExpected = validItems.length * countPerPrompt;
    
    setIsGenerating(true);
    setLoadingStatus(`Starting generation of ${totalExpected} images...`);
    
    abortControllerRef.current = new AbortController();

    const newRunId = crypto.randomUUID();
    const generatedImages: GeneratedImage[] = [];

    try {
      const promptPromises = validItems.map(async (item) => {
         let finalPrompt = item.text.trim();
         if (settings.appendStyleHint && settings.styleHintRaw.trim()) {
           finalPrompt += `\n\nSTYLE HINT:\n${settings.styleHintRaw.trim()}`;
         }

         // Combine Global + Local References
         const allRefs = [...globalRefs, ...item.referenceImages];

         const batchPromises = Array.from({ length: countPerPrompt }).map(async () => {
            if (abortControllerRef.current?.signal.aborted) throw new Error('Aborted');
            return await generateImage({
               prompt: finalPrompt,
               referenceImages: allRefs,
               settings,
               apiKey: apiKey,
               signal: abortControllerRef.current?.signal
            });
         });

         return Promise.allSettled(batchPromises);
      });

      const allResults = await Promise.allSettled(promptPromises);
      
      allResults.forEach((promptResult) => {
         if (promptResult.status === 'fulfilled') {
            promptResult.value.forEach((batchResult) => {
               if (batchResult.status === 'fulfilled') {
                  generatedImages.push(batchResult.value);
               }
            });
         }
      });

      if (generatedImages.length === 0) throw new Error("All generations failed.");

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
        images: generatedImages
      };

      await saveRunToDB(newRun);
      setRuns(prev => [newRun, ...prev]);
      setLoadingStatus(`Done! Generated ${generatedImages.length} images.`);

    } catch (err: any) {
      if (err.name !== 'AbortError' && err.message !== 'Aborted') {
        alert(`Error: ${err.message}`);
        setLoadingStatus('Failed.');
      } else {
        setLoadingStatus('Aborted.');
      }
    } finally {
      setIsGenerating(false);
      setTimeout(() => setLoadingStatus(''), 3000);
      abortControllerRef.current = null;
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
            onGenerate={handleGenerateRaw}
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