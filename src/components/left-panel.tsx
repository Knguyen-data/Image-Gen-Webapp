import React, { useState, useRef } from 'react';
import { AppSettings, PromptItem, ReferenceImage, ImageSize, SeedreamQuality, AppMode, VideoScene, VideoSettings, VideoModel, KlingProDuration, KlingProAspectRatio } from '../types';
import { ASPECT_RATIO_LABELS, IMAGE_SIZE_LABELS, SEEDREAM_QUALITY_LABELS, DEFAULT_SETTINGS, MAX_REFERENCE_IMAGES } from '../constants';
import BulkInputModal from './bulk-input-modal';
import VideoSceneQueue from './video-scene-queue';
import VideoTrimmerModal from './video-trimmer-modal';
import VideoReferenceModal from './video-reference-modal';
import PromptGenerator from './prompt-generator';

interface LeftPanelProps {
  prompts: PromptItem[];
  setPrompts: (p: PromptItem[]) => void;
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  isGenerating: boolean;
  onGenerate: (isBatch: boolean) => void;
  onOpenApiKey: () => void;
  hasApiKey: boolean;
  hasKieApiKey: boolean;
  // Spicy Mode props
  credits: number | null;
  creditsLoading: boolean;
  creditsError: string | null;
  isLowCredits: boolean;
  isCriticalCredits: boolean;
  // App Mode
  appMode: AppMode;
  // Video Mode props
  videoModel?: VideoModel;
  setVideoModel?: (model: VideoModel) => void;
  videoScenes?: VideoScene[];
  setVideoScenes?: (scenes: VideoScene[]) => void;
  videoSettings?: VideoSettings;
  setVideoSettings?: (settings: VideoSettings) => void;
  onVideoGenerate?: () => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({
  prompts,
  setPrompts,
  settings,
  setSettings,
  isGenerating,
  onGenerate,
  onOpenApiKey,
  hasApiKey,
  hasKieApiKey,
  credits,
  creditsLoading,
  creditsError,
  isLowCredits,
  isCriticalCredits,
  appMode,
  videoModel: videoModelProp = 'kling-2.6',
  setVideoModel: setVideoModelProp = (_model: VideoModel) => {},
  videoScenes = [],
  setVideoScenes = (_scenes: VideoScene[]) => {},
  videoSettings,
  setVideoSettings = (_settings: VideoSettings) => {},
  onVideoGenerate = () => {},
}) => {
  const [activePromptIndex, setActivePromptIndex] = useState(0);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const fixedBlockFileRef = useRef<HTMLInputElement>(null);

  // Video trimmer state
  const [trimmerOpen, setTrimmerOpen] = useState(false);
  const [trimmerFile, setTrimmerFile] = useState<File | null>(null);
  const [trimmerMaxDuration, setTrimmerMaxDuration] = useState(10);
  const [trimmerIsGlobal, setTrimmerIsGlobal] = useState(false);
  const [trimmerSceneId, setTrimmerSceneId] = useState<string | undefined>();

  // Video reference modal state (image mode - extract frames from video)
  const [videoRefOpen, setVideoRefOpen] = useState(false);
  const [videoRefFile, setVideoRefFile] = useState<File | null>(null);
  const [videoRefPromptIndex, setVideoRefPromptIndex] = useState(0);

  // Use parent video model state (no local shadow)
  const selectedVideoModel = videoModelProp;
  const setSelectedVideoModel = setVideoModelProp;

  const isVideoMode = appMode === 'video';

  // Helper to ensure settings exist before access
  const safeSettings: AppSettings = settings || DEFAULT_SETTINGS;

  // --- VIDEO MODEL SELECTOR HANDLER ---
  const handleModelSelect = (model: VideoModel) => {
    setSelectedVideoModel(model);
  };

  // --- IMAGE HELPERS ---
  const handleImageUpload = (file: File): Promise<ReferenceImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Clean = result.split(',')[1];
        resolve({
          id: crypto.randomUUID(),
          base64: base64Clean,
          mimeType: file.type,
          previewUrl: result
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: FileList | null): Promise<{ images: ReferenceImage[], nonImageCount: number }> => {
    if (!files) return { images: [], nonImageCount: 0 };
    const promises: Promise<ReferenceImage>[] = [];
    let nonImageCount = 0;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        promises.push(handleImageUpload(files[i]));
      } else {
        nonImageCount++;
      }
    }
    const images = await Promise.all(promises);
    return { images, nonImageCount };
  };

  // --- FIXED BLOCK IMAGES ---
  const addFixedBlockImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { images, nonImageCount } = await processFiles(e.target.files);
    if (nonImageCount > 0) {
      alert(`Only image files are supported. ${nonImageCount} non-image file(s) were ignored.`);
    }
    const current = safeSettings.fixedBlockImages || [];
    setSettings({ ...safeSettings, fixedBlockImages: [...current, ...images] });
    if (fixedBlockFileRef.current) fixedBlockFileRef.current.value = '';
  };

  const removeFixedBlockImage = (id: string) => {
    const current = safeSettings.fixedBlockImages || [];
    setSettings({ ...safeSettings, fixedBlockImages: current.filter(img => img.id !== id) });
  };

  // --- LOCAL REFERENCE ---
  const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];

  const addLocalImages = async (promptIndex: number, files: FileList | null) => {
    if (!files) return;

    // Check if any dropped file is a video (image mode only)
    if (!isVideoMode) {
      const videoFiles: File[] = [];
      for (let i = 0; i < files.length; i++) {
        if (VIDEO_MIME_TYPES.includes(files[i].type)) {
          videoFiles.push(files[i]);
        }
      }

      if (videoFiles.length > 0) {
        // Open video reference modal for the first video file
        setVideoRefFile(videoFiles[0]);
        setVideoRefPromptIndex(promptIndex);
        setVideoRefOpen(true);
        if (videoFiles.length > 1) {
          alert(`Only the first video (${videoFiles[0].name}) will be processed. ${videoFiles.length - 1} additional video(s) were ignored.`);
        }
        return;
      }
    }

    const { images, nonImageCount } = await processFiles(files);
    if (nonImageCount > 0) {
      alert(`Only image files are supported. ${nonImageCount} non-image file(s) were ignored.`);
    }

    const newPrompts = [...prompts];
    const currentRefCount = newPrompts[promptIndex].referenceImages.length;
    const totalAfterAdd = currentRefCount + images.length;

    if (totalAfterAdd > MAX_REFERENCE_IMAGES) {
      const allowedCount = MAX_REFERENCE_IMAGES - currentRefCount;
      if (allowedCount <= 0) {
        alert(`Maximum of ${MAX_REFERENCE_IMAGES} reference images per prompt reached. Remove some images before adding more.`);
        return;
      }
      // Truncate to fit limit
      const truncatedImages = images.slice(0, allowedCount);
      newPrompts[promptIndex].referenceImages = [...newPrompts[promptIndex].referenceImages, ...truncatedImages];
      alert(`Only ${allowedCount} of ${images.length} image(s) added. Maximum ${MAX_REFERENCE_IMAGES} reference images per prompt.`);
    } else {
      newPrompts[promptIndex].referenceImages = [...newPrompts[promptIndex].referenceImages, ...images];
    }
    setPrompts(newPrompts);
  };

  const removeLocalImage = (promptIndex: number, imgId: string) => {
    const newPrompts = [...prompts];
    newPrompts[promptIndex].referenceImages = newPrompts[promptIndex].referenceImages.filter(img => img.id !== imgId);
    setPrompts(newPrompts);
  };

  // --- PROMPT LOGIC ---
  const updatePromptText = (index: number, text: string) => {
    const newPrompts = [...prompts];
    newPrompts[index].text = text;
    setPrompts(newPrompts);
  };

  const addPrompt = () => {
    setPrompts([...prompts, { id: crypto.randomUUID(), text: '', referenceImages: [] }]);
    setTimeout(() => setActivePromptIndex(prompts.length), 50);
  };

  const removePrompt = (index: number) => {
    if (prompts.length <= 1) {
      updatePromptText(0, '');
      const newPrompts = [...prompts];
      newPrompts[0].referenceImages = [];
      setPrompts(newPrompts);
      return;
    }
    const newPrompts = prompts.filter((_, i) => i !== index);
    setPrompts(newPrompts);
    if (activePromptIndex >= index && activePromptIndex > 0) {
      setActivePromptIndex(activePromptIndex - 1);
    }
  };

  const removeAllPrompts = () => {
    if (confirm("Are you sure you want to delete all prompts?")) {
      setPrompts([{ id: crypto.randomUUID(), text: '', referenceImages: [] }]);
      setActivePromptIndex(0);
    }
  };

  const handleBulkProcess = (newLines: string[]) => {
    if (newLines.length === 0) return;
    const newItems: PromptItem[] = newLines.map(text => ({
      id: crypto.randomUUID(),
      text,
      referenceImages: []
    }));

    if (prompts.length === 1 && prompts[0].text.trim() === '') {
      setPrompts(newItems);
    } else {
      setPrompts([...prompts, ...newItems]);
    }
  };

  // Stats
  const validPromptsCount = prompts.filter(p => p.text && p.text.trim().length > 0).length;
  const totalImages = validPromptsCount * (safeSettings.outputCount || 1);
  const fixedBlockImages = safeSettings.fixedBlockImages || [];

  // Preview
  const getCurrentPreview = () => {
    const current = prompts[activePromptIndex] || prompts[0];
    if (!current) return '';
    let p = current.text.trim();
    const fixedText = safeSettings.fixedBlockEnabled && safeSettings.fixedBlockText?.trim()
      ? safeSettings.fixedBlockText.trim()
      : '';
    if (fixedText && safeSettings.fixedBlockPosition === 'top') {
      p = `FIXED BLOCK:\n${fixedText}\n\n${p}`;
    } else if (fixedText) {
      p += `\n\nFIXED BLOCK:\n${fixedText}`;
    }
    const fixedImgCount = safeSettings.fixedBlockEnabled ? fixedBlockImages.length : 0;
    const localCount = current.referenceImages.length;
    if (localCount + fixedImgCount > 0) {
      p += `\n\n[REFS: ${localCount} Local${fixedImgCount > 0 ? `, ${fixedImgCount} Fixed` : ''}]`;
    }
    return p;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCurrentPreview());
  };

  // Video trimmer handlers
  const handleOpenVideoTrimmer = (file: File, isGlobal: boolean, sceneId?: string) => {
    const maxDur = videoSettings?.orientation === 'video' ? 30 : 10;
    setTrimmerFile(file);
    setTrimmerMaxDuration(maxDur);
    setTrimmerIsGlobal(isGlobal);
    setTrimmerSceneId(sceneId);
    setTrimmerOpen(true);
  };

  const handleTrimmerConfirm = (trimmedFile: File, startTime: number, endTime: number) => {
    if (!videoSettings) return;

    const previewUrl = URL.createObjectURL(trimmedFile);
    const refVideo = {
      id: crypto.randomUUID(),
      file: trimmedFile,
      previewUrl,
      duration: endTime - startTime
    };

    if (trimmerIsGlobal) {
      setVideoSettings({
        ...videoSettings,
        globalReferenceVideo: refVideo
      });
    } else if (trimmerSceneId) {
      setVideoScenes(videoScenes.map(s =>
        s.id === trimmerSceneId ? { ...s, referenceVideo: refVideo } : s
      ));
    }

    setTrimmerOpen(false);
    setTrimmerFile(null);
  };

  const handleTrimmerCancel = () => {
    setTrimmerOpen(false);
    setTrimmerFile(null);
  };

  // Header subtitle text
  const getSubtitleText = () => {
    if (isVideoMode) {
      return selectedVideoModel === 'kling-2.6-pro' ? 'Kling 2.6 Pro — Image to Video' : 'Kling 2.6 Motion Control';
    }
    if (safeSettings.spicyMode?.enabled) {
      return `Seedream 4.5 ${safeSettings.spicyMode.subMode === 'edit' ? 'Edit' : 'Txt2Img'}`;
    }
    return 'Gemini Nano Banana Pro';
  };

  return (
    <>
      <BulkInputModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onProcess={handleBulkProcess}
      />

      <VideoTrimmerModal
        isOpen={trimmerOpen}
        file={trimmerFile}
        maxDuration={trimmerMaxDuration}
        onConfirm={handleTrimmerConfirm}
        onCancel={handleTrimmerCancel}
      />

      <VideoReferenceModal
        isOpen={videoRefOpen}
        file={videoRefFile}
        onConfirm={(images) => {
          const newPrompts = [...prompts];
          newPrompts[videoRefPromptIndex].referenceImages = [
            ...newPrompts[videoRefPromptIndex].referenceImages,
            ...images,
          ];
          setPrompts(newPrompts);
          setVideoRefOpen(false);
          setVideoRefFile(null);
        }}
        onCancel={() => {
          setVideoRefOpen(false);
          setVideoRefFile(null);
        }}
      />

      <div className="flex flex-col h-full bg-gray-900 border-r border-gray-800 p-0 overflow-y-auto w-full md:w-[450px] shrink-0 custom-scrollbar relative">

        {/* Header */}
        <div className="p-6 pb-4 flex justify-between items-start">
          <header className="flex-shrink-0 min-w-[140px]">
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <span className="w-3 h-3 bg-dash-300 rounded-full animate-pulse"></span>
              RAW Studio
            </h1>
            <p className="text-xs text-gray-500 mt-1 font-mono">
              {getSubtitleText()}
            </p>
          </header>

          {/* Header Controls */}
          <div className="flex items-center gap-2">
            {/* Spicy Mode Toggle - Image Mode Only */}
            {appMode === 'image' && (
              <button
                onClick={() => setSettings({
                  ...safeSettings,
                  spicyMode: { ...safeSettings.spicyMode, enabled: !safeSettings.spicyMode?.enabled }
                })}

                className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 ${
                  safeSettings.spicyMode?.enabled
                    ? 'bg-red-900/30 text-red-400 border-red-500/50 ring-1 ring-red-500/30'
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                }`}
                title={safeSettings.spicyMode?.enabled ? 'Spicy Mode ON (Seedream)' : 'Spicy Mode OFF (Gemini)'}
              >
                <span className="text-lg">🌶️</span>
                {safeSettings.spicyMode?.enabled && credits !== null && (
                  <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                    isCriticalCredits ? 'bg-red-900/50 text-red-300' :
                    isLowCredits ? 'bg-yellow-900/50 text-yellow-300' :
                    'bg-gray-800 text-gray-300'
                  }`}>
                    {creditsLoading ? '...' : credits}
                  </span>
                )}
              </button>
            )}

            {/* Video Mode Credit Balance - Header */}
            {isVideoMode && hasKieApiKey && credits !== null && (
              <div
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1.5 border ${
                  isCriticalCredits
                    ? 'bg-red-900/30 text-red-200 border-red-500/40'
                    : isLowCredits
                    ? 'bg-yellow-900/30 text-yellow-200 border-yellow-500/40'
                    : 'bg-dash-900/30 text-dash-200 border-dash-500/40'
                }`}
                title="Kie.ai Credits (for video generation)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold">{creditsLoading ? '...' : credits}</span>
                {isCriticalCredits && <span className="text-[10px] opacity-80">LOW!</span>}
              </div>
            )}

            <button
              onClick={onOpenApiKey}
              className={`p-2 rounded-lg border transition-all ${hasApiKey ? 'bg-gray-800 text-dash-300 border-dash-300/30' : 'bg-red-900/20 text-red-400 border-red-500/50 animate-pulse'}`}
              title="Manage API Keys"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Generation Mode Section - IMAGE MODE ONLY */}
        {appMode === 'image' && (
        <div className="px-6 py-3 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Generation Mode
            </span>
            <div className="flex items-center gap-2">
              {safeSettings.spicyMode?.enabled && (
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                  <button
                    onClick={() => setSettings({
                      ...safeSettings,
                      spicyMode: { ...safeSettings.spicyMode, subMode: 'edit' }
                    })}
    
                    className={`px-3 py-1 text-xs rounded-md transition-all ${
                      safeSettings.spicyMode.subMode === 'edit'
                        ? 'bg-red-500 text-white font-medium'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Edit mode - requires reference image"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setSettings({
                      ...safeSettings,
                      spicyMode: { ...safeSettings.spicyMode, subMode: 'generate' }
                    })}
    
                    className={`px-3 py-1 text-xs rounded-md transition-all ${
                      safeSettings.spicyMode.subMode === 'generate'
                        ? 'bg-red-500 text-white font-medium'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Generate mode - text only, no image needed"
                  >
                    Generate
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* ============================================ */}
        {/* UNIFIED VIDEO MODE                          */}
        {/* ============================================ */}
        {isVideoMode && (
          <>
            {/* Model Selector */}
            <div className="px-6 py-4 border-b border-gray-800">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
                Video Model
              </label>
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                {([
                  { value: 'kling-2.6' as VideoModel, label: 'Kling 2.6', desc: 'Motion Control', color: 'dash' },
                  { value: 'kling-2.6-pro' as VideoModel, label: 'Kling 2.6 Pro', desc: 'Image to Video', color: 'amber' },
                ]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleModelSelect(opt.value)}
    
                    className={`flex-1 py-2 px-2 rounded-md text-xs font-medium transition-all ${
                      selectedVideoModel === opt.value
                        ? opt.color === 'amber'
                          ? 'bg-amber-700 text-white ring-1 ring-amber-400'
                          : 'bg-dash-700 text-white ring-1 ring-dash-400'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    <span className="block leading-tight">{opt.label}</span>
                    <span className="text-[10px] opacity-60">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ----- KLING 2.6 CONTENT ----- */}
            {selectedVideoModel === 'kling-2.6' && videoSettings && (
              <>
                {/* Scene Queue */}
                <div className="px-6 py-4 border-b border-gray-800">
                  <VideoSceneQueue
                    scenes={videoScenes}
                    setScenes={setVideoScenes}
                    videoSettings={videoSettings}
                    setVideoSettings={setVideoSettings}
                    onOpenVideoTrimmer={handleOpenVideoTrimmer}
                    appMode={appMode}
                    onGenerate={onVideoGenerate}
                    isGenerating={isGenerating}
                  />
                </div>

                {/* Kling Settings */}
                <div className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Video Settings
                    </label>
                  </div>

                  {/* Orientation Control */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500">Orientation</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, orientation: 'image' })}
        
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          videoSettings.orientation === 'image'
                            ? 'bg-dash-700 text-white ring-1 ring-dash-400'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        <span className="block">Image Mode</span>
                        <span className="text-[10px] opacity-60">10s max</span>
                      </button>
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, orientation: 'video' })}
        
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          videoSettings.orientation === 'video'
                            ? 'bg-dash-700 text-white ring-1 ring-dash-400'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        <span className="block">Video Mode</span>
                        <span className="text-[10px] opacity-60">30s max</span>
                      </button>
                    </div>
                  </div>

                  {/* Resolution Control */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500">Resolution</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, resolution: '720p' })}

                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                          videoSettings.resolution === '720p'
                            ? 'bg-dash-700 text-white ring-1 ring-dash-400'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        720p
                      </button>
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, resolution: '1080p' })}

                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                          videoSettings.resolution === '1080p'
                            ? 'bg-dash-700 text-white ring-1 ring-dash-400'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        1080p
                      </button>
                    </div>
                  </div>

                  {/* Provider Control */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500">Provider</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, klingProvider: 'freepik' })}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                          (videoSettings.klingProvider || 'freepik') === 'freepik'
                            ? 'bg-indigo-600 text-white ring-1 ring-indigo-400'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        Freepik
                      </button>
                      <button
                        onClick={() => setVideoSettings({ ...videoSettings, klingProvider: 'kieai' })}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                          videoSettings.klingProvider === 'kieai'
                            ? 'bg-purple-600 text-white ring-1 ring-purple-400'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                        }`}
                      >
                        Kie.ai
                      </button>
                    </div>
                  </div>

                  {/* CFG Scale Slider (Motion Control) */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">CFG Scale</span>
                      <span className="text-xs text-dash-300 font-mono">{(videoSettings.klingCfgScale ?? 0.5).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-300"
                      value={videoSettings.klingCfgScale ?? 0.5}
                      onChange={(e) => setVideoSettings({ ...videoSettings, klingCfgScale: parseFloat(e.target.value) })}
                    />
                    <p className="text-[10px] text-gray-600">Higher = stronger prompt adherence, lower = more creative</p>
                  </div>

                  {/* Kling Info Box */}
                  <div className="p-3 bg-dash-900/20 border border-dash-500/30 rounded-lg text-xs text-dash-300">
                    <p className="font-medium mb-1">Kling 2.6 Motion Control</p>
                    <p className="text-dash-400/80">
                      {videoSettings.orientation === 'image'
                        ? 'Video-to-Video: Up to 10 seconds per scene'
                        : 'Video-to-Video: Up to 30 seconds per scene'}
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* ----- KLING 2.6 PRO I2V CONTENT ----- */}
            {selectedVideoModel === 'kling-2.6-pro' && videoSettings && (
              <>
                {/* Scene Queue (images + prompts only, no reference video) */}
                <div className="px-6 py-4 border-b border-gray-800">
                  <VideoSceneQueue
                    scenes={videoScenes}
                    setScenes={setVideoScenes}
                    videoSettings={videoSettings}
                    setVideoSettings={setVideoSettings}
                    onOpenVideoTrimmer={handleOpenVideoTrimmer}
                    appMode={appMode}
                    onGenerate={onVideoGenerate}
                    isGenerating={isGenerating}
                    hideReferenceVideo
                  />
                </div>

                {/* Pro I2V Settings */}
                <div className="px-6 py-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Pro I2V Settings
                    </label>
                  </div>

                  {/* Duration Control */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500">Duration</span>
                    <div className="flex gap-2">
                      {(['5', '10'] as KlingProDuration[]).map(dur => (
                        <button
                          key={dur}
                          onClick={() => setVideoSettings({ ...videoSettings, klingProDuration: dur } as any)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                            ((videoSettings as any).klingProDuration || '5') === dur
                              ? 'bg-amber-700 text-white ring-1 ring-amber-400'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                          }`}
                        >
                          {dur}s
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Control */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500">Aspect Ratio</span>
                    <div className="flex gap-2">
                      {([
                        { value: 'widescreen_16_9' as KlingProAspectRatio, label: '16:9' },
                        { value: 'square_1_1' as KlingProAspectRatio, label: '1:1' },
                        { value: 'social_story_9_16' as KlingProAspectRatio, label: '9:16' },
                      ]).map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setVideoSettings({ ...videoSettings, klingProAspectRatio: opt.value } as any)}
                          className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                            ((videoSettings as any).klingProAspectRatio || 'widescreen_16_9') === opt.value
                              ? 'bg-amber-700 text-white ring-1 ring-amber-400'
                              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CFG Scale Slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-gray-500">CFG Scale</span>
                      <span className="text-xs text-amber-400 font-mono">{((videoSettings as any).klingCfgScale ?? 0.5).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      value={(videoSettings as any).klingCfgScale ?? 0.5}
                      onChange={(e) => setVideoSettings({ ...videoSettings, klingCfgScale: parseFloat(e.target.value) } as any)}
                    />
                    <p className="text-[10px] text-gray-600">Higher = stronger prompt adherence, lower = more creative</p>
                  </div>

                  {/* Negative Prompt */}
                  <div className="space-y-2">
                    <span className="text-xs text-gray-500">Negative Prompt</span>
                    <textarea
                      className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 font-mono resize-y min-h-[40px]"
                      rows={2}
                      value={(videoSettings as any).klingProNegativePrompt || ''}
                      onChange={(e) => setVideoSettings({ ...videoSettings, klingProNegativePrompt: e.target.value } as any)}
                      placeholder="Things to avoid (e.g. blurry, shaky, watermark)..."
                    />
                  </div>

                  {/* Generate Audio Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-500 block">Generate Audio</span>
                      <span className="text-[10px] text-gray-600">AI-generated sound for the video</span>
                    </div>
                    <button
                      onClick={() => setVideoSettings({ ...videoSettings, klingProGenerateAudio: !(videoSettings as any).klingProGenerateAudio } as any)}
                      className={`w-10 h-5 rounded-full relative transition-colors ${
                        (videoSettings as any).klingProGenerateAudio
                          ? 'bg-amber-700 ring-1 ring-amber-400'
                          : 'bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${
                        (videoSettings as any).klingProGenerateAudio ? 'left-6' : 'left-1'
                      }`} />
                    </button>
                  </div>

                  {/* Pro Info Box */}
                  <div className="p-3 bg-amber-900/20 border border-amber-500/30 rounded-lg text-xs text-amber-300">
                    <p className="font-medium mb-1">Kling 2.6 Pro — Image to Video</p>
                    <p className="text-amber-400/80">
                      Animate any image with AI-driven motion. No reference video needed.
                    </p>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* IMAGE MODE ONLY - All generation controls */}
        {appMode === 'image' && (
        <div className="flex-1 px-6 pb-6 space-y-6">

          {/* --- PROMPT INPUT --- */}
          <div className="space-y-3">
            <div className="flex justify-between items-end border-b border-gray-800 pb-2">
              <div>
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                  Prompt Queue
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-0.5 rounded border border-gray-700">
                    {validPromptsCount} Active
                  </span>
                  {prompts.length > 0 && (prompts[0].text !== '' || prompts.length > 1) && (
                    <button
                      onClick={removeAllPrompts}
                      className="text-[10px] flex items-center gap-1 text-red-900 hover:text-red-400 transition-colors px-1"
                      title="Clear All"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <button
                onClick={() => setIsBulkModalOpen(true)}
                className="text-xs px-3 py-1.5 rounded-md bg-gray-800 text-dash-300 border border-gray-700 hover:bg-gray-700 hover:border-dash-300 transition-all flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Bulk Input
              </button>
            </div>

            <div className="space-y-3">
              {prompts.map((pItem, index) => {
                const fixedCount = safeSettings.fixedBlockEnabled ? fixedBlockImages.length : 0;
                const totalCardRefs = pItem.referenceImages.length + fixedCount;
                const isOverLimit = totalCardRefs > MAX_REFERENCE_IMAGES;

                return (
                  <div key={pItem.id} className="relative group animate-in slide-in-from-left-2 duration-200">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono text-gray-600 mt-3 w-4 text-right">
                        {index + 1}
                      </span>
                      <div className="flex-1 relative bg-gray-950 border border-gray-800 rounded-lg focus-within:ring-1 focus-within:ring-dash-300 focus-within:border-gray-600 transition-all"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.add('ring-2', 'ring-dash-300', 'bg-gray-900');
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove('ring-2', 'ring-dash-300', 'bg-gray-900');
                        }}
                        onDrop={async (e) => {
                          e.preventDefault();
                          e.currentTarget.classList.remove('ring-2', 'ring-dash-300', 'bg-gray-900');
                          const files = e.dataTransfer.files;
                          if (files && files.length > 0) {
                            await addLocalImages(index, files);
                          }
                        }}
                        onPaste={async (e) => {
                          const items = e.clipboardData?.items;
                          if (!items) return;
                          const imageFiles: File[] = [];
                          for (let i = 0; i < items.length; i++) {
                            if (items[i].type.startsWith('image/')) {
                              const file = items[i].getAsFile();
                              if (file) imageFiles.push(file);
                            }
                          }
                          if (imageFiles.length > 0) {
                            e.preventDefault();
                            const fileList = Object.assign(imageFiles, {
                              length: imageFiles.length,
                              item: (idx: number) => imageFiles[idx]
                            }) as unknown as FileList;
                            await addLocalImages(index, fileList);
                          }
                        }}
                      >
                        <textarea
                          className="w-full bg-transparent p-3 text-sm text-gray-200 outline-none resize-y min-h-[80px] font-mono relative z-10"
                          placeholder={`Describe image #${index + 1}...`}
                          value={pItem.text}
                          onChange={(e) => updatePromptText(index, e.target.value)}
                          onFocus={() => setActivePromptIndex(index)}
          
                        />

                        {/* Local Image Strip */}
                        <div className="px-3 pb-3 flex flex-wrap gap-2 items-center rounded-b-lg">
                          {pItem.referenceImages.map(img => (
                            <div key={img.id} className="relative w-10 h-10 rounded overflow-hidden group/img border border-gray-700">
                              {img.previewUrl && <img src={img.previewUrl} className="w-full h-full object-cover" alt="ref" />}
                              <button
                                onClick={() => removeLocalImage(index, img.id)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-white"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          ))}
                          <label className="w-10 h-10 flex items-center justify-center border border-dashed border-gray-700 rounded hover:border-dash-300 hover:bg-gray-900 cursor-pointer text-gray-500 hover:text-dash-300 transition-colors" title="Click or Drag onto card">
                            <input type="file" multiple accept="image/*,video/mp4,video/quicktime,video/webm" className="hidden" onChange={(e) => addLocalImages(index, e.target.files)} />
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          </label>
                          {isOverLimit && <span className="text-[10px] text-red-400 font-bold ml-auto">Max {MAX_REFERENCE_IMAGES} imgs exceeded!</span>}
                        </div>

                        {prompts.length > 1 && (
                          <button
                            onClick={() => removePrompt(index)}
                            className="absolute top-2 right-2 p-1 text-gray-600 hover:text-red-400 hover:bg-gray-900 rounded transition-colors opacity-0 group-hover:opacity-100 z-20"
                            title="Remove Prompt"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              <button
                onClick={addPrompt}

                className="w-full py-2 border border-dashed border-gray-700 hover:border-dash-300/50 hover:bg-gray-800/50 text-gray-400 hover:text-dash-200 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2 group"
              >
                <svg className="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                Add Another Prompt Card
              </button>
            </div>
          </div>

          {/* --- FIXED BLOCK --- */}
          <div
            className="space-y-2 bg-gray-800/50 p-4 rounded-lg border border-gray-800 transition-all border-dashed hover:border-solid hover:border-gray-700"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.classList.add('ring-2', 'ring-dash-300', 'bg-gray-800', 'border-dash-300');
              e.currentTarget.classList.remove('border-gray-800');
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('ring-2', 'ring-dash-300', 'bg-gray-800', 'border-dash-300');
              e.currentTarget.classList.add('border-gray-800');
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('ring-2', 'ring-dash-300', 'bg-gray-800', 'border-dash-300');
              e.currentTarget.classList.add('border-gray-800');
              const files = e.dataTransfer.files;
              if (files && files.length > 0) {
                const { images, nonImageCount } = await processFiles(files);
                if (nonImageCount > 0) {
                  alert(`Only image files are supported. ${nonImageCount} non-image file(s) were ignored.`);
                }
                const current = safeSettings.fixedBlockImages || [];
                setSettings({ ...safeSettings, fixedBlockImages: [...current, ...images] });
              }
            }}
            onPaste={async (e) => {
              const items = e.clipboardData?.items;
              if (!items) return;
              const imageFiles: File[] = [];
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                  const file = items[i].getAsFile();
                  if (file) imageFiles.push(file);
                }
              }
              if (imageFiles.length > 0) {
                const fileList = Object.assign(imageFiles, {
                  length: imageFiles.length,
                  item: (index: number) => imageFiles[index]
                }) as unknown as FileList;
                const { images, nonImageCount } = await processFiles(fileList);
                if (nonImageCount > 0) {
                  alert(`Only image files are supported. ${nonImageCount} non-image file(s) were ignored.`);
                }
                const current = safeSettings.fixedBlockImages || [];
                setSettings({ ...safeSettings, fixedBlockImages: [...current, ...images] });
              }
            }}
          >
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                Fixed Block
                <span className="text-[9px] bg-gray-700 px-1.5 py-0.5 rounded text-gray-400">Drag, Drop or Paste</span>
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${safeSettings.fixedBlockEnabled ? 'text-dash-300' : 'text-gray-500'}`}>{safeSettings.fixedBlockEnabled ? 'Active' : 'Ignored'}</span>
                <button onClick={() => setSettings({ ...safeSettings, fixedBlockEnabled: !safeSettings.fixedBlockEnabled })} className={`w-10 h-5 rounded-full relative transition-colors ${safeSettings.fixedBlockEnabled ? 'bg-dash-900 ring-1 ring-dash-300' : 'bg-gray-700'}`}>
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${safeSettings.fixedBlockEnabled ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>

            {/* Position Toggle */}
            <div className={`flex items-center gap-2 transition-opacity ${!safeSettings.fixedBlockEnabled && 'opacity-50'}`}>
              <span className="text-[10px] text-gray-500">Position:</span>
              <div className="flex gap-1 bg-gray-900 rounded p-0.5">
                <button
                  onClick={() => setSettings({ ...safeSettings, fixedBlockPosition: 'top' })}
                  className={`px-2 py-0.5 text-[10px] rounded transition-all ${
                    safeSettings.fixedBlockPosition === 'top'
                      ? 'bg-dash-900 text-dash-300 font-medium'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Top
                </button>
                <button
                  onClick={() => setSettings({ ...safeSettings, fixedBlockPosition: 'bottom' })}
                  className={`px-2 py-0.5 text-[10px] rounded transition-all ${
                    safeSettings.fixedBlockPosition === 'bottom'
                      ? 'bg-dash-900 text-dash-300 font-medium'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Bottom
                </button>
              </div>
              <span className="text-[10px] text-gray-600 ml-auto">Applies to all prompts</span>
            </div>

            {/* Fixed Block Text */}
            <textarea
              className={`w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-300 font-mono transition-opacity ${!safeSettings.fixedBlockEnabled && 'opacity-50'}`}
              rows={3}
              value={safeSettings.fixedBlockText}
              onChange={(e) => setSettings({ ...safeSettings, fixedBlockText: e.target.value })}
              placeholder="Fixed text to prepend/append to every prompt..."
            />

            {/* Fixed Block Images */}
            <div className={`flex flex-wrap gap-2 items-center transition-opacity ${!safeSettings.fixedBlockEnabled && 'opacity-50'}`}>
              {fixedBlockImages.map(img => (
                <div key={img.id} className="relative w-12 h-12 rounded overflow-hidden group border border-gray-700">
                  {img.previewUrl && <img src={img.previewUrl} className="w-full h-full object-contain" alt="fixed ref" />}
                  <button
                    onClick={() => removeFixedBlockImage(img.id)}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              <label className="w-12 h-12 flex items-center justify-center border border-dashed border-gray-600 rounded hover:border-dash-300 hover:bg-gray-700 cursor-pointer text-gray-500 hover:text-dash-300 transition-colors" title="Add fixed block images">
                <input ref={fixedBlockFileRef} type="file" multiple accept="image/*" className="hidden" onChange={addFixedBlockImages} />
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              </label>
              {fixedBlockImages.length > 0 && (
                <span className="text-[10px] text-gray-500">{fixedBlockImages.length} img(s)</span>
              )}
            </div>
          </div>

          {/* --- PROMPT GENERATOR --- */}
          <PromptGenerator
            prompts={prompts}
            setPrompts={setPrompts}
            hasApiKey={hasApiKey}
            existingReferenceImage={
              prompts[activePromptIndex]?.referenceImages?.[0] ||
              (safeSettings.fixedBlockEnabled ? fixedBlockImages[0] : null) ||
              null
            }
          />

          {/* --- SHARED SETTINGS (Aspect Ratio, Image Quality, Temp) --- */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">Aspect Ratio</label>
              <select
                className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-gray-200"
                value={safeSettings.aspectRatio}
                onChange={(e) => setSettings({ ...safeSettings, aspectRatio: e.target.value as any })}

              >
                {Object.entries(ASPECT_RATIO_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            {/* Image Quality */}
            <div className="space-y-1">
              <label className="text-xs text-gray-400 block">
                {safeSettings.spicyMode?.enabled ? 'Quality (Spicy)' : 'Image Quality'}
              </label>
              {safeSettings.spicyMode?.enabled ? (
                <select
                  className="w-full bg-gray-950 border border-red-700/50 rounded p-2 text-sm text-red-200"
                  value={safeSettings.spicyMode.quality}
                  onChange={(e) => setSettings({
                    ...safeSettings,
                    spicyMode: { ...safeSettings.spicyMode, quality: e.target.value as SeedreamQuality }
                  })}
  
                >
                  {Object.entries(SEEDREAM_QUALITY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              ) : (
                <select
                  className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-sm text-gray-200"
                  value={safeSettings.imageSize}
                  onChange={(e) => setSettings({ ...safeSettings, imageSize: e.target.value as ImageSize })}
  
                >
                  {Object.entries(IMAGE_SIZE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Temperature */}
            {!safeSettings.spicyMode?.enabled && (
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-xs text-gray-400 block">Temperature</label>
                  <span className="text-xs text-gray-400 font-mono">{(safeSettings.temperature || 1).toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-300"
                  value={safeSettings.temperature || 1}
                  onChange={(e) => setSettings({ ...safeSettings, temperature: parseFloat(e.target.value) })}
  
                />
              </div>
            )}

            {/* Batch size */}
            <div className="space-y-1 col-span-2">
              <div className="flex justify-between">
                <label className="text-xs text-gray-400 block">Batch Size</label>
                <span className="text-[10px] text-dash-300 font-mono">
                  x{safeSettings.outputCount}/prompt
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-300"
                value={safeSettings.outputCount || 1}
                onChange={(e) => {
                  let val = parseInt(e.target.value);
                  setSettings({ ...safeSettings, outputCount: val })
                }}

              />
            </div>

            {/* Safety Filter */}
            {!safeSettings.spicyMode?.enabled && (
              <div className="space-y-1 col-span-2 pt-2 border-t border-gray-800/50">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="text-xs text-gray-400 block">Safety Filter</label>
                    <span className="text-[10px] text-gray-600">
                      {safeSettings.safetyFilterEnabled ? 'Enabled (standard filtering)' : 'Disabled (no filtering)'}
                    </span>
                  </div>
                  <button
                    onClick={() => setSettings({ ...safeSettings, safetyFilterEnabled: !safeSettings.safetyFilterEnabled })}
    
                    className={`w-10 h-5 rounded-full relative transition-colors ${
                      safeSettings.safetyFilterEnabled
                        ? 'bg-green-900 ring-1 ring-green-400'
                        : 'bg-red-900 ring-1 ring-red-400'
                    }`}
                  >
                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${
                      safeSettings.safetyFilterEnabled ? 'left-6' : 'left-1'
                    }`} />
                  </button>
                </div>
              </div>
            )}

            {/* Spicy Mode Warning */}
            {safeSettings.spicyMode?.enabled && !hasKieApiKey && (
              <div className="col-span-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-300">
                Set your Kie.ai API key to use Spicy Mode
              </div>
            )}

            {/* Credit Warning */}
            {safeSettings.spicyMode?.enabled && isCriticalCredits && (
              <div className="col-span-2 p-2 bg-red-900/20 border border-red-500/30 rounded text-xs text-red-300">
                Low credits! Only {credits} remaining
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-4 border-t border-gray-800">
            {validPromptsCount <= 1 ? (
              <button
                onClick={() => onGenerate(false)}
                disabled={validPromptsCount === 0 || (safeSettings.spicyMode?.enabled ? !hasKieApiKey : !hasApiKey)}
                className={`w-full py-3 px-4 font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center leading-tight ${
                  safeSettings.spicyMode?.enabled
                    ? 'bg-red-900/30 hover:bg-red-900/50 text-red-200 border border-red-500/30'
                    : 'bg-gray-800 hover:bg-gray-700 text-white'
                }`}
              >
                <span>Generate</span>
                <span className="text-[10px] opacity-60 font-mono">({validPromptsCount} total)</span>
              </button>
            ) : (
              <button
                onClick={() => onGenerate(true)}
                disabled={validPromptsCount === 0 || (safeSettings.spicyMode?.enabled ? !hasKieApiKey : !hasApiKey)}
                className={`w-full py-3 px-4 font-bold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center leading-tight ${
                  safeSettings.spicyMode?.enabled
                    ? 'bg-red-500 hover:bg-red-400 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                    : 'bg-dash-200 hover:bg-dash-300 text-dash-900 shadow-[0_0_15px_rgba(134,239,172,0.2)]'
                }`}
              >
                <span>Batch Run</span>
                <span className="text-[10px] opacity-60 font-mono">({totalImages} total)</span>
              </button>
            )}
            {!safeSettings.spicyMode?.enabled && !hasApiKey && (
              <p className="text-center text-xs text-red-400 animate-pulse cursor-pointer" onClick={onOpenApiKey}>Gemini API Key required to generate</p>
            )}
            {safeSettings.spicyMode?.enabled && !hasKieApiKey && (
              <p className="text-center text-xs text-red-400 animate-pulse cursor-pointer" onClick={onOpenApiKey}>Kie.ai API Key required for Spicy Mode</p>
            )}
          </div>

          {/* Payload Preview */}
          <div className="bg-black/30 rounded p-3 text-xs font-mono text-gray-500 break-words relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={handleCopy} className="text-gray-400 hover:text-white" title="Copy Info">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              </button>
            </div>
            <p className="font-bold mb-1">Payload Preview:</p>
            {getCurrentPreview() || '(Empty)'}
          </div>
        </div>
        )}
        {/* END IMAGE MODE ONLY */}
      </div>
    </>
  );
};

export default LeftPanel;
