import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PromptItem, ReferenceImage } from '../types';
import {
  generatePrompts,
  refinePrompts,
  checkAgentHealth,
  getAgentUrl,
  setAgentUrl,
  GeneratedPrompt,
  PromptGeneratorMode,
} from '../services/prompt-generator-service';
import {
  SHOT_TYPES,
  CAMERA_ANGLES,
  MODE_DEFAULTS,
  buildFullPromptText,
  updatePromptMeta as updatePromptMetaUtil,
} from '../utils/prompt-generator-utils';

interface PromptGeneratorProps {
  prompts: PromptItem[];
  setPrompts: (p: PromptItem[]) => void;
  hasApiKey: boolean;
  existingReferenceImage?: ReferenceImage | null;
}

const PromptGenerator: React.FC<PromptGeneratorProps> = ({
  prompts,
  setPrompts,
  hasApiKey,
  existingReferenceImage,
}) => {
  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<PromptGeneratorMode>('storyboard');
  const [count, setCount] = useState(6);
  const [sceneContext, setSceneContext] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPrompts, setGeneratedPrompts] = useState<GeneratedPrompt[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Refinement inputs
  const [globalRefineText, setGlobalRefineText] = useState('');
  const [perPromptRefineText, setPerPromptRefineText] = useState<Record<string, string>>({});
  const [refiningIndex, setRefiningIndex] = useState<number | null>(null);

  // Reference image state
  const [refImage, setRefImage] = useState<ReferenceImage | null>(null);
  const [useExistingRef, setUseExistingRef] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Agent status
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [showAgentConfig, setShowAgentConfig] = useState(false);
  const [agentUrlInput, setAgentUrlInput] = useState(getAgentUrl());

  // Check agent health on open
  useEffect(() => {
    if (isOpen) {
      checkAgentHealth().then(setAgentOnline);
    }
  }, [isOpen]);

  const handleModeChange = (newMode: PromptGeneratorMode) => {
    setMode(newMode);
    setCount(MODE_DEFAULTS[newMode]);
    setGeneratedPrompts([]);
    setSessionId(null);
    setError(null);
    setGlobalRefineText('');
    setPerPromptRefineText({});
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Clean = result.split(',')[1];
      setRefImage({
        id: crypto.randomUUID(),
        base64: base64Clean,
        mimeType: file.type,
        previewUrl: result,
      });
      setUseExistingRef(false);
    };
    reader.readAsDataURL(file);
  }, []);

  const getActiveRefImage = (): ReferenceImage | null => {
    if (useExistingRef && existingReferenceImage) return existingReferenceImage;
    return refImage;
  };

  // -----------------------------------------------------------------------
  // Generate
  // -----------------------------------------------------------------------
  const handleGenerate = async () => {
    const activeRef = getActiveRefImage();
    if (!activeRef) { setError('Please upload a reference image first.'); return; }
    if (!hasApiKey) { setError('Gemini API key required. Set it in API Key settings.'); return; }
    if (agentOnline === false) { setError('Agent is offline. Start it with: python agent/start_agent.py'); return; }

    setIsGenerating(true);
    setError(null);
    setGeneratedPrompts([]);
    setSessionId(null);
    setGlobalRefineText('');
    setPerPromptRefineText({});

    try {
      const apiKey = localStorage.getItem('raw_studio_api_key') || '';
      const result = await generatePrompts(
        apiKey, activeRef.base64, activeRef.mimeType,
        mode, count, sceneContext.trim() || undefined
      );
      setGeneratedPrompts(result.prompts);
      setSessionId(result.sessionId);
    } catch (err: any) {
      console.error('[PromptGenerator] Generation failed:', err);
      if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
        setError('Cannot reach agent. Is it running? Start with: python agent/start_agent.py');
        setAgentOnline(false);
      } else {
        setError(err.message || 'Failed to generate prompts.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  // -----------------------------------------------------------------------
  // Refine — global
  // -----------------------------------------------------------------------
  const handleGlobalRefine = async () => {
    if (!globalRefineText.trim() || !sessionId) return;
    setIsRefining(true);
    setRefiningIndex(null);
    setError(null);
    try {
      const apiKey = localStorage.getItem('raw_studio_api_key') || '';
      const result = await refinePrompts(apiKey, sessionId, globalRefineText.trim());
      setGeneratedPrompts(result.prompts);
      setSessionId(result.sessionId);
      setGlobalRefineText('');
    } catch (err: any) {
      setError(err.message || 'Refinement failed.');
    } finally {
      setIsRefining(false);
    }
  };

  // -----------------------------------------------------------------------
  // Refine — per-prompt
  // -----------------------------------------------------------------------
  const handlePromptRefine = async (index: number, promptId: string) => {
    const text = perPromptRefineText[promptId]?.trim();
    if (!text || !sessionId) return;
    setIsRefining(true);
    setRefiningIndex(index);
    setError(null);
    try {
      const apiKey = localStorage.getItem('raw_studio_api_key') || '';
      const result = await refinePrompts(apiKey, sessionId, text, index);
      setGeneratedPrompts(result.prompts);
      setSessionId(result.sessionId);
      setPerPromptRefineText(prev => ({ ...prev, [promptId]: '' }));
    } catch (err: any) {
      setError(err.message || 'Refinement failed.');
    } finally {
      setIsRefining(false);
      setRefiningIndex(null);
    }
  };

  // -----------------------------------------------------------------------
  // Update shot type or camera angle on a prompt and reflect in text
  // -----------------------------------------------------------------------
  const updatePromptMeta = (promptId: string, field: 'shotType' | 'cameraAngle', value: string) => {
    setGeneratedPrompts(prev => prev.map(gp => {
      if (gp.id !== promptId) return gp;
      return updatePromptMetaUtil(gp, field, value);
    }));
  };

  // Build full prompt text — delegated to utility
  // (kept as a local alias for clarity in JSX callbacks)

  // -----------------------------------------------------------------------
  // Queue actions
  // -----------------------------------------------------------------------
  const addToQueue = (gp: GeneratedPrompt) => {
    const activeRef = getActiveRefImage();
    const newPrompt: PromptItem = {
      id: crypto.randomUUID(),
      text: buildFullPromptText(gp),
      referenceImages: activeRef ? [{ ...activeRef, id: crypto.randomUUID() }] : [],
    };
    if (prompts.length === 1 && prompts[0].text.trim() === '') {
      setPrompts([newPrompt]);
    } else {
      setPrompts([...prompts, newPrompt]);
    }
  };

  const addAllToQueue = () => {
    const activeRef = getActiveRefImage();
    const newPrompts: PromptItem[] = generatedPrompts.map(gp => ({
      id: crypto.randomUUID(),
      text: buildFullPromptText(gp),
      referenceImages: activeRef ? [{ ...activeRef, id: crypto.randomUUID() }] : [],
    }));
    if (prompts.length === 1 && prompts[0].text.trim() === '') {
      setPrompts(newPrompts);
    } else {
      setPrompts([...prompts, ...newPrompts]);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const activeRef = getActiveRefImage();

  return (
    <div className="space-y-2 bg-gray-800/50 rounded-lg border border-gray-800 transition-all border-dashed hover:border-solid hover:border-gray-700">
      {/* ===================== HEADER ===================== */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2 cursor-pointer">
          📋 Prompt Generator
          {generatedPrompts.length > 0 && (
            <span className="text-[9px] bg-dash-900/50 text-dash-300 px-1.5 py-0.5 rounded">
              {generatedPrompts.length} ready
            </span>
          )}
          {/* Agent status dot */}
          {agentOnline !== null && (
            <span
              className={`w-2 h-2 rounded-full ${agentOnline ? 'bg-green-500' : 'bg-red-500'}`}
              title={agentOnline ? 'Agent online' : 'Agent offline'}
            />
          )}
        </label>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ===================== CONTENT ===================== */}
      {isOpen && (
        <div className="px-4 pb-4 space-y-4">

          {/* Agent connection status bar */}
          {agentOnline === false && (
            <div className="p-2 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center justify-between">
              <span>⚠️ Agent offline</span>
              <div className="flex gap-2">
                <button
                  onClick={() => checkAgentHealth().then(setAgentOnline)}
                  className="text-[10px] px-2 py-0.5 bg-gray-800 rounded border border-gray-700 hover:border-gray-500 transition-colors"
                >
                  Retry
                </button>
                <button
                  onClick={() => setShowAgentConfig(!showAgentConfig)}
                  className="text-[10px] px-2 py-0.5 bg-gray-800 rounded border border-gray-700 hover:border-gray-500 transition-colors"
                >
                  Config
                </button>
              </div>
            </div>
          )}

          {/* Agent URL config (hidden by default) */}
          {showAgentConfig && (
            <div className="flex gap-2 items-center">
              <input
                type="text"
                className="flex-1 bg-gray-950 border border-gray-700 rounded p-1.5 text-[11px] text-gray-300 font-mono"
                value={agentUrlInput}
                onChange={(e) => setAgentUrlInput(e.target.value)}
                placeholder="http://localhost:8001"
              />
              <button
                onClick={() => {
                  setAgentUrl(agentUrlInput);
                  setShowAgentConfig(false);
                  checkAgentHealth().then(setAgentOnline);
                }}
                className="text-[10px] px-2 py-1.5 bg-dash-900/40 text-dash-300 rounded border border-dash-500/30 hover:bg-dash-900/60 transition-colors"
              >
                Save
              </button>
            </div>
          )}

          {/* ---- Mode Toggle ---- */}
          <div className="space-y-1">
            <span className="text-xs text-gray-500">Mode</span>
            <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
              <button
                onClick={() => handleModeChange('storyboard')}
                className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-all ${
                  mode === 'storyboard'
                    ? 'bg-dash-700 text-white ring-1 ring-dash-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <span className="block leading-tight">🎬 Storyboard</span>
                <span className="text-[10px] opacity-60">Cinematic continuity</span>
              </button>
              <button
                onClick={() => handleModeChange('photoset')}
                className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-all ${
                  mode === 'photoset'
                    ? 'bg-dash-700 text-white ring-1 ring-dash-400'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <span className="block leading-tight">📸 Photo Set</span>
                <span className="text-[10px] opacity-60">Model variations</span>
              </button>
            </div>
          </div>

          {/* ---- Reference Image ---- */}
          <div className="space-y-2">
            <span className="text-xs text-gray-500">Reference Image</span>

            {existingReferenceImage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setUseExistingRef(!useExistingRef);
                    if (!useExistingRef) setRefImage(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] border transition-all ${
                    useExistingRef
                      ? 'bg-dash-900/30 text-dash-300 border-dash-500/40'
                      : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center transition-colors ${
                    useExistingRef ? 'border-dash-400 bg-dash-600' : 'border-gray-600'
                  }`}>
                    {useExistingRef && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  Use existing reference
                </button>
              </div>
            )}

            {useExistingRef && existingReferenceImage?.previewUrl ? (
              <div className="flex items-center gap-3 p-2 bg-gray-900 rounded-lg border border-gray-700">
                <img src={existingReferenceImage.previewUrl} className="w-14 h-14 rounded object-cover border border-gray-600" alt="existing ref" />
                <span className="text-xs text-gray-400">Using existing reference image</span>
              </div>
            ) : refImage?.previewUrl ? (
              <div className="flex items-center gap-3 p-2 bg-gray-900 rounded-lg border border-gray-700">
                <img src={refImage.previewUrl} className="w-14 h-14 rounded object-cover border border-gray-600" alt="uploaded ref" />
                <div className="flex-1">
                  <span className="text-xs text-gray-300 block">Image uploaded</span>
                  <button onClick={() => setRefImage(null)} className="text-[10px] text-red-400 hover:text-red-300 mt-0.5">Remove</button>
                </div>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center p-4 bg-gray-900 rounded-lg border border-dashed border-gray-700 hover:border-dash-300/50 hover:bg-gray-800/50 cursor-pointer transition-all"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-dash-300', 'border-dash-300'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-dash-300', 'border-dash-300'); }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('ring-2', 'ring-dash-300', 'border-dash-300');
                  const file = e.dataTransfer.files?.[0];
                  if (file) await handleImageUpload(file);
                }}
              >
                <svg className="w-6 h-6 text-gray-600 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-xs text-gray-500">Drop image or click to upload</span>
                <input
                  ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                />
              </div>
            )}
          </div>

          {/* ---- Count ---- */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-xs text-gray-500">{mode === 'storyboard' ? 'Number of Scenes' : 'Number of Shots'}</span>
              <span className="text-xs text-dash-300 font-mono">{count}</span>
            </div>
            <input type="range" min="2" max="20" step="1"
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-300"
              value={count} onChange={(e) => setCount(parseInt(e.target.value))}
            />
          </div>

          {/* ---- Scene Context ---- */}
          <div className="space-y-1">
            <span className="text-xs text-gray-500">Scene Context (optional)</span>
            <input type="text"
              className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 font-mono placeholder-gray-600"
              placeholder='e.g. "rooftop pool at night", "fashion runway"'
              value={sceneContext} onChange={(e) => setSceneContext(e.target.value)}
            />
          </div>

          {/* ---- Generate Button ---- */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !activeRef || !hasApiKey}
            className={`w-full py-2.5 px-4 font-medium rounded-lg transition-all flex items-center justify-center gap-2 text-sm ${
              isGenerating ? 'bg-gray-700 text-gray-400 cursor-wait'
              : !activeRef || !hasApiKey ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
              : 'bg-dash-700 hover:bg-dash-600 text-white ring-1 ring-dash-400/30'
            }`}
          >
            {isGenerating ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Generate {count} Prompts
              </>
            )}
          </button>

          {/* ---- Error ---- */}
          {error && (
            <div className="p-2 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-300">
              {error}
            </div>
          )}

          {/* ============================================== */}
          {/* GENERATED PROMPTS + REFINEMENT                */}
          {/* ============================================== */}
          {generatedPrompts.length > 0 && (
            <div className="space-y-3">
              {/* Header bar */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Generated ({generatedPrompts.length})
                </span>
                <div className="flex gap-2">
                  <button onClick={handleGenerate} disabled={isGenerating}
                    className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-200 transition-all flex items-center gap-1"
                    title="Regenerate"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Redo
                  </button>
                  <button onClick={addAllToQueue}
                    className="text-[10px] px-2 py-1 rounded bg-dash-900/40 text-dash-300 border border-dash-500/30 hover:bg-dash-900/60 hover:border-dash-400/50 transition-all flex items-center gap-1"
                    title="Add All to Queue"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add All
                  </button>
                </div>
              </div>

              {/* ---- Global Refinement Input ---- */}
              {sessionId && (
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 font-mono placeholder-gray-600 focus:ring-1 focus:ring-amber-400/50 focus:border-gray-600 transition-all"
                    placeholder="Refine all — e.g. &quot;adjust lighting and composition&quot;"
                    value={globalRefineText}
                    onChange={(e) => setGlobalRefineText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGlobalRefine(); } }}
                    disabled={isRefining}
                  />
                  <button
                    onClick={handleGlobalRefine}
                    disabled={isRefining || !globalRefineText.trim()}
                    className={`shrink-0 px-2.5 py-2 rounded-lg text-xs font-medium transition-all ${
                      isRefining && refiningIndex === null
                        ? 'bg-amber-900/30 text-amber-300 cursor-wait'
                        : !globalRefineText.trim()
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-amber-900/40 text-amber-300 border border-amber-500/30 hover:bg-amber-900/60'
                    }`}
                  >
                    {isRefining && refiningIndex === null ? (
                      <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {/* ---- Prompt Cards ---- */}
              <div className="max-h-[400px] overflow-y-auto space-y-2 custom-scrollbar pr-1">
                {generatedPrompts.map((gp, index) => {
                  const isExpanded = expandedIds.has(gp.id);
                  const truncLen = 120;
                  const truncatedText = gp.text.length > truncLen ? gp.text.slice(0, truncLen) + '...' : gp.text;
                  const isThisRefining = isRefining && refiningIndex === index;
                  const localRefText = perPromptRefineText[gp.id] || '';

                  return (
                    <div key={gp.id}
                      className={`bg-gray-900 border rounded-lg p-3 space-y-2 group/prompt transition-all ${
                        isThisRefining ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-gray-700'
                      }`}
                    >
                      {/* Prompt header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-mono text-gray-500">#{index + 1}</span>
                            <select
                              value={gp.shotType || ''}
                              onChange={(e) => updatePromptMeta(gp.id, 'shotType', e.target.value)}
                              className="text-[10px] bg-gray-800 text-blue-400 px-1.5 py-0.5 rounded border border-gray-700 hover:border-blue-500/50 cursor-pointer outline-none"
                              title="Shot Type"
                            >
                              <option value="">Shot Type</option>
                              {SHOT_TYPES.map(st => <option key={st} value={st}>{st}</option>)}
                            </select>
                            <select
                              value={gp.cameraAngle || ''}
                              onChange={(e) => updatePromptMeta(gp.id, 'cameraAngle', e.target.value)}
                              className="text-[10px] bg-gray-800 text-dash-400 px-1.5 py-0.5 rounded border border-gray-700 hover:border-dash-500/50 cursor-pointer outline-none"
                              title="Camera Angle"
                            >
                              <option value="">Camera Angle</option>
                              {CAMERA_ANGLES.map(ca => <option key={ca} value={ca}>{ca}</option>)}
                            </select>
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed">
                            {isExpanded ? gp.text : truncatedText}
                          </p>
                          {gp.text.length > truncLen && (
                            <button onClick={() => toggleExpand(gp.id)} className="text-[10px] text-dash-400 hover:text-dash-300 mt-1">
                              {isExpanded ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>
                        <button onClick={() => addToQueue(gp)}
                          className="shrink-0 text-[10px] px-2 py-1.5 rounded bg-gray-800 text-dash-300 border border-gray-700 hover:border-dash-300/50 hover:bg-gray-700 transition-all opacity-60 group-hover/prompt:opacity-100"
                          title="Add to Queue"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>

                      {/* Meta tags */}
                      <div className="flex flex-wrap gap-1">
                        {gp.expression && (
                          <span className="text-[9px] bg-dash-900/30 text-dash-300 px-1.5 py-0.5 rounded border border-dash-500/20">{gp.expression}</span>
                        )}
                        {gp.pose && (
                          <span className="text-[9px] bg-blue-900/30 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20">{gp.pose}</span>
                        )}
                      </div>

                      {/* Per-prompt refinement input */}
                      {sessionId && (
                        <div className="flex gap-1.5 items-center pt-1 border-t border-gray-800">
                          <input
                            type="text"
                            className="flex-1 bg-gray-950 border border-gray-800 rounded p-1.5 text-[11px] text-gray-400 font-mono placeholder-gray-600 focus:ring-1 focus:ring-amber-400/30 focus:border-gray-600 transition-all"
                            placeholder={`Refine #${index + 1} — e.g. "change pose"`}
                            value={localRefText}
                            onChange={(e) => setPerPromptRefineText(prev => ({ ...prev, [gp.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePromptRefine(index, gp.id); } }}
                            disabled={isRefining}
                          />
                          <button
                            onClick={() => handlePromptRefine(index, gp.id)}
                            disabled={isRefining || !localRefText.trim()}
                            className={`shrink-0 p-1.5 rounded text-[10px] transition-all ${
                              isThisRefining
                                ? 'bg-amber-900/30 text-amber-300 cursor-wait'
                                : !localRefText.trim()
                                ? 'text-gray-700 cursor-not-allowed'
                                : 'text-amber-400 hover:bg-amber-900/30 hover:text-amber-300'
                            }`}
                            title="Refine this prompt"
                          >
                            {isThisRefining ? (
                              <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ---- Info box ---- */}
          <div className="p-3 bg-gray-900/50 border border-gray-700/50 rounded-lg text-[10px] text-gray-500 space-y-1">
            {mode === 'storyboard' ? (
              <p>Generates a cinematic mini-story: varied camera angles, expressions, and poses with scene continuity.</p>
            ) : (
              <p>Generates model portfolio shots: consistent character/scene with varied poses, expressions, and angles.</p>
            )}
            <p className="text-gray-600">Powered by ADK Agent (Gemini 2.5 Flash + Google Search grounding). Multi-turn: refine prompts with follow-up instructions.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptGenerator;
