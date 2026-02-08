import React, { useRef, useState } from 'react';
import { VideoScene, VideoSettings, ReferenceImage, ReferenceVideo } from '../types';
import { validateVideoFile } from '../services/kling-motion-control-service';
import { VIDEO_CONSTRAINTS } from '../constants';
import { getVideoDuration } from '../utils/video-dimensions';

interface VideoSceneQueueProps {
  scenes: VideoScene[];
  setScenes: (scenes: VideoScene[]) => void;
  videoSettings: VideoSettings;
  setVideoSettings: (settings: VideoSettings) => void;
  onOpenVideoTrimmer: (file: File, isGlobal: boolean, sceneId?: string) => void;
  appMode: 'image' | 'video';
  onGenerate: () => void;
  isGenerating: boolean;
}

const VideoSceneQueue: React.FC<VideoSceneQueueProps> = ({
  scenes,
  setScenes,
  videoSettings,
  setVideoSettings,
  onOpenVideoTrimmer,
  appMode,
  onGenerate,
  isGenerating
}) => {
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [globalVideoDragOver, setGlobalVideoDragOver] = useState(false);
  const [perSceneVideoDragOver, setPerSceneVideoDragOver] = useState<string | null>(null);
  const globalVideoRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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
      {/* Video Reference Mode Toggle */}
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

      {/* Global Reference Video */}
      {videoSettings.referenceVideoMode === 'global' && (
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
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Scene Queue
        </label>

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
              className="bg-gray-800/50 rounded-lg border border-gray-700 p-3 space-y-2 relative group"
            >
              {/* Scene Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-400">Scene {index + 1}</span>
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
                <img
                  src={scene.referenceImage.previewUrl || `data:${scene.referenceImage.mimeType};base64,${scene.referenceImage.base64}`}
                  alt={`Scene ${index + 1}`}
                  className="w-full h-full object-contain"
                />
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

              {/* Per-Scene Video Upload (if per-scene mode) */}
              {videoSettings.referenceVideoMode === 'per-scene' && (
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

      {/* Generate Button */}
      {scenes.length > 0 && (
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className={`w-full py-3 font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
            isGenerating
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-dash-700 hover:bg-dash-600 text-white'
          }`}
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
