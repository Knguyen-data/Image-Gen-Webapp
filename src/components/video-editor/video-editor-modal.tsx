import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { GeneratedVideo } from '../../types';
import videoEditorService from '../../services/video-editor-service';
import type {
  EditorLayerInfo,
  TransitionType,
  EncoderProgress,
} from '../../services/video-editor-service';
import { uploadBase64ToR2 } from '../../services/supabase-storage-service';
import EditorToolbar from './editor-toolbar';
import TimelineTrack from './timeline-track';
import TransitionPicker from './transition-picker';
import StockGallery from '../stock-gallery/stock-gallery';
import { logger } from '../../services/logger';

// Suppress known non-critical errors from Diffusion Studio Core
// Blob URLs don't support HEAD requests - this is a browser limitation
const suppressCoreErrors = () => {
  const originalError = console.error;
  console.error = (...args: any[]) => {
    const message = String(args[0] || '');
    if (message.includes('ERR_METHOD_NOT_SUPPORTED') || message.includes('blob:')) {
      return; // Suppress known non-critical error
    }
    originalError.apply(console, args);
  };
  return () => {
    console.error = originalError;
  };
};

interface VideoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  videos: GeneratedVideo[];
  onExportComplete?: (video: GeneratedVideo) => void;
}

const VideoEditorModal: React.FC<VideoEditorModalProps> = ({
  isOpen,
  onClose,
  videos,
  onExportComplete,
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // Editor state
  const [layers, setLayers] = useState<EditorLayerInfo[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timeDisplay, setTimeDisplay] = useState('00:00 / 00:00');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);

  // Drag reorder state
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragOverClipId, setDragOverClipId] = useState<string | null>(null);

  // Transition picker state
  const [transitionPicker, setTransitionPicker] = useState<{
    clipId: string;
    layerIndex: number;
    clipIndex: number;
    position: { x: number; y: number };
    currentType?: TransitionType;
  } | null>(null);

  // Stock Gallery state
  const [showStockGallery, setShowStockGallery] = useState(false);

  const pixelsPerSecond = 80 * zoom;

  // Initialize the composition
  useEffect(() => {
    if (!isOpen) return;

    // Suppress known non-critical errors from Diffusion Studio Core
    const restoreConsole = suppressCoreErrors();

    const init = async () => {
      setIsLoading(true);
      setLoadingMessage('Initializing editor...');
      setInitError(null);

      try {
        await videoEditorService.createProject(1920, 1080);

        // Mount to canvas container
        if (canvasContainerRef.current) {
          videoEditorService.mount(canvasContainerRef.current);
        }

        // Add default layer
        await videoEditorService.addLayer('SEQUENTIAL');

        // Pre-populate with provided videos
        if (videos.length > 0) {
          setLoadingMessage(`Loading ${videos.length} clips...`);

          for (let i = 0; i < videos.length; i++) {
            const video = videos[i];
            if (video.status !== 'success' || !video.url) continue;

            try {
              setLoadingMessage(`Loading clip ${i + 1}/${videos.length}...`);
              await videoEditorService.addClip(0, video.url, undefined, 'generated');
            } catch (clipError) {
              logger.warn('VideoEditor', `Failed to load clip ${video.id}`, clipError);
            }
          }
        }

        refreshLayers();
        setIsLoading(false);
      } catch (error: any) {
        logger.error('VideoEditor', 'Failed to initialize editor', error);
        setInitError(error.message || 'Failed to initialize video editor');
        setIsLoading(false);
      }
    };

    init();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      videoEditorService.destroy();
      restoreConsole();
    };
  }, [isOpen]);

  // Playback time updater
  useEffect(() => {
    if (!isOpen) return;

    const updateTime = () => {
      const comp = videoEditorService.getComposition();
      if (comp) {
        setCurrentTime(comp.currentTime);
        setDuration(comp.duration / 30);
        setTimeDisplay(comp.time());
        setIsPlaying(comp.playing);
      }
      animFrameRef.current = requestAnimationFrame(updateTime);
    };

    animFrameRef.current = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isOpen]);

  const refreshLayers = useCallback(() => {
    setLayers(videoEditorService.getLayerInfo());
  }, []);

  // --- Playback handlers ---
  const handlePlay = async () => {
    try {
      await videoEditorService.play();
      setIsPlaying(true);
    } catch (e) {
      logger.warn('VideoEditor', 'Play failed', e);
    }
  };

  const handlePause = async () => {
    try {
      await videoEditorService.pause();
      setIsPlaying(false);
    } catch (e) {
      logger.warn('VideoEditor', 'Pause failed', e);
    }
  };

  const handleSeek = async (time: number) => {
    try {
      await videoEditorService.seek(time);
      setCurrentTime(time);
    } catch (e) {
      logger.warn('VideoEditor', 'Seek failed', e);
    }
  };

  // --- Clip handlers ---
  const handleTrimStart = useCallback((clipId: string, newStartSec: number) => {
    // Find the clip's layer and index
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === clipId);
      if (clipIdx >= 0) {
        const clip = layer.clips[clipIdx];
        videoEditorService.setTrim(layer.index, clipIdx, newStartSec, clip.endSec);
        refreshLayers();
        break;
      }
    }
  }, [layers, refreshLayers]);

  const handleTrimEnd = useCallback((clipId: string, newEndSec: number) => {
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === clipId);
      if (clipIdx >= 0) {
        const clip = layer.clips[clipIdx];
        videoEditorService.setTrim(layer.index, clipIdx, clip.startSec, newEndSec);
        refreshLayers();
        break;
      }
    }
  }, [layers, refreshLayers]);

  const handleRemoveClip = useCallback((clipId: string) => {
    videoEditorService.removeClipById(clipId);
    if (selectedClipId === clipId) setSelectedClipId(null);
    refreshLayers();
  }, [selectedClipId, refreshLayers]);

  const handleRemoveTrack = useCallback((layerIndex: number) => {
    const comp = videoEditorService.getComposition();
    if (!comp) return;
    const layer = comp.layers[layerIndex];
    if (layer && layer.clips.length === 0) {
      comp.remove(layer);
      refreshLayers();
    }
  }, [refreshLayers]);

  // --- Transition handlers ---
  const handleTransitionClick = useCallback((clipId: string, position: { x: number; y: number }) => {
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === clipId);
      if (clipIdx >= 0) {
        setTransitionPicker({
          clipId,
          layerIndex: layer.index,
          clipIndex: clipIdx,
          position,
          currentType: layer.clips[clipIdx].transition?.type as TransitionType | undefined,
        });
        break;
      }
    }
  }, [layers]);

  const handleSetTransition = useCallback((type: TransitionType) => {
    if (!transitionPicker) return;
    videoEditorService.setTransition(transitionPicker.layerIndex, transitionPicker.clipIndex, type, 1);
    refreshLayers();
    setTransitionPicker(null);
  }, [transitionPicker, refreshLayers]);

  const handleRemoveTransition = useCallback(() => {
    if (!transitionPicker) return;
    videoEditorService.removeTransition(transitionPicker.layerIndex, transitionPicker.clipIndex);
    refreshLayers();
    setTransitionPicker(null);
  }, [transitionPicker, refreshLayers]);

  // --- Track/layer handlers ---
  const handleAddTrack = async () => {
    await videoEditorService.addLayer('SEQUENTIAL');
    refreshLayers();
  };

  // --- Import handlers ---
  const handleImportBroll = async (files: FileList) => {
    setIsLoading(true);
    setLoadingMessage('Importing B-roll...');

    // Find first empty track or create new one
    let targetLayerIndex = layers.findIndex(l => l.clips.length === 0);
    if (targetLayerIndex < 0) {
      targetLayerIndex = await videoEditorService.addLayer('SEQUENTIAL');
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setLoadingMessage(`Importing ${file.name}...`);
      try {
        await videoEditorService.addClipFromFile(targetLayerIndex, file, 'broll');
      } catch (e) {
        logger.warn('VideoEditor', `Failed to import ${file.name}`, e);
      }
    }

    refreshLayers();
    setIsLoading(false);
  };

  const handleImportUrl = async (url: string) => {
    setIsLoading(true);
    setLoadingMessage('Importing from URL...');

    let targetLayerIndex = layers.findIndex(l => l.clips.length === 0);
    if (targetLayerIndex < 0) {
      targetLayerIndex = await videoEditorService.addLayer('SEQUENTIAL');
    }

    try {
      await videoEditorService.addClip(targetLayerIndex, url, undefined, 'broll');
      refreshLayers();
    } catch (e: any) {
      logger.error('VideoEditor', 'Failed to import URL', e);
      alert(`Failed to import: ${e.message}`);
    }

    setIsLoading(false);
  };

  // --- Stock Gallery handler ---
  const handleStockVideoSelect = async (video: { url: string; name: string }) => {
    setShowStockGallery(false);
    setIsLoading(true);
    setLoadingMessage(`Adding ${video.name}...`);

    let targetLayerIndex = layers.findIndex(l => l.clips.length === 0);
    if (targetLayerIndex < 0) {
      targetLayerIndex = await videoEditorService.addLayer('SEQUENTIAL');
    }

    try {
      await videoEditorService.addClip(targetLayerIndex, video.url, undefined, 'stock');
      refreshLayers();
    } catch (e: any) {
      logger.error('VideoEditor', 'Failed to add stock video', e);
      alert(`Failed to add stock video: ${e.message}`);
    }

    setIsLoading(false);
  };

  // --- Drag reorder handlers ---
  const handleDragStart = (clipId: string) => setDragClipId(clipId);
  const handleDragOver = (clipId: string) => {
    if (dragClipId && dragClipId !== clipId) {
      setDragOverClipId(clipId);
    }
  };
  const handleDragEnd = () => {
    if (dragClipId && dragOverClipId) {
      // Find both clips and reorder
      for (const layer of layers) {
        const fromIdx = layer.clips.findIndex(c => c.id === dragClipId);
        const toIdx = layer.clips.findIndex(c => c.id === dragOverClipId);
        if (fromIdx >= 0 && toIdx >= 0) {
          videoEditorService.reorderClip(layer.index, fromIdx, toIdx);
          refreshLayers();
          break;
        }
      }
    }
    setDragClipId(null);
    setDragOverClipId(null);
  };

  // --- Export handler ---
  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      const blob = await videoEditorService.exportVideo((progress: EncoderProgress) => {
        setExportProgress(Math.round((progress.progress / progress.total) * 100));
      });

      if (!blob) {
        setIsExporting(false);
        return;
      }

      // Upload to Supabase media bucket
      setExportProgress(100);
      setLoadingMessage('Uploading to cloud...');

      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      });
      const base64 = await base64Promise;

      let finalUrl: string;
      try {
        finalUrl = await uploadBase64ToR2(base64, 'video/mp4');
      } catch (uploadError) {
        // Fallback to local blob URL
        logger.warn('VideoEditor', 'R2 upload failed, using local URL', uploadError);
        finalUrl = URL.createObjectURL(blob);
      }

      const exportedVideo: GeneratedVideo = {
        id: `video-${Date.now()}-editor`,
        sceneId: 'editor-export',
        url: finalUrl,
        duration: duration,
        prompt: 'Video Editor Export',
        createdAt: Date.now(),
        status: 'success',
      };

      onExportComplete?.(exportedVideo);
      logger.info('VideoEditor', 'Export complete', { url: finalUrl });

    } catch (error: any) {
      logger.error('VideoEditor', 'Export failed', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (transitionPicker) {
          setTransitionPicker(null);
        } else {
          onClose();
        }
      }
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        isPlaying ? handlePause() : handlePlay();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, transitionPicker, isPlaying]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="h-14 flex items-center justify-between px-6 bg-gray-900/90 backdrop-blur-2xl border-b border-dash-500/20">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-dash-400 animate-pulse" />
          <h1 className="text-base font-semibold text-white">
            Video Editor
          </h1>
          <span className="text-xs text-gray-500 font-mono">
            {layers.reduce((n, l) => n + l.clips.length, 0)} clips · {layers.length} tracks
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={isExporting || layers.every(l => l.clips.length === 0)}
            className="px-4 py-2 rounded-xl bg-dash-600/25 hover:bg-dash-600/40 text-dash-300 text-sm font-medium transition-all duration-200 border border-dash-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExporting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-dash-300 border-t-transparent rounded-full animate-spin" />
                Exporting {exportProgress}%
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export MP4
              </>
            )}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white flex items-center justify-center transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex-1 flex items-center justify-center bg-black/80 relative overflow-hidden min-h-0">
        {isLoading && (
          <div className="absolute inset-0 bg-gray-950/80 flex flex-col items-center justify-center z-10">
            <div className="w-8 h-8 border-2 border-dash-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-400">{loadingMessage}</p>
          </div>
        )}

        {initError ? (
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <p className="text-red-400 font-medium mb-1">Editor Initialization Failed</p>
              <p className="text-xs text-gray-500">{initError}</p>
              <p className="text-xs text-gray-600 mt-2">
                This editor requires WebCodecs API support. Make sure COOP/COEP headers are configured.
              </p>
            </div>
          </div>
        ) : (
          <div
            ref={canvasContainerRef}
            className="w-full h-full flex items-center justify-center"
            style={{ maxHeight: '60vh' }}
          />
        )}

        {/* Export progress overlay */}
        {isExporting && (
          <div className="absolute inset-0 bg-gray-950/80 flex flex-col items-center justify-center z-10">
            <div className="w-64 space-y-3">
              <div className="text-center">
                <p className="text-sm text-gray-300 font-medium mb-1">Exporting Video</p>
                <p className="text-xs text-gray-500">{exportProgress}% complete</p>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-dash-400 transition-all duration-200 rounded-full"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
              <button
                onClick={() => videoEditorService.cancelExport()}
                className="w-full py-1.5 rounded-lg bg-red-900/30 text-red-400 text-xs hover:bg-red-900/50 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <EditorToolbar
        playing={isPlaying}
        currentTime={currentTime}
        duration={duration}
        timeDisplay={timeDisplay}
        zoom={zoom}
        onPlay={handlePlay}
        onPause={handlePause}
        onSeek={handleSeek}
        onZoomIn={() => setZoom(z => Math.min(z + 0.5, 5))}
        onZoomOut={() => setZoom(z => Math.max(z - 0.5, 0.25))}
        onAddTrack={handleAddTrack}
        onImportBroll={handleImportBroll}
        onImportUrl={handleImportUrl}
        onOpenStockGallery={() => setShowStockGallery(true)}
      />

      {/* Stock Gallery Modal */}
      {showStockGallery && (
        <StockGallery
          onSelectVideo={handleStockVideoSelect}
          onClose={() => setShowStockGallery(false)}
        />
      )}

      {/* Timeline area */}
      <div className="h-[30vh] min-h-[150px] bg-gray-900/60 border-t border-gray-800/50 overflow-y-auto">
        <div className="overflow-x-auto min-w-full">
          {/* Time ruler */}
          <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur px-3 py-1 border-b border-gray-800/30">
            <div className="flex items-center h-5 relative" style={{ minWidth: `${Math.max(duration * pixelsPerSecond + 100, 500)}px` }}>
              {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
                <div
                  key={i}
                  className="absolute text-[9px] text-gray-600 font-mono"
                  style={{ left: `${i * pixelsPerSecond + 100}px` }}
                >
                  <div className="w-px h-2 bg-gray-700 mx-auto mb-0.5" />
                  {Math.floor(i / 60)}:{(i % 60).toString().padStart(2, '0')}
                </div>
              ))}

              {/* Playhead indicator */}
              <div
                className="absolute top-0 bottom-0 w-px bg-dash-400 z-20"
                style={{ left: `${currentTime * pixelsPerSecond + 100}px` }}
              >
                <div className="w-2 h-2 bg-dash-400 rounded-full -ml-[3px] -mt-1" />
              </div>
            </div>
          </div>

          {/* Tracks */}
          <div style={{ minWidth: `${Math.max(duration * pixelsPerSecond + 100, 500)}px` }}>
            {layers.map((layer) => (
              <TimelineTrack
                key={layer.index}
                layer={layer}
                pixelsPerSecond={pixelsPerSecond}
                selectedClipId={selectedClipId}
                onSelectClip={setSelectedClipId}
                onTrimStart={handleTrimStart}
                onTrimEnd={handleTrimEnd}
                onTransitionClick={handleTransitionClick}
                onRemoveClip={handleRemoveClip}
                onRemoveTrack={handleRemoveTrack}
                dragOverClipId={dragOverClipId}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              />
            ))}

            {layers.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-gray-600">
                <p className="text-sm">No tracks yet</p>
                <p className="text-xs text-gray-700 mt-1">
                  Add videos to start editing
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transition picker popup */}
      {transitionPicker && (
        <TransitionPicker
          position={transitionPicker.position}
          currentType={transitionPicker.currentType}
          onSelect={handleSetTransition}
          onRemove={handleRemoveTransition}
          onClose={() => setTransitionPicker(null)}
        />
      )}
    </div>
  );
};

export default VideoEditorModal;
