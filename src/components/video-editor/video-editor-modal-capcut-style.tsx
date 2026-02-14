import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { GeneratedVideo } from '../../types';
import videoEditorService from '../../services/video-editor-service';
import type {
  EditorLayerInfo,
  TransitionType,
  EncoderProgress,
} from '../../services/video-editor-service';
import { uploadBase64ToR2 } from '../../services/supabase-storage-service';
import TimelineTrackCapCutStyle from './timeline-track-capcut-style';
import TransitionPicker from './transition-picker';
import StockGallery from '../stock-gallery/stock-gallery';
import { logger } from '../../services/logger';
// Layout uses plain CSS flexbox (react-resizable-panels was not sizing correctly)

interface VideoEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  videos: GeneratedVideo[];
  onExportComplete?: (video: GeneratedVideo) => void;
}

// CapCut-style timecode formatter (HH:MM:SS:FF)
function formatTimecode(seconds: number, fps: number = 30): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * fps);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

// Parse timecode to seconds
function parseTimecode(tc: string, fps: number = 30): number {
  const parts = tc.split(':').map(Number);
  if (parts.length === 4) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / fps;
  }
  return 0;
}

// Suppress known console errors
function suppressCoreErrors() {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args) => {
    const msg = args[0]?.toString() || '';
    if (msg.includes('HEAD') || msg.includes('blob:')) return;
    originalError.apply(console, args);
  };

  console.warn = (...args) => {
    const msg = args[0]?.toString() || '';
    if (msg.includes('HEAD') || msg.includes('blob:')) return;
    originalWarn.apply(console, args);
  };

  return () => {
    console.error = originalError;
    console.warn = originalWarn;
  };
}

const VideoEditorModalCapCutStyle: React.FC<VideoEditorModalProps> = ({
  isOpen,
  onClose,
  videos,
  onExportComplete,
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const projDimsRef = useRef<{ w: number; h: number }>({ w: 1920, h: 1080 });

  // Editor state
  const [layers, setLayers] = useState<EditorLayerInfo[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [timeDisplay, setTimeDisplay] = useState('00:00:00:00 / 00:00:00:00');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);

  // Utility state
  const [rippleMode, setRippleMode] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [showWaveforms, setShowWaveforms] = useState(true);
  const [fitMode, setFitMode] = useState<'fit' | '100'>('fit');

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

  // Media panel state
  const [mediaTab, setMediaTab] = useState<'generated' | 'imported' | 'stock' | 'audio' | 'text'>('generated');

  // Clip properties state
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(100);
  const [opacity, setOpacity] = useState(100);
  const [rotation, setRotation] = useState(0);

  // Filter state
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  const pixelsPerSecond = 80 * zoom;

  // Timeline scrubbing state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const timelineContentRef = useRef<HTMLDivElement>(null);

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
        // Detect first video's aspect ratio to set project dimensions
        let projW = 1920, projH = 1080;
        const firstVideo = videos.find(v => v.status === 'success' && v.url);
        if (firstVideo?.url) {
          try {
            const dims = await new Promise<{ w: number; h: number }>((resolve) => {
              const probe = document.createElement('video');
              probe.muted = true;
              probe.preload = 'metadata';
              probe.onloadedmetadata = () => {
                resolve({ w: probe.videoWidth, h: probe.videoHeight });
                probe.src = '';
              };
              probe.onerror = () => resolve({ w: 1920, h: 1080 });
              setTimeout(() => resolve({ w: 1920, h: 1080 }), 3000);
              probe.src = firstVideo.url!;
            });
            if (dims.w && dims.h) {
              projW = dims.w;
              projH = dims.h;
            }
          } catch {
            // Fallback to 1920x1080
          }
        }

        await videoEditorService.createProject(projW, projH);
        projDimsRef.current = { w: projW, h: projH };

        // Mount to player element (Diffusion Studio renders canvas inside it)
        if (playerRef.current && canvasContainerRef.current) {
          videoEditorService.mount(playerRef.current);

          // Set player to exact composition dimensions
          playerRef.current.style.width = `${projW}px`;
          playerRef.current.style.height = `${projH}px`;

          // Scale player to fit container using CSS transform
          const fitPlayerToContainer = () => {
            const container = canvasContainerRef.current;
            const player = playerRef.current;
            if (!container || !player) return;

            const padding = 16; // px padding inside container
            const availW = container.clientWidth - padding * 2;
            const availH = container.clientHeight - padding * 2;
            const scale = Math.min(availW / projDimsRef.current.w, availH / projDimsRef.current.h, 1);

            player.style.transform = `scale(${scale})`;
            player.style.transformOrigin = 'center center';
          };

          resizeObserverRef.current = new ResizeObserver(fitPlayerToContainer);
          resizeObserverRef.current.observe(canvasContainerRef.current);
          fitPlayerToContainer();
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
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      videoEditorService.destroy();
      restoreConsole();
    };
  }, [isOpen]);

  // Re-fit player when fitMode changes
  useEffect(() => {
    const container = canvasContainerRef.current;
    const player = playerRef.current;
    if (!container || !player) return;

    const { w, h } = projDimsRef.current;
    if (!w || !h) return;

    if (fitMode === '100') {
      player.style.transform = 'scale(1)';
    } else {
      const padding = 16;
      const availW = container.clientWidth - padding * 2;
      const availH = container.clientHeight - padding * 2;
      const scale = Math.min(availW / w, availH / h, 1);
      player.style.transform = `scale(${scale})`;
    }
  }, [fitMode]);

  // Playback time updater
  useEffect(() => {
    if (!isOpen) return;

    const updateTime = () => {
      const comp = videoEditorService.getComposition();
      if (comp) {
        const ct = comp.currentTime;  // seconds
        const dur = videoEditorService.duration;  // seconds (converted from frames)
        setCurrentTime(ct);
        setDuration(dur);
        const currentTC = formatTimecode(ct);
        const durationTC = formatTimecode(dur);
        setTimeDisplay(`${currentTC} / ${durationTC}`);
        setIsPlaying(comp.playing);
      }
      animFrameRef.current = requestAnimationFrame(updateTime);
    };

    animFrameRef.current = requestAnimationFrame(updateTime);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isOpen]);

  // Frame-by-frame navigation
  const handleFrameBack = useCallback(() => {
    const newTime = Math.max(0, currentTime - 1 / 30);
    videoEditorService.seek(newTime);
    setCurrentTime(newTime);
  }, [currentTime]);

  const handleFrameForward = useCallback(() => {
    const newTime = Math.min(duration, currentTime + 1 / 30);
    videoEditorService.seek(newTime);
    setCurrentTime(newTime);
  }, [currentTime, duration]);

  // Split at playhead
  const handleSplitAtPlayhead = useCallback(() => {
    if (!selectedClipId) return;
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === selectedClipId);
      if (clipIdx >= 0) {
        videoEditorService.splitClip(layer.index, clipIdx, currentTime);
        refreshLayers();
        break;
      }
    }
  }, [layers, selectedClipId, currentTime]);

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

  // Timeline scrub: convert mouse X to time and seek
  // Allows scrubbing beyond current duration to extend the composition
  const scrubFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const contentEl = timelineContentRef.current;
    if (!contentEl) return;
    const rect = contentEl.getBoundingClientRect();
    const x = e.clientX - rect.left + contentEl.scrollLeft;
    const time = Math.max(0, x / pixelsPerSecond);
    // If scrubbing beyond current duration, extend the composition
    if (time > duration && time > 0) {
      videoEditorService.setDuration(time);
      setDuration(time);
    }
    videoEditorService.seek(time);
    setCurrentTime(time);
  }, [pixelsPerSecond, duration]);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    scrubFromEvent(e);
    setIsScrubbing(true);
  }, [scrubFromEvent]);

  useEffect(() => {
    if (!isScrubbing) return;
    const onMove = (e: MouseEvent) => scrubFromEvent(e);
    const onUp = () => setIsScrubbing(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isScrubbing, scrubFromEvent]);

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

  // --- Audio import handler ---
  const handleImportAudio = async (files: FileList) => {
    setIsLoading(true);
    setLoadingMessage('Importing audio...');

    // Audio goes on its own track
    const targetLayerIndex = await videoEditorService.addLayer('DEFAULT');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setLoadingMessage(`Importing ${file.name}...`);
      try {
        await videoEditorService.addAudioFromFile(targetLayerIndex, file);
      } catch (e) {
        logger.warn('VideoEditor', `Failed to import audio ${file.name}`, e);
      }
    }

    refreshLayers();
    setIsLoading(false);
  };

  // --- Text clip handler ---
  const handleAddText = async (text: string) => {
    const targetLayerIndex = await videoEditorService.addLayer('DEFAULT');
    try {
      const clipId = await videoEditorService.addTextClip(targetLayerIndex, text, {
        fontSize: 48,
        color: '#ffffff',
      });
      refreshLayers();
      setSelectedClipId(clipId);
    } catch (e: any) {
      logger.error('VideoEditor', 'Failed to add text clip', e);
    }
  };

  // --- Image overlay handler ---
  const handleImportImage = async (files: FileList) => {
    setIsLoading(true);
    setLoadingMessage('Importing image...');

    const targetLayerIndex = await videoEditorService.addLayer('DEFAULT');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      try {
        await videoEditorService.addImageClip(targetLayerIndex, url);
      } catch (e) {
        logger.warn('VideoEditor', `Failed to import image ${file.name}`, e);
      }
    }

    refreshLayers();
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

  // --- Clip properties handlers ---
  const handleSpeedChange = useCallback((value: number) => {
    setSpeed(value);
    if (!selectedClipId) return;
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === selectedClipId);
      if (clipIdx >= 0) {
        videoEditorService.setSpeed(layer.index, clipIdx, value);
        break;
      }
    }
  }, [selectedClipId, layers]);

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    if (!selectedClipId) return;
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === selectedClipId);
      if (clipIdx >= 0) {
        videoEditorService.setVolume(layer.index, clipIdx, value / 100);
        break;
      }
    }
  }, [selectedClipId, layers]);

  const handleOpacityChange = useCallback((value: number) => {
    setOpacity(value);
    if (!selectedClipId) return;
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === selectedClipId);
      if (clipIdx >= 0) {
        videoEditorService.setOpacity(layer.index, clipIdx, value / 100);
        break;
      }
    }
  }, [selectedClipId, layers]);

  const handleRotationChange = useCallback((value: number) => {
    setRotation(value);
    if (!selectedClipId) return;
    for (const layer of layers) {
      const clipIdx = layer.clips.findIndex(c => c.id === selectedClipId);
      if (clipIdx >= 0) {
        videoEditorService.setRotation(layer.index, clipIdx, value);
        break;
      }
    }
  }, [selectedClipId, layers]);

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
      // S key = split
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && selectedClipId) {
        handleSplitAtPlayhead();
      }
      // Delete key = remove clip
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        handleRemoveClip(selectedClipId);
      }
      // Left/Right arrow = frame navigation
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleFrameBack();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleFrameForward();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, transitionPicker, isPlaying, selectedClipId, handleSplitAtPlayhead, handleRemoveClip, handleFrameBack, handleFrameForward]);

  // --- Zoom to fit ---
  const handleZoomToFit = useCallback(() => {
    if (duration <= 0) return;
    const contentEl = timelineContentRef.current;
    if (!contentEl) return;
    // Target: fit all content in visible width with some padding
    const availableWidth = contentEl.parentElement?.clientWidth ?? 700;
    const targetPPS = (availableWidth - 200) / Math.max(duration, 1); // 200px margin
    const newZoom = Math.max(0.25, Math.min(5, targetPPS / 80));
    setZoom(newZoom);
  }, [duration]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[#0F172A]">
      {/* Top bar - CapCut style */}
      <div className="h-14 flex items-center justify-between px-6 bg-[#1E293B]/95 backdrop-blur-xl border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-lg shadow-cyan-400/50" />
          <h1 className="text-base font-semibold text-white">
            Video Editor
          </h1>
          <span className="text-xs text-slate-400 font-mono">
            {layers.reduce((n, l) => n + l.clips.length, 0)} clips · {layers.length} tracks
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={isExporting || layers.every(l => l.clips.length === 0)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-medium transition-all duration-200 border border-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Exporting {exportProgress}%
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </>
            )}
          </button>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white flex items-center justify-center transition-all duration-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 3-Column Layout: Media | Preview | Properties */}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        {/* LEFT: Media Panel */}
        <div className="w-[220px] flex-shrink-0">
          <div className="h-full flex flex-col bg-[#111827] border-r border-slate-700/50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-700/30 bg-[#1E293B]/80">
              <h2 className="text-xs font-semibold text-lime-400 uppercase tracking-wider">Media</h2>
            </div>
            {/* Media tabs */}
            <div className="flex border-b border-slate-700/30">
              {(['generated', 'imported', 'audio', 'text', 'stock'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setMediaTab(tab)}
                  className={`flex-1 px-2 py-2 text-[10px] font-medium uppercase tracking-wide transition-all ${mediaTab === tab
                    ? 'text-lime-400 border-b-2 border-lime-400 bg-lime-500/5'
                    : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {mediaTab === 'generated' && layers.flatMap(l => l.clips.filter(c => c.type === 'generated')).map(clip => (
                <div
                  key={clip.id}
                  draggable
                  onClick={() => setSelectedClipId(clip.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${selectedClipId === clip.id
                    ? 'bg-lime-500/10 border border-lime-500/30'
                    : 'bg-slate-800/40 border border-transparent hover:bg-slate-800/60 hover:border-slate-700/50'
                    }`}
                >
                  <div className="w-12 h-8 bg-slate-900 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-300 truncate">{clip.name}</div>
                    <div className="text-[9px] text-slate-500 font-mono">{clip.durationSec.toFixed(1)}s</div>
                  </div>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-lime-500/15 text-lime-400 font-medium">GEN</span>
                </div>
              ))}
              {mediaTab === 'generated' && layers.flatMap(l => l.clips.filter(c => c.type === 'broll')).map(clip => (
                <div
                  key={clip.id}
                  draggable
                  onClick={() => setSelectedClipId(clip.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${selectedClipId === clip.id
                    ? 'bg-blue-500/10 border border-blue-500/30'
                    : 'bg-slate-800/40 border border-transparent hover:bg-slate-800/60 hover:border-slate-700/50'
                    }`}
                >
                  <div className="w-12 h-8 bg-slate-900 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-slate-300 truncate">{clip.name}</div>
                    <div className="text-[9px] text-slate-500 font-mono">{clip.durationSec.toFixed(1)}s</div>
                  </div>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">B-ROLL</span>
                </div>
              ))}
              {mediaTab === 'generated' && layers.every(l => l.clips.length === 0) && (
                <div className="text-center py-8 text-slate-600 text-xs">No clips yet</div>
              )}
              {mediaTab === 'imported' && (
                <div className="space-y-3">
                  <button
                    onClick={() => document.getElementById('media-panel-import')?.click()}
                    className="w-full py-8 rounded-xl border-2 border-dashed border-slate-700/50 hover:border-lime-500/40 text-slate-500 hover:text-lime-400 transition-all flex flex-col items-center gap-2"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    <span className="text-xs font-medium">Import Video</span>
                  </button>
                  <input
                    id="media-panel-import"
                    type="file"
                    accept="video/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleImportBroll(e.target.files)}
                  />
                </div>
              )}
              {mediaTab === 'stock' && (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowStockGallery(true)}
                    className="w-full py-8 rounded-xl border-2 border-dashed border-slate-700/50 hover:border-purple-500/40 text-slate-500 hover:text-purple-400 transition-all flex flex-col items-center gap-2"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="text-xs font-medium">Browse Stock</span>
                  </button>
                </div>
              )}
              {mediaTab === 'audio' && (
                <div className="space-y-3">
                  <button
                    onClick={() => document.getElementById('audio-import')?.click()}
                    className="w-full py-8 rounded-xl border-2 border-dashed border-slate-700/50 hover:border-orange-500/40 text-slate-500 hover:text-orange-400 transition-all flex flex-col items-center gap-2"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                    <span className="text-xs font-medium">Import Audio</span>
                    <span className="text-[9px] text-slate-600">MP3, WAV, OGG</span>
                  </button>
                  <input
                    id="audio-import"
                    type="file"
                    accept="audio/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleImportAudio(e.target.files)}
                  />
                  {/* List audio clips */}
                  {layers.flatMap(l => l.clips.filter(c => c.type === 'audio')).map(clip => (
                    <div
                      key={clip.id}
                      onClick={() => setSelectedClipId(clip.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${selectedClipId === clip.id
                        ? 'bg-orange-500/10 border border-orange-500/30'
                        : 'bg-slate-800/40 border border-transparent hover:bg-slate-800/60'
                        }`}
                    >
                      <div className="w-8 h-8 bg-orange-900/30 rounded flex items-center justify-center">
                        <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-slate-300 truncate">{clip.name}</div>
                        <div className="text-[9px] text-slate-500 font-mono">{clip.durationSec.toFixed(1)}s</div>
                      </div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">AUDIO</span>
                    </div>
                  ))}
                </div>
              )}
              {mediaTab === 'text' && (
                <div className="space-y-3">
                  <button
                    onClick={() => handleAddText('Your text here')}
                    className="w-full py-6 rounded-xl border-2 border-dashed border-slate-700/50 hover:border-pink-500/40 text-slate-500 hover:text-pink-400 transition-all flex flex-col items-center gap-2"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span className="text-xs font-medium">Add Text</span>
                  </button>
                  <button
                    onClick={() => document.getElementById('image-import')?.click()}
                    className="w-full py-6 rounded-xl border-2 border-dashed border-slate-700/50 hover:border-emerald-500/40 text-slate-500 hover:text-emerald-400 transition-all flex flex-col items-center gap-2"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-xs font-medium">Add Image Overlay</span>
                    <span className="text-[9px] text-slate-600">PNG, JPG</span>
                  </button>
                  <input
                    id="image-import"
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleImportImage(e.target.files)}
                  />
                  {/* List text and image clips */}
                  {layers.flatMap(l => l.clips.filter(c => c.type === 'text' || c.type === 'image')).map(clip => (
                    <div
                      key={clip.id}
                      onClick={() => setSelectedClipId(clip.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-all ${selectedClipId === clip.id
                        ? 'bg-pink-500/10 border border-pink-500/30'
                        : 'bg-slate-800/40 border border-transparent hover:bg-slate-800/60'
                        }`}
                    >
                      <div className={`w-8 h-8 rounded flex items-center justify-center ${clip.type === 'text' ? 'bg-pink-900/30' : 'bg-emerald-900/30'}`}>
                        <span className={`text-sm font-bold ${clip.type === 'text' ? 'text-pink-400' : 'text-emerald-400'}`}>
                          {clip.type === 'text' ? 'T' : 'I'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-slate-300 truncate">{clip.name}</div>
                        <div className="text-[9px] text-slate-500 font-mono">{clip.durationSec.toFixed(1)}s</div>
                      </div>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${clip.type === 'text' ? 'bg-pink-500/15 text-pink-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                        {clip.type === 'text' ? 'TEXT' : 'IMG'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CENTER: Preview */}
        <div className="flex-1 min-w-0">
          <div className="h-full flex flex-col bg-black/95 relative overflow-hidden">
            {/* Top toolbar with utility buttons - CapCut style */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-[#1E293B]/80 border-b border-slate-700/30">
              <div className="flex items-center gap-2">
                {/* Zoom controls */}
                <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1 border border-slate-700/50">
                  <button
                    onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))}
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all duration-150"
                    title="Zoom Out"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                    </svg>
                  </button>
                  <span className="px-2 text-xs text-slate-400 font-mono min-w-[48px] text-center">
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    onClick={() => setZoom(z => Math.min(z + 0.25, 5))}
                    className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all duration-150"
                    title="Zoom In"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </button>
                </div>

                {/* Fit / 100% toggle */}
                <button
                  onClick={() => setFitMode(m => m === 'fit' ? '100' : 'fit')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${fitMode === '100'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
                    }`}
                  title="Toggle Fit/Fill"
                >
                  {fitMode === 'fit' ? 'Fit' : '100%'}
                </button>

                {/* Zoom to fit timeline */}
                <button
                  onClick={handleZoomToFit}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent transition-all duration-150"
                  title="Zoom to fit all clips"
                >
                  Fit All
                </button>
              </div>

              {/* Utility toggles - CapCut style */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setRippleMode(!rippleMode)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1.5 ${rippleMode
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
                    }`}
                  title="Ripple Edit: Shifts clips after edit point"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                  Ripple
                </button>

                <button
                  onClick={() => setSnapToGrid(!snapToGrid)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1.5 ${snapToGrid
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
                    }`}
                  title="Snap to Grid"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                  </svg>
                  Snap
                </button>

                <button
                  onClick={() => setShowWaveforms(!showWaveforms)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-1.5 ${showWaveforms
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50 border border-transparent'
                    }`}
                  title="Show Waveforms"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  Waveform
                </button>
              </div>

              {/* Clip actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSplitAtPlayhead}
                  disabled={!selectedClipId}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/60 text-slate-300 hover:text-white hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all duration-150 border border-slate-700/50"
                  title="Split at Playhead (S)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Split
                </button>

                <button
                  onClick={() => {
                    if (selectedClipId) {
                      handleRemoveClip(selectedClipId);
                    }
                  }}
                  disabled={!selectedClipId}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/20 text-red-400 hover:text-red-300 hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all duration-150 border border-red-900/30"
                  title="Delete Clip (Delete)"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>

            {/* Preview canvas */}
            <div className="flex-1 flex items-center justify-center relative overflow-hidden">
              {isLoading && (
                <div className="absolute inset-0 bg-[#0F172A]/90 flex flex-col items-center justify-center z-20">
                  <div className="w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4 shadow-lg shadow-cyan-400/20" />
                  <p className="text-sm text-slate-300 font-medium">{loadingMessage}</p>
                </div>
              )}

              {initError ? (
                <div className="flex flex-col items-center gap-4 text-center max-w-md p-6">
                  <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center">
                    <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-red-400 font-medium mb-1">Editor Initialization Failed</p>
                    <p className="text-xs text-slate-500">{initError}</p>
                    <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                      This editor requires WebCodecs API support.<br />
                      Ensure COOP/COEP headers are configured.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  ref={canvasContainerRef}
                  className="flex items-center justify-center w-full h-full overflow-hidden"
                >
                  <div ref={playerRef} />
                </div>
              )}

              {/* Timecode overlay removed - already shown in playback controls bar */}

              {/* Export progress overlay */}
              {isExporting && (
                <div className="absolute inset-0 bg-[#0F172A]/90 flex flex-col items-center justify-center z-30">
                  <div className="w-80 space-y-4">
                    <div className="text-center">
                      <p className="text-sm text-slate-200 font-medium mb-1">Exporting Video</p>
                      <p className="text-xs text-slate-500">{exportProgress}% complete</p>
                    </div>
                    <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 rounded-full shadow-lg shadow-cyan-500/30"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                    <button
                      onClick={() => videoEditorService.cancelExport()}
                      className="w-full py-2 rounded-lg bg-red-900/30 text-red-400 text-xs font-medium hover:bg-red-900/50 transition-all duration-150 border border-red-900/30"
                    >
                      Cancel Export
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Playback controls bar - CapCut style */}
            <div className="flex items-center justify-center gap-4 px-4 py-3 bg-[#1E293B]/80 border-t border-slate-700/30">
              {/* Frame back */}
              <button
                onClick={handleFrameBack}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150"
                title="Previous Frame (Left Arrow)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Step back 1s */}
              <button
                onClick={() => videoEditorService.seek(Math.max(0, currentTime - 1))}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150"
                title="Back 1s"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                </svg>
              </button>

              {/* Play/Pause - CapCut style */}
              <button
                onClick={isPlaying ? handlePause : handlePlay}
                className="p-3.5 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-500 hover:to-blue-500 transition-all duration-150 shadow-lg shadow-cyan-500/20"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Step forward 1s */}
              <button
                onClick={() => videoEditorService.seek(Math.min(duration, currentTime + 1))}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150"
                title="Forward 1s"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                </svg>
              </button>

              {/* Frame forward */}
              <button
                onClick={handleFrameForward}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150"
                title="Next Frame (Right Arrow)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 5l7 7-7 7" />
                </svg>
              </button>

              {/* Timecode display - CapCut style */}
              <div className="flex items-center gap-2 ml-4 px-4 py-2 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <span className="text-sm font-mono text-cyan-400">{formatTimecode(currentTime)}</span>
                <span className="text-xs text-slate-600">/</span>
                <span className="text-sm font-mono text-slate-400">{formatTimecode(duration)}</span>
              </div>

              {/* Volume (placeholder) */}
              <button
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150"
                title="Mute/Unmute"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: Properties Panel */}
        <div className="w-[260px] flex-shrink-0">
          <div className="h-full flex flex-col bg-[#111827] border-l border-slate-700/50 overflow-hidden">
            <div className="px-3 py-2.5 border-b border-slate-700/30 bg-[#1E293B]/80">
              <h2 className="text-xs font-semibold text-lime-400 uppercase tracking-wider">Properties</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {selectedClipId ? (
                <div className="space-y-4">
                  {/* Selected clip info */}
                  <div className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30">
                    <div className="text-[11px] text-lime-400 font-medium truncate">
                      {layers.flatMap(l => l.clips).find(c => c.id === selectedClipId)?.name || 'Unknown Clip'}
                    </div>
                    <div className="text-[9px] text-slate-500 font-mono mt-0.5">
                      {layers.flatMap(l => l.clips).find(c => c.id === selectedClipId)?.durationSec.toFixed(2)}s
                    </div>
                  </div>

                  {/* Speed */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Speed</label>
                      <span className="text-[11px] text-lime-400 font-mono">{speed}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.25"
                      max="4"
                      step="0.25"
                      value={speed}
                      onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-lime-500 cursor-pointer"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-slate-600">0.25x</span>
                      <span className="text-[8px] text-slate-600">4x</span>
                    </div>
                  </div>

                  {/* Volume */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Volume</label>
                      <span className="text-[11px] text-lime-400 font-mono">{volume}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="200"
                      step="1"
                      value={volume}
                      onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-lime-500 cursor-pointer"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-slate-600">0%</span>
                      <span className="text-[8px] text-slate-600">200%</span>
                    </div>
                  </div>

                  {/* Opacity */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Opacity</label>
                      <span className="text-[11px] text-lime-400 font-mono">{opacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={opacity}
                      onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-lime-500 cursor-pointer"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-slate-600">0%</span>
                      <span className="text-[8px] text-slate-600">100%</span>
                    </div>
                  </div>

                  {/* Rotation */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">Rotation</label>
                      <span className="text-[11px] text-lime-400 font-mono">{rotation}°</span>
                    </div>
                    <input
                      type="range"
                      min="-360"
                      max="360"
                      step="1"
                      value={rotation}
                      onChange={(e) => handleRotationChange(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-slate-700 accent-lime-500 cursor-pointer"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-slate-600">-360°</span>
                      <span className="text-[8px] text-slate-600">360°</span>
                    </div>
                  </div>

                  {/* Text editing (only for text clips) */}
                  {(() => {
                    const selectedClip = layers.flatMap(l => l.clips).find(c => c.id === selectedClipId);
                    if (selectedClip?.type !== 'text') return null;
                    return (
                      <div className="space-y-3 pt-3 border-t border-slate-700/30">
                        <label className="text-[10px] text-pink-400 uppercase tracking-wide font-medium">Text Content</label>
                        <textarea
                          defaultValue={selectedClip.name}
                          onBlur={(e) => {
                            if (selectedClipId) {
                              videoEditorService.setTextContent(selectedClipId, e.target.value);
                              refreshLayers();
                            }
                          }}
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 text-xs text-slate-200 resize-none h-16"
                          placeholder="Enter text..."
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { if (selectedClipId) { videoEditorService.setTextStyle(selectedClipId, { fontSize: 32 }); } }}
                            className="px-2 py-1 rounded bg-slate-800/60 text-[10px] text-slate-400 hover:text-white border border-slate-700/50"
                          >S</button>
                          <button
                            onClick={() => { if (selectedClipId) { videoEditorService.setTextStyle(selectedClipId, { fontSize: 48 }); } }}
                            className="px-2 py-1 rounded bg-slate-800/60 text-xs text-slate-400 hover:text-white border border-slate-700/50"
                          >M</button>
                          <button
                            onClick={() => { if (selectedClipId) { videoEditorService.setTextStyle(selectedClipId, { fontSize: 72 }); } }}
                            className="px-2 py-1 rounded bg-slate-800/60 text-sm text-slate-400 hover:text-white border border-slate-700/50"
                          >L</button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Filters (video/image clips only) */}
                  {(() => {
                    const selectedClip = layers.flatMap(l => l.clips).find(c => c.id === selectedClipId);
                    if (selectedClip?.type === 'audio') return null;
                    return (
                      <div className="space-y-3 pt-3 border-t border-slate-700/30">
                        <label className="text-[10px] text-cyan-400 uppercase tracking-wide font-medium">Filters</label>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400">Brightness</span>
                            <span className="text-[10px] text-slate-500 font-mono">{brightness}%</span>
                          </div>
                          <input type="range" min="0" max="200" step="5" value={brightness}
                            onChange={(e) => { const v = parseFloat(e.target.value); setBrightness(v); if (selectedClipId) videoEditorService.setFilters(selectedClipId, { brightness: v / 100 }); }}
                            className="w-full h-1 rounded-full appearance-none bg-slate-700 accent-cyan-500 cursor-pointer" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400">Contrast</span>
                            <span className="text-[10px] text-slate-500 font-mono">{contrast}%</span>
                          </div>
                          <input type="range" min="0" max="200" step="5" value={contrast}
                            onChange={(e) => { const v = parseFloat(e.target.value); setContrast(v); if (selectedClipId) videoEditorService.setFilters(selectedClipId, { contrast: v / 100 }); }}
                            className="w-full h-1 rounded-full appearance-none bg-slate-700 accent-cyan-500 cursor-pointer" />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-slate-400">Saturation</span>
                            <span className="text-[10px] text-slate-500 font-mono">{saturation}%</span>
                          </div>
                          <input type="range" min="0" max="200" step="5" value={saturation}
                            onChange={(e) => { const v = parseFloat(e.target.value); setSaturation(v); if (selectedClipId) videoEditorService.setFilters(selectedClipId, { saturation: v / 100 }); }}
                            className="w-full h-1 rounded-full appearance-none bg-slate-700 accent-cyan-500 cursor-pointer" />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Masks (video/image clips only) */}
                  {(() => {
                    const selectedClip = layers.flatMap(l => l.clips).find(c => c.id === selectedClipId);
                    if (selectedClip?.type === 'audio' || selectedClip?.type === 'text') return null;
                    return (
                      <div className="space-y-2 pt-3 border-t border-slate-700/30">
                        <label className="text-[10px] text-purple-400 uppercase tracking-wide font-medium">Mask</label>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => selectedClipId && videoEditorService.setMask(selectedClipId, 'none')}
                            className="flex-1 px-2 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/50 transition-all"
                          >None</button>
                          <button
                            onClick={() => selectedClipId && videoEditorService.setMask(selectedClipId, 'rectangle')}
                            className="flex-1 px-2 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/50 transition-all"
                          >Rect</button>
                          <button
                            onClick={() => selectedClipId && videoEditorService.setMask(selectedClipId, 'ellipse')}
                            className="flex-1 px-2 py-1.5 rounded-lg text-[10px] text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/50 transition-all"
                          >Ellipse</button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <svg className="w-10 h-10 text-slate-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  <p className="text-xs text-slate-600">Select a clip to edit properties</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {showStockGallery && (
        <StockGallery
          onSelectVideo={handleStockVideoSelect}
          onClose={() => setShowStockGallery(false)}
        />
      )}

      {/* Timeline area - CapCut style */}
      <div className="flex flex-col h-[35vh] min-h-[200px] bg-[#0F172A] border-t border-slate-700/50">
        {/* Timeline header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#1E293B]/80 border-b border-slate-700/30">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">Timeline</span>
            <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-800/60 rounded-md text-[10px] text-slate-500 font-mono border border-slate-700/50">
              {layers.reduce((acc, l) => acc + l.clips.length, 0)} clips
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Add track button */}
            <button
              onClick={handleAddTrack}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150 border border-slate-700/50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Track
            </button>

            {/* Import buttons */}
            <button
              onClick={() => document.getElementById('broll-input')?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150 border border-slate-700/50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import
            </button>
            <input
              id="broll-input"
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleImportBroll(e.target.files)}
            />

            <button
              onClick={() => setShowStockGallery(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150 border border-slate-700/50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Stock
            </button>

            {/* Audio import button */}
            <button
              onClick={() => document.getElementById('audio-import-timeline')?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-orange-400/70 hover:text-orange-400 hover:bg-orange-900/20 transition-all duration-150 border border-slate-700/50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
              </svg>
              Audio
            </button>
            <input
              id="audio-import-timeline"
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleImportAudio(e.target.files)}
            />
          </div>
        </div>

        {/* Timeline scroll area */}
        <div className="flex-1 overflow-auto bg-[#0F172A]">
          <div className="flex min-w-full">
            {/* Track header column (fixed width) */}
            <div className="flex-shrink-0 w-[100px] sticky left-0 z-10 bg-[#1E293B]">
              {/* Ruler header spacer */}
              <div className="h-7 border-b border-slate-700/20 bg-[#1E293B]/95" />
              {/* Track labels */}
              {layers.map((layer) => (
                <div
                  key={layer.index}
                  className={`flex items-center gap-1 px-3 h-12 border-b border-slate-700/30 ${layer.index % 2 === 0 ? 'bg-[#1E293B]' : 'bg-[#1a2538]'
                    }`}
                >
                  <span className="text-xs text-slate-500 font-medium">
                    Track {layer.index + 1}
                  </span>
                  {layer.clips.length === 0 && (
                    <button
                      onClick={() => handleRemoveTrack(layer.index)}
                      className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition-all duration-150"
                      title="Remove empty track"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Timeline content column (scrollable) */}
            <div ref={timelineContentRef} className="flex-1 min-w-0 relative" style={{ minWidth: `${Math.max(duration * pixelsPerSecond + 200, 700)}px` }}>
              {/* Playhead line spanning full height (ruler + tracks) */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-cyan-400/60 z-30 pointer-events-none"
                style={{ left: `${currentTime * pixelsPerSecond}px` }}
              />
              {/* Time ruler - CapCut style (click/drag to seek) */}
              <div className="sticky top-0 z-20 bg-[#1E293B]/95 backdrop-blur border-b border-slate-700/20">
                <div
                  className="relative h-7 cursor-pointer select-none"
                  onMouseDown={handleTimelineMouseDown}
                >
                  {Array.from({ length: Math.max(Math.ceil(duration) + 1, 10) }, (_, i) => (
                    <div
                      key={i}
                      className="absolute bottom-0 flex flex-col items-center"
                      style={{ left: `${i * pixelsPerSecond}px` }}
                    >
                      <div className="w-px h-2.5 bg-slate-600" />
                      <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                        {Math.floor(i / 60)}:{(i % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  ))}

                  {/* Playhead indicator */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 z-30 shadow-lg shadow-cyan-400/30 pointer-events-none"
                    style={{ left: `${currentTime * pixelsPerSecond}px` }}
                  >
                    <div className="w-3.5 h-3.5 bg-cyan-400 rounded-sm -ml-[6.5px] -mt-0.5 shadow-lg shadow-cyan-400/50 pointer-events-auto cursor-col-resize"
                      onMouseDown={(e) => { e.stopPropagation(); setIsScrubbing(true); }}
                    />
                  </div>
                </div>
              </div>

              {/* Track clip lanes */}
              {layers.map((layer) => (
                <TimelineTrackCapCutStyle
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
                  showWaveforms={showWaveforms}
                />
              ))}

              {layers.length === 0 && (
                <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                  <svg className="w-10 h-10 mb-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">No clips yet</p>
                  <p className="text-xs text-slate-600 mt-1">
                    Import videos or add from stock gallery
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar - CapCut style */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#1E293B]/80 border-t border-slate-700/30">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>⌨️</span>
          <span>Space: Play/Pause</span>
          <span className="mx-1">•</span>
          <span>S: Split</span>
          <span className="mx-1">•</span>
          <span>Del: Delete</span>
          <span className="mx-1">•</span>
          <span>←→: Frame</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all duration-150"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || layers.every(l => l.clips.length === 0)}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center gap-2 shadow-lg shadow-cyan-500/20"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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

export default VideoEditorModalCapCutStyle;
