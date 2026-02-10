import React, { useState, useRef, useCallback } from 'react';
import type { EditorClipInfo } from '../../services/video-editor-service';

interface ClipBarProps {
  clip: EditorClipInfo;
  pixelsPerSecond: number;
  isSelected: boolean;
  onSelect: (clipId: string) => void;
  onTrimStart: (clipId: string, newStartSec: number) => void;
  onTrimEnd: (clipId: string, newEndSec: number) => void;
  onTransitionClick: (clipId: string, position: { x: number; y: number }) => void;
  onRemove: (clipId: string) => void;
  isLast: boolean;
  // Drag reorder
  onDragStart: (clipId: string) => void;
  onDragOver: (clipId: string) => void;
  onDragEnd: () => void;
  isDragOver?: boolean;
  // Waveform display
  showWaveform?: boolean;
  // FPS for time formatting
  fps?: number;
}

// CapCut-style time formatter
function formatClipTime(seconds: number, fps: number = 30): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * fps);
  return mins > 0
    ? `${mins}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`
    : `${secs}.${frames.toString().padStart(2, '0')}s`;
}

// Deterministic waveform height based on clip id and bar index
function seededHeight(clipId: string, index: number): number {
  let hash = 0;
  const seed = `${clipId}-${index}`;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return 15 + Math.abs(hash % 60);
}

const ClipBar: React.FC<ClipBarProps> = ({
  clip,
  pixelsPerSecond,
  isSelected,
  onSelect,
  onTrimStart,
  onTrimEnd,
  onTransitionClick,
  onRemove,
  isLast,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragOver = false,
  showWaveform = true,
  fps = 30,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [trimming, setTrimming] = useState<'start' | 'end' | null>(null);
  const trimStartX = useRef(0);
  const trimOriginalValue = useRef(0);

  const minWidth = 20;
  const widthPx = Math.max(clip.durationSec * pixelsPerSecond, minWidth);
  const isTinyClip = widthPx < 50;
  const leftPx = clip.startSec * pixelsPerSecond;

  const handleTrimMouseDown = useCallback((
    e: React.MouseEvent,
    side: 'start' | 'end'
  ) => {
    e.stopPropagation();
    e.preventDefault();
    setTrimming(side);
    trimStartX.current = e.clientX;
    trimOriginalValue.current = side === 'start' ? clip.startSec : clip.endSec;

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - trimStartX.current;
      const dtSec = dx / pixelsPerSecond;

      if (side === 'start') {
        const newStart = Math.max(0, trimOriginalValue.current + dtSec);
        if (newStart < clip.endSec - 0.1) {
          onTrimStart(clip.id, newStart);
        }
      } else {
        const newEnd = Math.max(clip.startSec + 0.1, trimOriginalValue.current + dtSec);
        onTrimEnd(clip.id, newEnd);
      }
    };

    const handleMouseUp = () => {
      setTrimming(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [clip, pixelsPerSecond, onTrimStart, onTrimEnd]);

  // Color based on clip type (CapCut-style)
  const getClipColors = () => {
    switch (clip.type) {
      case 'broll':
        return {
          bg: 'bg-blue-500/20',
          border: 'border-blue-500/40',
          icon: 'text-blue-400',
        };
      case 'stock':
        return {
          bg: 'bg-green-500/20',
          border: 'border-green-500/40',
          icon: 'text-green-400',
        };
      case 'generated':
      default:
        return {
          bg: 'bg-dash-500/20',
          border: 'border-dash-500/40',
          icon: 'text-dash-400',
        };
    }
  };

  const colors = getClipColors();
  const isTrimming = trimming !== null;

  return (
    <div
      className="absolute top-1 bottom-1 flex items-stretch"
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(clip.id); }}
      title={isTinyClip ? `${clip.type === 'generated' ? 'Generated' : clip.type === 'broll' ? 'B-roll' : 'Stock'} - ${formatClipTime(clip.durationSec, fps)}` : undefined}
    >
      {/* Drop indicator */}
      {isDragOver && (
        <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-dash-400 z-20 animate-pulse" />
      )}

      {/* Clip bar */}
      <div
        ref={barRef}
        className={`
          flex-1 relative flex items-stretch rounded-lg overflow-hidden
          ${colors.bg} ${colors.border}
          ${isSelected ? 'ring-2 ring-dash-400 ring-offset-1 ring-offset-gray-900' : ''}
          ${isTrimming ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-gray-900' : ''}
          ${isDragOver ? 'ring-2 ring-dash-400' : ''}
          cursor-pointer transition-all duration-150
          hover:brightness-110
        `}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(clip.id);
        }}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(clip.id);
        }}
        onDragEnd={onDragEnd}
      >
        {/* Left trim handle (CapCut-style) */}
        <div
          className={`
            absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10
            flex items-center justify-center opacity-0 hover:opacity-100
            ${isSelected ? 'opacity-100' : ''}
            ${isTrimming ? 'opacity-100 bg-white/20' : ''}
            transition-all
          `}
          onMouseDown={(e) => handleTrimMouseDown(e, 'start')}
        >
          <div className="w-0.5 h-4 bg-white/60 rounded-full" />
        </div>

        {/* Right trim handle */}
        <div
          className={`
            absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10
            flex items-center justify-center opacity-0 hover:opacity-100
            ${isSelected ? 'opacity-100' : ''}
            ${isTrimming ? 'opacity-100 bg-white/20' : ''}
            transition-all
          `}
          onMouseDown={(e) => handleTrimMouseDown(e, 'end')}
        >
          <div className="w-0.5 h-4 bg-white/60 rounded-full" />
        </div>

        {/* Clip content */}
        <div className="flex-1 flex flex-col p-1.5 min-w-0">
          {/* Thumbnail / waveform area */}
          <div className="flex-1 rounded bg-black/20 flex items-center justify-center overflow-hidden relative">
            {showWaveform && (
              <div className="absolute inset-0 flex items-center justify-center gap-px px-2">
                {/* Deterministic waveform visualization */}
                {Array.from({ length: Math.min(50, Math.floor(widthPx / 3)) }).map((_, i) => (
                  <div
                    key={i}
                    className="w-0.5 bg-gradient-to-t from-white/40 to-white/10 rounded-full"
                    style={{ height: `${seededHeight(clip.id, i)}%` }}
                  />
                ))}
              </div>
            )}

            {/* Clip type icon */}
            <div className={`relative z-10 ${colors.icon}`}>
              {clip.type === 'broll' && (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
              {clip.type === 'stock' && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              )}
              {clip.type === 'generated' && (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
            </div>
          </div>

          {/* Clip info bar - hidden for tiny clips */}
          {!isTinyClip && (
            <div className="flex items-center justify-between mt-1">
              {/* Clip name */}
              <span className="text-[10px] text-gray-300 truncate font-medium">
                {clip.type === 'generated' ? 'Generated' : clip.type === 'broll' ? 'B-roll' : 'Stock'}
              </span>

              {/* Duration */}
              <span className="text-[9px] text-gray-500 font-mono">
                {formatClipTime(clip.durationSec, fps)}
              </span>
            </div>
          )}
        </div>

        {/* Transition indicator (if exists) */}
        {clip.transition && (
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20"
            onClick={(e) => {
              e.stopPropagation();
              if (barRef.current) {
                const rect = barRef.current.getBoundingClientRect();
                onTransitionClick(clip.id, {
                  x: rect.right + 8,
                  y: rect.top + rect.height / 2,
                });
              }
            }}
          >
            <div className="w-4 h-4 rounded-full bg-dash-500 text-white text-[8px] flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform">
              T
            </div>
          </div>
        )}
      </div>

      {/* Transition connector between clips */}
      {!isLast && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            onTransitionClick(clip.id, { x: rect.left, y: rect.bottom + 4 });
          }}
          className={`mx-1 w-5 h-5 flex-shrink-0 flex items-center justify-center rounded transition-all duration-150 ${
            clip.transition
              ? 'bg-dash-600/30 text-dash-300 hover:bg-dash-600/50'
              : 'bg-gray-700/50 text-gray-500 hover:bg-gray-600/50 hover:text-gray-300'
          }`}
          title={clip.transition ? 'Transition' : 'Add transition'}
        >
          <span className="text-[10px]">◆</span>
        </button>
      )}
    </div>
  );
};

export default ClipBar;
