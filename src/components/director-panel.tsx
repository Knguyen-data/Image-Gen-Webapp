import React, { useState, useRef, useCallback, useEffect } from 'react';
import { DirectorSettings, DirectorMode, DirectorStyle, DirectorPipelineState, DirectorPhase } from '../types';
import { submitDirectorJob, waitForDirectorJob, cancelDirectorJob, estimateDirectorCost, DirectorPollResponse } from '../services/director-service';
import {
  Upload, X, Play, Square, Download, ExternalLink, Scissors,
  ChevronDown, ChevronUp, Sparkles, Loader2, AlertCircle, CheckCircle2,
  Clock, Film, Volume2, Eye, Zap, Image as ImageIcon
} from 'lucide-react';

// ── Default Settings ────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: DirectorSettings = {
  mode: 't2v',
  style: 'cinematic',
  targetDuration: 30,
  resolution: { width: 832, height: 480 },
  nsfw: true,
  generateAudio: true,
  consistencyCheck: true,
  consistencyThreshold: 70,
  maxParallel: 3,
  fps: 16,
};

const STYLE_OPTIONS: { value: DirectorStyle; label: string; icon: string }[] = [
  { value: 'cinematic', label: 'Cinematic', icon: '🎬' },
  { value: 'anime', label: 'Anime', icon: '✨' },
  { value: 'documentary', label: 'Documentary', icon: '📹' },
  { value: 'music-video', label: 'Music Video', icon: '🎵' },
  { value: 'film-noir', label: 'Film Noir', icon: '🌑' },
  { value: 'custom', label: 'Custom', icon: '🎨' },
];

const DURATION_OPTIONS = [
  { value: 15, label: '15s', desc: '~3 shots' },
  { value: 30, label: '30s', desc: '~6 shots' },
  { value: 60, label: '1 min', desc: '~12 shots' },
  { value: 120, label: '2 min', desc: '~24 shots' },
  { value: 180, label: '3 min', desc: '~36 shots' },
];

const RESOLUTION_OPTIONS = [
  { value: { width: 832, height: 480 }, label: '832×480', desc: 'Widescreen' },
  { value: { width: 480, height: 832 }, label: '480×832', desc: 'Portrait' },
  { value: { width: 640, height: 640 }, label: '640×640', desc: 'Square' },
];

const DEFAULT_PHASES: DirectorPhase[] = [
  { phase: 1, name: 'Character Analysis', status: 'pending' },
  { phase: 2, name: 'Shot Planning', status: 'pending' },
  { phase: 3, name: 'Keyframe Generation', status: 'pending' },
  { phase: 4, name: 'Video Generation', status: 'pending' },
  { phase: 5, name: 'Video Merge', status: 'pending' },
  { phase: 6, name: 'Audio Generation', status: 'pending' },
];

const PHASE_ICONS: Record<string, string> = {
  'Character Analysis': '👤',
  'Shot Planning': '📋',
  'Keyframe Generation': '🖼️',
  'Video Generation': '🎬',
  'Video Merge': '🔗',
  'Audio Generation': '🔊',
};

// ── Component ───────────────────────────────────────────────────────────────

interface DirectorPanelProps {
  allImages?: Array<{ base64: string; mimeType: string }>;
}

export const DirectorPanel: React.FC<DirectorPanelProps> = ({ allImages = [] }) => {
  // Settings
  const [settings, setSettings] = useState<DirectorSettings>(DEFAULT_SETTINGS);
  const [prompt, setPrompt] = useState('');
  const [characterImages, setCharacterImages] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline state
  const [pipelineState, setPipelineState] = useState<DirectorPipelineState>({
    jobId: null,
    status: 'idle',
    phases: [...DEFAULT_PHASES],
    characterImages: [],
  });

  // Abort controller
  const abortRef = useRef<AbortController | null>(null);

  // Elapsed time
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (pipelineState.status !== 'running') return;
    const interval = setInterval(() => {
      if (pipelineState.startedAt) {
        setElapsed(Math.floor((Date.now() - pipelineState.startedAt) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pipelineState.status, pipelineState.startedAt]);

  // Cost estimate
  const estimate = estimateDirectorCost(settings.targetDuration);

  // ── Character Image Management ──────────────────────────────────────────

  const addCharacterImage = useCallback((base64: string) => {
    if (characterImages.length >= 5) return;
    // Strip data: prefix if present
    const clean = base64.startsWith('data:') ? base64.split(',')[1] : base64;
    setCharacterImages(prev => [...prev, clean]);
  }, [characterImages]);

  const removeCharacterImage = useCallback((index: number) => {
    setCharacterImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        addCharacterImage(result);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, [addCharacterImage]);

  // ── Pipeline Execution ────────────────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    if (characterImages.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setPipelineState({
      jobId: null,
      status: 'submitting',
      phases: DEFAULT_PHASES.map(p => ({ ...p, status: 'pending' as const })),
      characterImages,
      startedAt: Date.now(),
    });
    setElapsed(0);

    try {
      // Submit
      const jobId = await submitDirectorJob({
        character_images: characterImages,
        mode: settings.mode,
        user_prompt: prompt,
        target_duration: settings.targetDuration,
        style: settings.style === 'custom' ? (settings.customStyle || 'cinematic') : settings.style,
        nsfw: settings.nsfw,
        fps: settings.fps,
        resolution: settings.resolution,
        generate_audio: settings.generateAudio,
        consistency_threshold: settings.consistencyCheck ? settings.consistencyThreshold : undefined,
        max_parallel: settings.maxParallel,
      });

      setPipelineState(prev => ({
        ...prev,
        jobId,
        status: 'running',
        phases: prev.phases.map((p, i) => i === 0 ? { ...p, status: 'active' as const } : p),
      }));

      // Poll until done
      const result = await waitForDirectorJob(
        jobId,
        (response: DirectorPollResponse) => {
          // Update phases from response if available
          if (response.output?.phases) {
            setPipelineState(prev => ({
              ...prev,
              phases: response.output!.phases!.map(p => ({
                phase: p.phase,
                name: p.phase_name,
                status: p.status,
                detail: p.detail,
                timeSec: p.time_sec,
              })),
            }));
          }
        },
        3000,
        900000,
        controller.signal,
      );

      setPipelineState(prev => ({
        ...prev,
        status: 'completed',
        phases: prev.phases.map(p => ({ ...p, status: 'done' as const })),
        result: {
          videoBase64: result.video_base64 || '',
          duration: result.duration || 0,
          shots: result.shots || 0,
          consistencyAvg: result.consistency_avg || 0,
          cost: result.cost || 0,
          timings: result.timings || {},
        },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message === 'Cancelled') {
        setPipelineState(prev => ({ ...prev, status: 'cancelled', error: 'Cancelled by user' }));
      } else {
        setPipelineState(prev => ({ ...prev, status: 'failed', error: message }));
      }
    }
  }, [prompt, characterImages, settings]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    if (pipelineState.jobId) {
      cancelDirectorJob(pipelineState.jobId).catch(() => {});
    }
  }, [pipelineState.jobId]);

  const handleReset = useCallback(() => {
    setPipelineState({
      jobId: null,
      status: 'idle',
      phases: [...DEFAULT_PHASES],
      characterImages: [],
    });
    setElapsed(0);
  }, []);

  const handleDownload = useCallback(() => {
    if (!pipelineState.result?.videoBase64) return;
    const byteString = atob(pipelineState.result.videoBase64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `director-${Date.now()}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pipelineState.result]);

  // ── Render ────────────────────────────────────────────────────────────────

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // === RESULT VIEW ===
  if (pipelineState.status === 'completed' && pipelineState.result) {
    const videoSrc = `data:video/mp4;base64,${pipelineState.result.videoBase64}`;
    return (
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <h3 className="text-sm font-bold text-white">Video Ready</h3>
          </div>
          <button onClick={handleReset} className="text-xs text-gray-400 hover:text-white">
            ← New Video
          </button>
        </div>

        <div className="rounded-xl overflow-hidden border border-gray-800 bg-black">
          <video src={videoSrc} controls className="w-full" />
        </div>

        <div className="flex gap-2">
          <button onClick={handleDownload}
            className="flex-1 py-2.5 rounded-lg bg-orange-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-orange-400 transition-all">
            <Download className="w-3.5 h-3.5" /> Download MP4
          </button>
          <button onClick={handleReset}
            className="flex-1 py-2.5 rounded-lg border border-gray-700 text-gray-300 text-xs font-semibold hover:border-orange-500 hover:text-orange-300 transition-all flex items-center justify-center gap-1.5">
            <Film className="w-3.5 h-3.5" /> Direct Another
          </button>
        </div>

        <div className="bg-gray-900/50 rounded-lg p-3 text-[11px] text-gray-500 space-y-1">
          <div className="flex justify-between">
            <span>{pipelineState.result.shots} shots • {pipelineState.result.duration}s</span>
            <span>Consistency: {pipelineState.result.consistencyAvg}/100</span>
          </div>
          <div className="flex justify-between">
            <span>Time: {formatTime(elapsed)}</span>
            <span>Cost: ~${pipelineState.result.cost.toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  }

  // === PROGRESS VIEW ===
  if (pipelineState.status === 'running' || pipelineState.status === 'submitting') {
    return (
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-orange-400 animate-spin" />
            <h3 className="text-sm font-bold text-white">
              {pipelineState.status === 'submitting' ? 'Submitting...' : 'Directing...'}
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{formatTime(elapsed)}</span>
            <button onClick={handleCancel}
              className="px-3 py-1 rounded-lg border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/10 transition-all flex items-center gap-1">
              <Square className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>

        <div className="space-y-1">
          {pipelineState.phases.map((phase) => (
            <div key={phase.phase} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-900/30">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs ${
                phase.status === 'done' ? 'bg-green-500/15 text-green-400' :
                phase.status === 'active' ? 'bg-orange-500/15 text-orange-400 animate-pulse' :
                phase.status === 'error' ? 'bg-red-500/15 text-red-400' :
                'bg-gray-800 text-gray-600'
              }`}>
                {phase.status === 'done' ? '✓' : 
                 phase.status === 'active' ? PHASE_ICONS[phase.name] || '⚡' :
                 phase.status === 'error' ? '✗' : phase.phase}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold ${
                  phase.status === 'pending' ? 'text-gray-600' : 'text-gray-200'
                }`}>{phase.name}</div>
                {phase.detail && (
                  <div className={`text-[10px] truncate ${
                    phase.status === 'active' ? 'text-orange-400/70' : 'text-green-400/60'
                  }`}>{phase.detail}</div>
                )}
              </div>
              {phase.timeSec != null && (
                <span className="text-[10px] text-gray-600">{phase.timeSec.toFixed(1)}s</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // === ERROR VIEW ===
  if (pipelineState.status === 'failed' || pipelineState.status === 'cancelled') {
    return (
      <div className="px-6 py-4 space-y-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <h3 className="text-sm font-bold text-red-300">
            {pipelineState.status === 'cancelled' ? 'Cancelled' : 'Pipeline Failed'}
          </h3>
        </div>
        {pipelineState.error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-300">
            {pipelineState.error}
          </div>
        )}
        <button onClick={handleReset}
          className="w-full py-2.5 rounded-lg border border-gray-700 text-gray-300 text-xs font-semibold hover:border-orange-500 transition-all">
          ← Try Again
        </button>
      </div>
    );
  }

  // === INPUT VIEW (DEFAULT) ===
  return (
    <div className="px-6 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-lg">🎬</span>
        <h3 className="text-sm font-bold text-white">Director Pipeline</h3>
        <span className="text-[9px] px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold">
          AI MULTI-SHOT
        </span>
      </div>

      {/* Character References */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Character References
          </label>
          <span className="text-[10px] text-gray-600">{characterImages.length}/5 images</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {characterImages.map((img, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border-2 border-orange-500/50 bg-gray-900">
              <img src={`data:image/jpeg;base64,${img}`} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
              <button onClick={() => removeCharacterImage(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center hover:bg-red-400">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          {characterImages.length < 5 && (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-700 hover:border-orange-500 text-gray-600 hover:text-orange-400 flex items-center justify-center transition-all">
              <Upload className="w-4 h-4" />
            </button>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
        <p className="text-[10px] text-gray-600 mt-1">Upload or drag from gallery. More refs = better consistency.</p>
      </div>

      {/* Scene Prompt */}
      <div>
        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">
          Scene Description
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A woman walks through neon-lit Tokyo streets at night in the rain, stops at a ramen shop, looks up at the glowing signs..."
          className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 resize-none focus:outline-none focus:border-orange-500/50 transition-colors"
          rows={3}
        />
      </div>

      {/* Style + Duration */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Style</label>
          <select value={settings.style} onChange={(e) => setSettings(s => ({ ...s, style: e.target.value as DirectorStyle }))}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-orange-500/50">
            {STYLE_OPTIONS.map(s => (
              <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Duration</label>
          <select value={settings.targetDuration} onChange={(e) => setSettings(s => ({ ...s, targetDuration: Number(e.target.value) }))}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-orange-500/50">
            {DURATION_OPTIONS.map(d => (
              <option key={d.value} value={d.value}>{d.label} ({d.desc})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Resolution + Mode */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Resolution</label>
          <select value={`${settings.resolution.width}x${settings.resolution.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              setSettings(s => ({ ...s, resolution: { width: w, height: h } }));
            }}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-orange-500/50">
            {RESOLUTION_OPTIONS.map(r => (
              <option key={r.label} value={`${r.value.width}x${r.value.height}`}>{r.label} ({r.desc})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1.5">Mode</label>
          <select value={settings.mode} onChange={(e) => setSettings(s => ({ ...s, mode: e.target.value as DirectorMode }))}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-orange-500/50">
            <option value="t2v">Text to Video</option>
            <option value="i2v">Image to Video</option>
            <option value="clone">Clone (reference video)</option>
          </select>
        </div>
      </div>

      {/* Advanced Settings */}
      <button onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-[11px] text-gray-600 hover:text-gray-400 transition-colors">
        {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        Advanced Settings
      </button>

      {showAdvanced && (
        <div className="space-y-3 bg-gray-900/30 rounded-xl p-3 border border-gray-800/50">
          {/* NSFW Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> NSFW Mode
            </span>
            <button onClick={() => setSettings(s => ({ ...s, nsfw: !s.nsfw }))}
              className={`w-9 h-5 rounded-full transition-all relative ${settings.nsfw ? 'bg-orange-500' : 'bg-gray-700'}`}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all ${settings.nsfw ? 'left-[18px]' : 'left-[3px]'}`} />
            </button>
          </div>

          {/* Audio Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <Volume2 className="w-3 h-3" /> Generate Audio
            </span>
            <button onClick={() => setSettings(s => ({ ...s, generateAudio: !s.generateAudio }))}
              className={`w-9 h-5 rounded-full transition-all relative ${settings.generateAudio ? 'bg-orange-500' : 'bg-gray-700'}`}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all ${settings.generateAudio ? 'left-[18px]' : 'left-[3px]'}`} />
            </button>
          </div>

          {/* Consistency Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <Eye className="w-3 h-3" /> Consistency Check
            </span>
            <button onClick={() => setSettings(s => ({ ...s, consistencyCheck: !s.consistencyCheck }))}
              className={`w-9 h-5 rounded-full transition-all relative ${settings.consistencyCheck ? 'bg-orange-500' : 'bg-gray-700'}`}>
              <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all ${settings.consistencyCheck ? 'left-[18px]' : 'left-[3px]'}`} />
            </button>
          </div>

          {/* Consistency Threshold */}
          {settings.consistencyCheck && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">Threshold</span>
                <span className="text-[10px] text-orange-400 font-mono">{settings.consistencyThreshold}</span>
              </div>
              <input type="range" min={50} max={95} value={settings.consistencyThreshold}
                onChange={(e) => setSettings(s => ({ ...s, consistencyThreshold: Number(e.target.value) }))}
                className="w-full h-1 bg-gray-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:cursor-pointer" />
            </div>
          )}

          {/* Parallel Workers */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500">Parallel Workers</span>
              <span className="text-[10px] text-orange-400 font-mono">{settings.maxParallel}</span>
            </div>
            <input type="range" min={1} max={5} value={settings.maxParallel}
              onChange={(e) => setSettings(s => ({ ...s, maxParallel: Number(e.target.value) }))}
              className="w-full h-1 bg-gray-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:cursor-pointer" />
          </div>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!prompt.trim() || characterImages.length === 0}
        className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
          prompt.trim() && characterImages.length > 0
            ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-[0_4px_20px_rgba(249,115,22,0.3)] hover:shadow-[0_6px_24px_rgba(249,115,22,0.4)] hover:-translate-y-0.5'
            : 'bg-gray-800 text-gray-600 cursor-not-allowed'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        Direct Video
        <span className="text-[11px] font-normal opacity-80">
          Est: ~{estimate.timeMinParallel.toFixed(1)} min • ~${estimate.cost.toFixed(2)} • {estimate.shots} shots
        </span>
      </button>

      {/* Validation hints */}
      {characterImages.length === 0 && (
        <p className="text-[10px] text-gray-600 text-center">↑ Add at least 1 character reference image</p>
      )}
    </div>
  );
};

export default DirectorPanel;
