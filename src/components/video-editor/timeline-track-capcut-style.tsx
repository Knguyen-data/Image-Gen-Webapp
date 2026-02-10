import React, { useState, useCallback } from 'react';
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
}) => {
  const [resizing, setResizing] = useState<{
    clipId: string;
    side: 'left' | 'right';
    startX: number;
    originalStart: number;
    originalEnd: number;
  } | null>(null);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, clipId: string, side: 'left' | 'right') => {
      e.stopPropagation();
      const clip = layer.clips.find(c => c.id === clipId);
      if (!clip) return;

      setResizing({
        clipId,
        side,
        startX: e.clientX,
        originalStart: clip.startSec,
        originalEnd: clip.endSec,
      });
    },
    [layer.clips]
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

  // Global mouse event handlers for resizing
  React.useEffect(() => {
    if (!resizing) return;

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);

    return () => {
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [resizing, handleResizeMove, handleResizeEnd]);

  return (
    <div className="relative h-12 border-b border-slate-800/30">
      {layer.clips.map((clip) => {
        const isSelected = selectedClipId === clip.id;
        const isDragOver = dragOverClipId === clip.id;
        const clipWidth = (clip.endSec - clip.startSec) * pixelsPerSecond;
        const clipLeft = clip.startSec * pixelsPerSecond;

        return (
          <div
            key={clip.id}
            className={`absolute top-1 bottom-1 cursor-pointer group ${
              isDragOver ? 'ring-2 ring-cyan-500' : ''
            }`}
            style={{
              left: `${clipLeft}px`,
              width: `${clipWidth}px`,
            }}
            draggable
            onDragStart={() => onDragStart(clip.id)}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOver(clip.id);
            }}
            onDragEnd={onDragEnd}
            onClick={(e) => {
              e.stopPropagation();
              onSelectClip(clip.id);
            }}
          >
            {/* Clip content - CapCut style */}
            <div
              className={`relative h-full rounded-lg overflow-hidden transition-all duration-150 ${
                isSelected
                  ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-400/30'
                  : 'ring-1 ring-slate-600/50'
              } ${
                clip.type === 'generated'
                  ? 'bg-gradient-to-br from-purple-600/80 to-blue-600/80'
                  : clip.type === 'broll'
                  ? 'bg-gradient-to-br from-emerald-600/80 to-teal-600/80'
                  : 'bg-gradient-to-br from-amber-600/80 to-orange-600/80'
              }`}
            >
              {/* Clip label */}
              <div className="absolute inset-0 flex items-center px-2">
                <span className="text-xs font-medium text-white truncate">
                  {clip.name || 'Clip'}
                </span>
              </div>

              {/* Waveform visualization (placeholder) */}
              {showWaveforms && (
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-black/20 flex items-end justify-around px-1 pointer-events-none">
                  {Array.from({ length: Math.floor(clipWidth / 4) }).map((_, i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-white/30 rounded-full"
                      style={{
                        height: `${Math.random() * 60 + 20}%`,
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Transition indicator */}
              {clip.transition && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    onTransitionClick(clip.id, { x: rect.left, y: rect.top });
                  }}
                  className="absolute top-1 right-1 p-1 rounded bg-black/50 text-white/80 hover:text-white transition-colors"
                  title={`Transition: ${clip.transition.type}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                </button>
              )}

              {/* Left resize handle - CapCut/OpenCut style */}
              {isSelected && (
                <>
                  <div
                    className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize bg-cyan-400 hover:bg-cyan-300 transition-colors z-10 flex items-center justify-center group/handle"
                    onMouseDown={(e) => handleResizeStart(e, clip.id, 'left')}
                  >
                    <div className="w-0.5 h-6 bg-slate-900 rounded-full opacity-60" />
                  </div>

                  {/* Right resize handle - CapCut/OpenCut style */}
                  <div
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-cyan-400 hover:bg-cyan-300 transition-colors z-10 flex items-center justify-center group/handle"
                    onMouseDown={(e) => handleResizeStart(e, clip.id, 'right')}
                  >
                    <div className="w-0.5 h-6 bg-slate-900 rounded-full opacity-60" />
                  </div>
                </>
              )}

              {/* Context menu trigger (right-click) */}
              <div
                className="absolute inset-0"
                onContextMenu={(e) => {
                  e.preventDefault();
                  // Context menu could be added here
                }}
              />
            </div>

            {/* Quick actions on hover - CapCut style */}
            {isSelected && (
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-center gap-1 bg-slate-900/95 backdrop-blur-sm rounded-lg px-2 py-1 shadow-lg border border-slate-700/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveClip(clip.id);
                  }}
                  className="p-1 rounded text-red-400 hover:bg-red-900/30 transition-colors"
                  title="Delete clip"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Empty track placeholder */}
      {layer.clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-slate-600 text-xs border-2 border-dashed border-slate-700/30 rounded-lg px-4 py-2">
            Drop clips here
          </div>
        </div>
      )}
    </div>
  );
};

export default TimelineTrackCapCutStyle;
