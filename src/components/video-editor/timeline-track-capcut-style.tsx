import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { EditorLayerInfo } from '../../services/video-editor-service';

interface TimelineTrackCapCutStyleProps {
  layer: EditorLayerInfo;
  pixelsPerSecond: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onTrimStart: (clipId: string, newStartSec: number) => void;
  onTrimEnd: (clipId: string, newEndSec: number) => void;
  onTransitionClick: (clipId: string, position: { x: number; y: number }) => void;
  onRemoveClip: (clipId: string) => void;
  onRemoveTrack: (layerIndex: number) => void;
  dragOverClipId: string | null;
  onDragStart: (clipId: string) => void;
  onDragOver: (clipId: string) => void;
  onDragEnd: () => void;
  showWaveforms: boolean;
  isDropTarget?: boolean;
  currentTime: number;
  onSeek: (time: number) => void;
}

const TimelineTrackCapCutStyle: React.FC<TimelineTrackCapCutStyleProps> = ({
  layer,
  pixelsPerSecond,
  selectedClipId,
  onSelectClip,
  onTrimStart,
  onTrimEnd,
  onTransitionClick,
  onRemoveClip,
  onRemoveTrack,
  dragOverClipId,
  onDragStart,
  onDragOver,
  onDragEnd,
  showWaveforms,
  isDropTarget = false,
  currentTime,
  onSeek,
}) => {
  const safeLayer = layer || { clips: [], index: -1 };
  const [resizing, setResizing] = useState<{
    clipId: string;
    side: 'left' | 'right';
    startX: number;
    originalStart: number;
    originalEnd: number;
  } | null>(null);
  const [hoveredClip, setHoveredClip] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, clipId: string, side: 'left' | 'right') => {
      e.stopPropagation();
      const clip = safeLayer.clips.find(c => c.id === clipId);
      if (!clip) return;

      setResizing({
        clipId,
        side,
        startX: e.clientX,
        originalStart: clip.startSec,
        originalEnd: clip.endSec,
      });
    },
    [safeLayer.clips]
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!resizing) return;

      const deltaX = e.clientX - resizing.startX;
      const deltaSec = deltaX / pixelsPerSecond;

      if (resizing.side === 'left') {
        const newStart = Math.max(0, resizing.originalStart + deltaSec);
        onTrimStart(resizing.clipId, newStart);
      } else {
        const newEnd = Math.max(resizing.originalStart + 0.1, resizing.originalEnd + deltaSec);
        onTrimEnd(resizing.clipId, newEnd);
      }
    },
    [resizing, pixelsPerSecond, onTrimStart, onTrimEnd]
  );

  const handleResizeEnd = useCallback(() => {
    setResizing(null);
  }, []);

  useEffect(() => {
    if (!resizing) return;

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizing, handleResizeMove, handleResizeEnd]);

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (e.target === trackRef.current || (e.target as HTMLElement).classList.contains('track-bg')) {
      const rect = trackRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left;
        const time = x / pixelsPerSecond;
        onSeek(Math.max(0, time));
      }
    }
  }, [pixelsPerSecond, onSeek]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'generated': return 'from-purple-600/80 to-blue-600/80';
      case 'broll': return 'from-emerald-600/80 to-teal-600/80';
      case 'stock': return 'from-amber-600/80 to-orange-600/80';
      default: return 'from-slate-600/80 to-slate-700/80';
    }
  };

  return (
    <div ref={trackRef} className="relative h-12 border-b border-slate-800/30 track-bg cursor-crosshair" onClick={handleTrackClick}>
      {safeLayer.clips.map((clip) => {
        const isSelected = selectedClipId === clip.id;
        const isDragOver = dragOverClipId === clip.id;
        const clipWidth = (clip.endSec - clip.startSec) * pixelsPerSecond;
        const clipLeft = clip.startSec * pixelsPerSecond;
        const isHovered = hoveredClip === clip.id;

        return (
          <div key={clip.id} className={`absolute top-1 bottom-1 group ${isDragOver ? 'ring-2 ring-lime-500' : ''}`}
            style={{ left: `${clipLeft}px`, width: `${clipWidth}px`, cursor: resizing ? 'grabbing' : 'grab' }}
            onMouseEnter={() => setHoveredClip(clip.id)} onMouseLeave={() => setHoveredClip(null)}
            draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', clip.id); onDragStart(clip.id); }}
            onDragOver={(e) => { e.preventDefault(); onDragOver(clip.id); }} onDragEnd={onDragEnd}
            onClick={(e) => { e.stopPropagation(); onSelectClip(clip.id); }}>
            <div className={`relative h-full rounded-lg overflow-hidden transition-all duration-200 ${isSelected ? 'ring-2 ring-lime-400 shadow-lg shadow-lime-400/20' : 'ring-1 ring-slate-600/50 hover:ring-slate-500/70'} bg-gradient-to-br ${getTypeColor(clip.type)}`}>
              {isHovered && !isSelected && <div className="absolute inset-0 bg-white/10 animate-pulse" />}
              <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
                <span className="text-xs font-medium text-white truncate drop-shadow-lg">{clip.name || 'Clip'}</span>
              </div>
              {showWaveforms && (
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-black/20 flex items-end justify-around px-1 pointer-events-none">
                  {Array.from({ length: Math.max(5, Math.floor(clipWidth / 3)) }).map((_, i) => (
                    <div key={i} className="w-0.5 bg-white/40 rounded-full" style={{ height: `${Math.random() * 60 + 20}%` }} />
                  ))}
                </div>
              )}
              <div className="absolute inset-0" onContextMenu={(e) => e.preventDefault()} />
              {clip.transition && (
                <button onClick={(e) => { e.stopPropagation(); const rect = e.currentTarget.getBoundingClientRect(); onTransitionClick(clip.id, { x: rect.left, y: rect.top }); }}
                  className="absolute top-1 right-1 p-1 rounded bg-black/60 text-white/80 hover:text-white transition-colors z-10" title={`Transition: ${clip.transition.type}`}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                </button>
              )}
              <div className={`absolute top-0 bottom-0 w-3 bg-gradient-to-r from-white/20 to-transparent opacity-0 transition-opacity ${isHovered || isSelected ? 'opacity-100' : ''} cursor-w-resize hover:bg-white/30`}
                style={{ left: 0 }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => handleResizeStart(e, clip.id, 'left')} />
              <div className={`absolute top-0 bottom-0 w-3 bg-gradient-to-l from-white/20 to-transparent opacity-0 transition-opacity ${isHovered || isSelected ? 'opacity-100' : ''} cursor-e-resize hover:bg-white/30`}
                style={{ right: 0 }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => handleResizeStart(e, clip.id, 'right')} />
              {isSelected && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-900/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg border border-slate-700/50 opacity-100 transition-all">
                  <span className="text-[10px] text-slate-400 font-mono">{clip.startSec.toFixed(1)}s</span>
                  <span className="text-slate-600">→</span>
                  <span className="text-[10px] text-slate-400 font-mono">{clip.endSec.toFixed(1)}s</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-[10px] text-lime-400 font-mono">{(clip.endSec - clip.startSec).toFixed(1)}s</span>
                </div>
              )}
              {isSelected && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); onRemoveClip(clip.id); }} className="p-1 rounded bg-red-500/80 text-white hover:bg-red-500 transition-colors" title="Delete clip">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {safeLayer.clips.length === 0 && (
        <div className={`absolute inset-0 flex items-center justify-center transition-all ${isDropTarget ? 'bg-lime-500/10' : ''}`}>
          <div className={`text-xs border-2 border-dashed rounded-lg px-4 py-2 transition-all ${isDropTarget ? 'border-lime-500 text-lime-400 bg-lime-500/5' : 'border-slate-700/30 text-slate-600'}`}>
            {isDropTarget ? 'Drop here' : 'Drop clips here'}
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineTrackCapCutStyle;
