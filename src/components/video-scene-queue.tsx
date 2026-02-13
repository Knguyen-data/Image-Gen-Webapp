import React, { useRef, useState } from 'react';
import { VideoScene, VideoSettings, ReferenceImage, ReferenceVideo, UnifiedVideoSettings } from '../types';
import { validateVideoFile } from '../services/kling-motion-control-service';
import { VIDEO_CONSTRAINTS } from '../constants';
import { getVideoDuration } from '../utils/video-dimensions';
import {
  generateMotionPrompts,
  generateMotionControlPrompts, // New import
  MotionStylePreset,
  MOTION_STYLE_OPTIONS,
} from '../services/motion-director-service';

// Helper to convert File to Base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Remove data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

interface VideoSceneQueueProps {
  scenes: VideoScene[];
  setScenes: (scenes: VideoScene[]) => void;
  videoSettings: UnifiedVideoSettings; // Changed from VideoSettings
  setVideoSettings: (settings: UnifiedVideoSettings) => void; // Changed from VideoSettings
  onOpenVideoTrimmer: (file: File, isGlobal: boolean, sceneId?: string) => void;
  appMode: 'image' | 'video';
  onGenerate: () => void;
  isGenerating: boolean;
  hideReferenceVideo?: boolean;
  geminiApiKey?: string;
}

const VideoSceneQueue: React.FC<VideoSceneQueueProps> = ({
  scenes,
  setScenes,
  videoSettings,
  setVideoSettings,
  onOpenVideoTrimmer,
  appMode,
  onGenerate,
  isGenerating,
  hideReferenceVideo = false,
  geminiApiKey = '',
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [globalVideoDragOver, setGlobalVideoDragOver] = useState(false);
  const [perSceneVideoDragOver, setPerSceneVideoDragOver] = useState<string | null>(null);
  const globalVideoRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Scene reorder drag state
  const [reorderDragIndex, setReorderDragIndex] = useState<number | null>(null);
  const [reorderOverIndex, setReorderOverIndex] = useState<number | null>(null);

  // Kling 3 helpers
  const isKling3 = videoSettings.model === 'kling-3' || videoSettings.model === 'kling-3-omni';
  const isKling3Omni = videoSettings.model === 'kling-3-omni';
  
  // Calculate total duration for Kling 3 MultiShot
  const totalDuration = isKling3 ? scenes.reduce((acc, s) => acc + (s.duration || 3), 0) : 0;
  const maxScenes = isKling3 ? 6 : 999;
  
  // Update scene duration (Kling 3 only)
  const updateSceneDuration = (sceneId: string, duration: number) => {
    setScenes(scenes.map(s =>
      s.id === sceneId ? { ...s, duration: Math.max(3, duration) } : s
    ));
  };

  // Auto Motion state
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [isAutoMotion, setIsAutoMotion] = useState(false);
  const [autoMotionError, setAutoMotionError] = useState<string | null>(null);

  // Auto Motion handler
  const handleAutoMotion = async (preset: MotionStylePreset) => {
    setShowStylePicker(false);
    if (!geminiApiKey) {
      setAutoMotionError('Set your Gemini API key first');
      setTimeout(() => setAutoMotionError(null), 3000);
      return;
    }

    const scenesWithImages = scenes.filter(s => s.referenceImage);
    if (scenesWithImages.length === 0) {
      setAutoMotionError('Add images to scenes first');
      setTimeout(() => setAutoMotionError(null), 3000);
      return;
    }

    setIsAutoMotion(true);
    setAutoMotionError(null);

    try {
      const images = scenesWithImages.map(s => ({
        base64: s.referenceImage.base64,
        mime_type: s.referenceImage.mimeType,
      }));

      let result;

      if (videoSettings.model === 'kling-2.6' && videoSettings.globalReferenceVideo) {
        // Motion Control Pipeline
        const globalReferenceVideo = videoSettings.globalReferenceVideo;
        const globalReferenceVideoBase64 = await fileToBase64(globalReferenceVideo.file);
        const globalReferenceVideoMimeType = globalReferenceVideo.file.type;

        result = await generateMotionControlPrompts(
          geminiApiKey,
          images,
          preset,
          globalReferenceVideoBase64,
          globalReferenceVideoMimeType,
          videoSettings.orientation, // characterOrientation
          videoSettings.klingProGenerateAudio, // keepOriginalSound
        );
      } else if (videoSettings.model === 'kling-2.6') {
        // Pro I2V Pipeline
        result = await generateMotionPrompts(geminiApiKey, images, preset);
      } else {
        // Handle other models or throw an error if no appropriate pipeline is found
        setAutoMotionError(`Auto motion is not supported for model: ${videoSettings.model}`);
        setTimeout(() => setAutoMotionError(null), 3000);
        return;
      }

      // Auto-fill prompts into scenes
      let updated = scenes.map((scene, i) => {
        const match = result.prompts.find(p => p.scene_index === i);
        if (match && scene.referenceImage) {
          return {
            ...scene,
            prompt: match.motion_prompt,
            usePrompt: true,
          };
        }
        return scene;
      });

      // Merge all per-scene negative prompts into ONE global negative prompt
      const negativePrompts = result.prompts
        .map(p => p.negative_prompt)
        .filter((np): np is string => !!np && np.trim().length > 0);
      if (negativePrompts.length > 0) {
        // Deduplicate and merge
        const uniqueNegatives = [...new Set(
          negativePrompts.flatMap(np => np.split(',').map(s => s.trim().toLowerCase()))
        )].filter(Boolean);
        const mergedNegative = uniqueNegatives.join(', ');
        setVideoSettings({
          ...videoSettings,
          klingProNegativePrompt: mergedNegative,
        });
        // Flag user about global setting update
        alert(`✨ Auto Motion updated PRO I2V Settings:\n\n• Negative Prompt auto-filled from ${negativePrompts.length} scene(s)\n• Check "PRO I2V Settings" below to review/edit`);
      }

      // Apply recommended order if provided by Config Agent
      if (result.recommendedOrder && result.recommendedOrder.length === updated.length) {
        const reordered = result.recommendedOrder
          .map(idx => updated[idx])
          .filter(Boolean);
        if (reordered.length === updated.length) {
          updated = reordered;
          console.log('[Motion Director] Applied recommended order:', result.recommendedOrder);
          if (result.orderReasoning) {
            console.log('[Motion Director] Reasoning:', result.orderReasoning);
          }
        }
      }

      setScenes(updated);
    } catch (err: any) {
      setAutoMotionError(err.message || 'Motion Director failed');
      setTimeout(() => setAutoMotionError(null), 5000);
    } finally {
      setIsAutoMotion(false);
    }
  };

  // Handle drop of video file onto global video zone
  const handleGlobalVideoDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setGlobalVideoDragOver(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        await handleGlobalVideoUploadFromFile(file);
      }
    }
  };

  const handleGlobalVideoDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setGlobalVideoDragOver(true);
  };

  const handleGlobalVideoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setGlobalVideoDragOver(false);
  };

  // Handle drop of image from gallery OR external file
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverIndex(null);

    // Kling 3: Max 6 scenes limit
    if (isKling3 && scenes.length >= maxScenes) {
      alert(`Kling 3 MultiShot mode supports maximum ${maxScenes} scenes`);
      return;
    }

    // Check for external file drop FIRST
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          const refImage: ReferenceImage = {
            id: crypto.randomUUID(),
            base64,
            mimeType: file.type,
            previewUrl: URL.createObjectURL(file)
          };

          const newScene: VideoScene = {
            id: crypto.randomUUID(),
            referenceImage: refImage,
            prompt: '',
            usePrompt: true
          };

          setScenes([...scenes, newScene]);
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    // Fallback to internal gallery drag (JSON)
    try {
      const imageData = e.dataTransfer.getData('application/json');
      if (!imageData) return;

      const image = JSON.parse(imageData) as ReferenceImage;

      // Create new scene
      const newScene: VideoScene = {
        id: crypto.randomUUID(),
        referenceImage: image,
        prompt: '',
        usePrompt: true
      };

      setScenes([...scenes, newScene]);
    } catch (err) {
      console.error('Failed to parse dropped image:', err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const updateScenePrompt = (sceneId: string, prompt: string) => {
    setScenes(scenes.map(s =>
      s.id === sceneId ? { ...s, prompt } : s
    ));
  };

  const toggleSceneUsePrompt = (sceneId: string) => {
    setScenes(scenes.map(s =>
      s.id === sceneId ? { ...s, usePrompt: !s.usePrompt } : s
    ));
  };

  const removeScene = (sceneId: string) => {
    setScenes(scenes.filter(s => s.id !== sceneId));
  };

  // --- SCENE REORDER (Drag-to-reorder) ---
  const handleSceneDragStart = (e: React.DragEvent, index: number) => {
    setReorderDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index)); // Needed for Firefox
    // Make the drag image slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleSceneDragEnd = (e: React.DragEvent) => {
    setReorderDragIndex(null);
    setReorderOverIndex(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleSceneDragOverReorder = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (reorderDragIndex === null || reorderDragIndex === index) return;
    setReorderOverIndex(index);
    e.dataTransfer.dropEffect = 'move';
  };

  const handleSceneDropReorder = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (reorderDragIndex === null || reorderDragIndex === dropIndex) {
      setReorderDragIndex(null);
      setReorderOverIndex(null);
      return;
    }

    const reordered = [...scenes];
    const [moved] = reordered.splice(reorderDragIndex, 1);
    reordered.splice(dropIndex, 0, moved);
    setScenes(reordered);
    setReorderDragIndex(null);
    setReorderOverIndex(null);
  };

  // --- SHUFFLE SCENES (randomize order) ---
  const shuffleScenes = () => {
    if (scenes.length <= 1) return;
    const shuffled = [...scenes];
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setScenes(shuffled);
  };

  // --- MOVE SCENE (programmatic, for agent use) ---
  const moveScene = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= scenes.length || toIndex < 0 || toIndex >= scenes.length) return;
    const reordered = [...scenes];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setScenes(reordered);
  };

  // Expose shuffle/move/reorder for programmatic access (agent, console, browser automation)
  React.useEffect(() => {
    (window as any).__videoSceneControls = {
      shuffle: shuffleScenes,
      move: moveScene,
      getScenes: () => scenes,
      setOrder: (ids: string[]) => {
        const ordered = ids
          .map(id => scenes.find(s => s.id === id))
          .filter(Boolean) as typeof scenes;
        // Add any scenes not in the new order at the end
        const remaining = scenes.filter(s => !ids.includes(s.id));
        setScenes([...ordered, ...remaining]);
      },
      reverse: () => setScenes([...scenes].reverse()),
    };
    return () => { delete (window as any).__videoSceneControls; };
  }, [scenes]);

  const handleGlobalVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await handleGlobalVideoUploadFromFile(file);

    if (globalVideoRef.current) {
      globalVideoRef.current.value = '';
    }
  };

  const handleGlobalVideoUploadFromFile = async (file: File) => {
    // Clear previous error
    setValidationError(null);

    // Full validation (format, size, duration)
    const validation = await validateVideoFile(file, videoSettings.orientation);

    if (!validation.valid) {
      // Check if it's a duration issue that can be fixed by trimming
      if (validation.error?.includes('Duration') || validation.error?.includes('duration')) {
        const duration = await getVideoDuration(file);
        const maxDuration = videoSettings.orientation === 'video' ? 30 : 10;

        if (duration > maxDuration) {
          // Too long - open trimmer modal
          onOpenVideoTrimmer(file, true);
        } else {
          // Too short - cannot be fixed by trimming
          setValidationError(validation.error);
          alert(validation.error);
        }
      } else {
        // Format or size error - reject with message
        setValidationError(validation.error);
        alert(validation.error);
      }

      if (globalVideoRef.current) {
        globalVideoRef.current.value = '';
      }
      return;
    }

    // Validation passed - accept video
    const duration = await getVideoDuration(file);
    const previewUrl = URL.createObjectURL(file);
    const refVideo: ReferenceVideo = {
      id: crypto.randomUUID(),
      file,
      previewUrl,
      duration
    };
    setVideoSettings({
      ...videoSettings,
      globalReferenceVideo: refVideo
    });

    if (globalVideoRef.current) {
      globalVideoRef.current.value = '';
    }
  };

  const handlePerSceneVideoUpload = async (sceneId: string, file: File) => {
    // Clear previous error
    setValidationError(null);

    // Full validation (format, size, duration)
    const validation = await validateVideoFile(file, videoSettings.orientation);

    if (!validation.valid) {
      // Check if it's a duration issue that can be fixed by trimming
      if (validation.error?.includes('Duration') || validation.error?.includes('duration')) {
        const duration = await getVideoDuration(file);
        const maxDuration = videoSettings.orientation === 'video' ? 30 : 10;

        if (duration > maxDuration) {
          // Too long - open trimmer modal
          onOpenVideoTrimmer(file, false, sceneId);
        } else {
          // Too short - cannot be fixed by trimming
          setValidationError(validation.error);
          alert(validation.error);
        }
      } else {
        // Format or size error - reject with message
        setValidationError(validation.error);
        alert(validation.error);
      }
      return;
    }

    // Validation passed - accept video
    const duration = await getVideoDuration(file);
    const previewUrl = URL.createObjectURL(file);
    const refVideo: ReferenceVideo = {
      id: crypto.randomUUID(),
      file,
      previewUrl,
      duration
    };

    setScenes(scenes.map(s =>
      s.id === sceneId ? { ...s, referenceVideo: refVideo } : s
    ));
  };

  // Handle drop of video file onto per-scene video zone
  const handlePerSceneVideoDrop = async (e: React.DragEvent, sceneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPerSceneVideoDragOver(null);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        await handlePerSceneVideoUpload(sceneId, file);
      }
    }
  };

  const handlePerSceneVideoDragOver = (e: React.DragEvent, sceneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPerSceneVideoDragOver(sceneId);
  };

  const handlePerSceneVideoDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPerSceneVideoDragOver(null);
  };

  const removeGlobalVideo = () => {
    if (videoSettings.globalReferenceVideo) {
      URL.revokeObjectURL(videoSettings.globalReferenceVideo.previewUrl);
    }
    setVideoSettings({
      ...videoSettings,
      globalReferenceVideo: undefined
    });
  };

  const removeSceneVideo = (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (scene?.referenceVideo) {
      URL.revokeObjectURL(scene.referenceVideo.previewUrl);
    }
    setScenes(scenes.map(s =>
      s.id === sceneId ? { ...s, referenceVideo: undefined } : s
    ));
  };

  return (
    <div className="space-y-4">
      {/* Video Reference Mode Toggle — hidden for Pro I2V */}
      {!hideReferenceVideo && (
      <div className="space-y-2">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Reference Video Mode
        </label>
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setVideoSettings({ ...videoSettings, referenceVideoMode: 'global' })}
            className={`flex-1 px-3 py-2 text-xs rounded-md transition-all ${
              videoSettings.referenceVideoMode === 'global'
                ? 'bg-dash-700 text-white font-medium'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Global
          </button>
          <button
            onClick={() => setVideoSettings({ ...videoSettings, referenceVideoMode: 'per-scene' })}
            className={`flex-1 px-3 py-2 text-xs rounded-md transition-all ${
              videoSettings.referenceVideoMode === 'per-scene'
                ? 'bg-dash-700 text-white font-medium'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Per-Scene
          </button>
        </div>
      </div>
      )}

      {/* Global Reference Video — hidden for Pro I2V */}
      {!hideReferenceVideo && videoSettings.referenceVideoMode === 'global' && (
        <div className="space-y-2 bg-gray-800/50 p-3 rounded-lg border border-gray-700">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Global Reference Video
          </label>
          {videoSettings.globalReferenceVideo ? (
            <div className="space-y-2">
              <div className="relative aspect-video bg-gray-950 rounded overflow-hidden">
                <video
                  src={videoSettings.globalReferenceVideo.previewUrl}
                  className="w-full h-full object-contain"
                  controls
                />
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span className="font-mono">
                  Duration: {videoSettings.globalReferenceVideo.duration?.toFixed(1)}s
                </span>
                <button
                  onClick={removeGlobalVideo}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div
              onDrop={handleGlobalVideoDrop}
              onDragOver={handleGlobalVideoDragOver}
              onDragLeave={handleGlobalVideoDragLeave}
              className={`block w-full py-3 border border-dashed rounded-lg hover:border-dash-500 hover:bg-gray-700/50 cursor-pointer text-center text-sm text-gray-400 hover:text-dash-300 transition-all ${
                globalVideoDragOver ? 'border-dash-500 bg-dash-500/10' : 'border-gray-600'
              }`}
            >
              <label className="cursor-pointer block w-full h-full">
                <input
                  ref={globalVideoRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleGlobalVideoUpload}
                />
                {globalVideoDragOver ? 'Drop video here' : 'Upload Video or Drop Here'}
              </label>
            </div>
          )}
        </div>
      )}

      {/* Scene Queue */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Scene Queue
            {isKling3 && (
              <span className={`ml-2 text-[10px] font-normal ${scenes.length >= maxScenes ? 'text-red-400' : 'text-gray-500'}`}>
                ({scenes.length}/{maxScenes} scenes)
              </span>
            )}
          </label>
          {scenes.length > 1 && (
            <button
              onClick={shuffleScenes}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-all border border-gray-700"
              title="Shuffle scene order"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Shuffle
            </button>
          )}
        </div>

        {/* Kling 3: Total Duration Indicator */}
        {isKling3 && scenes.length > 0 && (
          <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
            isKling3Omni
              ? 'bg-dash-900/20 border-dash-500/40 text-dash-300'
              : totalDuration > 15
                ? 'bg-red-900/20 border-red-500/40 text-red-300'
                : 'bg-emerald-900/20 border-emerald-500/40 text-emerald-300'
          }`}>
            <span className="font-medium">{isKling3Omni ? 'Duration:' : 'Total Duration:'}</span>
            <span className="font-mono font-semibold">{isKling3Omni ? 'Auto-distributed across shots' : `${totalDuration}s / 15s`}</span>
          </div>
        )}

        {/* Drop Zone */}
        {scenes.length === 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={() => setDragOverIndex(0)}
            onDragLeave={() => setDragOverIndex(null)}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
              dragOverIndex === 0
                ? 'border-dash-500 bg-dash-500/10'
                : 'border-gray-700 bg-gray-800/30'
            }`}
          >
            <svg className="w-12 h-12 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-gray-400">Drop images here to create scenes</p>
            <p className="text-xs text-gray-600 mt-1">Drag from gallery →</p>
          </div>
        )}

        {/* Scene List */}
        <div className="space-y-3">
          {scenes.map((scene, index) => (
            <div
              key={scene.id}
              draggable
              onDragStart={(e) => handleSceneDragStart(e, index)}
              onDragEnd={handleSceneDragEnd}
              onDragOver={(e) => handleSceneDragOverReorder(e, index)}
              onDrop={(e) => handleSceneDropReorder(e, index)}
              className={`bg-gray-800/50 rounded-lg border p-3 space-y-2 relative group transition-all ${
                reorderOverIndex === index && reorderDragIndex !== null
                  ? 'border-dash-400 ring-2 ring-dash-400/30 scale-[1.02]'
                  : reorderDragIndex === index
                    ? 'border-gray-600 opacity-50'
                    : 'border-gray-700'
              }`}
            >
              {/* Scene Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {/* Drag Handle */}
                  <div
                    className="cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 transition-colors p-0.5"
                    title="Drag to reorder"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 6a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm8-16a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold text-gray-400">Scene {index + 1}</span>
                </div>
                <button
                  onClick={() => removeScene(scene.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 p-1"
                  title="Remove Scene"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Reference Image */}
              <div className="relative aspect-video bg-gray-950 rounded overflow-hidden">
                {(scene.referenceImage.previewUrl || scene.referenceImage.base64) ? (
                  <img
                    src={scene.referenceImage.previewUrl || `data:${scene.referenceImage.mimeType};base64,${scene.referenceImage.base64}`}
                    alt={`Scene ${index + 1}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">No image</div>
                )}
              </div>

              {/* Prompt Toggle and Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400">Motion Prompt (Optional)</label>
                  <button
                    onClick={() => toggleSceneUsePrompt(scene.id)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all ${
                      scene.usePrompt
                        ? 'bg-dash-900/30 text-dash-300 border border-dash-500/40'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded border transition-all ${
                      scene.usePrompt
                        ? 'bg-dash-500 border-dash-500'
                        : 'bg-transparent border-gray-600'
                    }`}>
                      {scene.usePrompt && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span>{scene.usePrompt ? 'Enabled' : 'Disabled'}</span>
                  </button>
                </div>
                {scene.usePrompt && (
                  <textarea
                    className="w-full bg-gray-950 border border-gray-700 rounded p-2 text-xs text-gray-200 outline-none focus:border-dash-500 resize-none font-mono"
                    rows={2}
                    placeholder={`Describe motion for scene ${index + 1}...`}
                    value={scene.prompt || ''}
                    onChange={(e) => updateScenePrompt(scene.id, e.target.value)}
                  />
                )}
              </div>

              {/* Per-Scene Video Upload (if per-scene mode, hidden for Pro I2V) */}
              {!hideReferenceVideo && videoSettings.referenceVideoMode === 'per-scene' && (
                <div className="space-y-1">
                  {scene.referenceVideo ? (
                    <div className="space-y-1">
                      <div className="relative aspect-video bg-gray-950 rounded overflow-hidden">
                        <video
                          src={scene.referenceVideo.previewUrl}
                          className="w-full h-full object-contain"
                          controls
                        />
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span className="font-mono">
                          {scene.referenceVideo.duration?.toFixed(1)}s
                        </span>
                        <button
                          onClick={() => removeSceneVideo(scene.id)}
                          className="text-red-400 hover:text-red-300 flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onDrop={(e) => handlePerSceneVideoDrop(e, scene.id)}
                      onDragOver={(e) => handlePerSceneVideoDragOver(e, scene.id)}
                      onDragLeave={handlePerSceneVideoDragLeave}
                      className={`block w-full py-2 border border-dashed rounded hover:border-dash-500 hover:bg-gray-700/50 cursor-pointer text-center text-xs text-gray-400 hover:text-dash-300 transition-all ${
                        perSceneVideoDragOver === scene.id ? 'border-dash-500 bg-dash-500/10' : 'border-gray-700'
                      }`}
                    >
                      <label className="cursor-pointer block w-full h-full">
                        <input
                          type="file"
                          accept="video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePerSceneVideoUpload(scene.id, file);
                          }}
                        />
                        {perSceneVideoDragOver === scene.id ? 'Drop video here' : '+ Reference Video or Drop Here'}
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add More Drop Zone */}
        {scenes.length > 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={() => setDragOverIndex(scenes.length)}
            onDragLeave={() => setDragOverIndex(null)}
            className={`border-2 border-dashed rounded-lg p-4 text-center transition-all ${
              dragOverIndex === scenes.length
                ? 'border-dash-500 bg-dash-500/10'
                : 'border-gray-700 bg-gray-800/10'
            }`}
          >
            <p className="text-xs text-gray-500">Drop more images to add scenes</p>
          </div>
        )}
      </div>

      {/* Auto Motion Button — disabled for Kling 2.6 Motion Control */}
      {!isKling3 && videoSettings.model !== 'kling-2.6' && scenes.length > 0 && scenes.some(s => s.referenceImage) && (
        <div className="relative mb-2">
          {autoMotionError && (
            <p className="text-xs text-red-400 mb-1">{autoMotionError}</p>
          )}
          <button
            onClick={() => setShowStylePicker(!showStylePicker)}
            disabled={isAutoMotion || isGenerating}
            className="w-full py-2.5 font-medium rounded-lg transition-all flex items-center justify-center gap-2 border border-dash-500/50 bg-dash-500/10 hover:bg-dash-500/20 text-dash-300 disabled:opacity-50"
          >
            {isAutoMotion ? (
              <>
                <div className="w-4 h-4 border-2 border-dash-400 border-t-transparent rounded-full animate-spin"></div>
                Generating motion prompts...
              </>
            ) : (
              <>
                {(videoSettings.model === 'kling-2.6' || videoSettings.model === 'kling-2.6-pro') && videoSettings.globalReferenceVideo
                  ? '🏃 Auto Motion Control'
                  : isKling3 
                  ? (isKling3Omni ? '🎬 Auto Omni' : '🎬 Auto MultiShot')
                  : '✨ Auto Motion Prompts'
                }
              </>
            )}
          </button>

          {/* Style Preset Picker */}
          {showStylePicker && !isAutoMotion && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
              <p className="text-xs text-gray-400 px-3 pt-2 pb-1">Pick a style:</p>
              {MOTION_STYLE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleAutoMotion(opt.value)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-700 flex items-center gap-2 transition-colors"
                >
                  <span className="text-lg">{opt.icon}</span>
                  <div>
                    <p className="text-sm text-white font-medium">{opt.label}</p>
                    <p className="text-xs text-gray-400">{opt.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate Button */}
      {scenes.length > 0 && (
        <button
          onClick={onGenerate}
          className="w-full py-3 font-semibold rounded-lg transition-all flex items-center justify-center gap-2 bg-dash-700 hover:bg-dash-600 text-white"
        >
          {isGenerating ? (
            <>
              <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Generate {scenes.length} Video{scenes.length > 1 ? 's' : ''}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default VideoSceneQueue;
