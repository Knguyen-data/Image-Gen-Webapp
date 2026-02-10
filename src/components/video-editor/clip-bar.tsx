import React, { useState, useRef, useCallback } from 'react';
import type { EditorClipInfo, TransitionType } from '../../services/video-editor-service';
import { TRANSITION_LABELS } from '../../services/video-editor-service';

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
  isDragOver: boolean;
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
  isDragOver,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [trimming, setTrimming] = useState<'start' | 'end' | null>(null);
  const trimStartX = useRef(0);
  const trimOriginalValue = useRef(0);

  const widthPx = Math.max(clip.durationSec * pixelsPerSecond, 40);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
  };

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

  const bgColor = clip.type === 'broll'
    ? 'bg-blue-600/30 border-blue-500/40'
    : 'bg-dash-600/30 border-dash-500/40';

  const selectedRing = isSelected ? 'ring-2 ring-dash-400' : '';

  return (
    <div
      className="flex items-center relative"
      onDragOver={(e) => { e.preventDefault(); onDragOver(clip.id); }}
    >
      {/* Drop indicator */}
      {isDragOver && (
        <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-dash-400 z-10 rounded-full" />
      )}

      {/* Clip bar */}
      <div
        ref={barRef}
        className={`relative h-14 border rounded-lg cursor-pointer transition-all duration-150 group flex items-center
          ${bgColor} ${selectedRing}
          ${trimming ? 'opacity-80' : 'hover:brightness-110'}
        `}
        style={{ width: `${widthPx}px`, minWidth: '40px' }}
        onClick={() => onSelect(clip.id)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          onDragStart(clip.id);
        }}
        onDragEnd={onDragEnd}
      >
        {/* Left trim handle */}
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize rounded-l-lg bg-white/10 hover:bg-white/25 transition-colors z-10 flex items-center justify-center"
          onMouseDown={(e) => handleTrimMouseDown(e, 'start')}
        >
          <div className="w-0.5 h-4 bg-white/40 rounded-full" />
        </div>

        {/* Clip content */}
        <div className="flex-1 px-3 overflow-hidden select-none">
          <div className="text-xs text-white/80 font-medium truncate">
            {clip.name}
          </div>
          <div className="text-[10px] text-white/50 font-mono mt-0.5">
            {formatTime(clip.durationSec)}
          </div>
        </div>

        {/* Type badge */}
        <div className={`absolute top-1 right-3 text-[9px] font-bold uppercase tracking-wider ${
          clip.type === 'broll' ? 'text-blue-400/60' : 'text-dash-400/60'
        }`}>
          {clip.type === 'broll' ? 'B-ROLL' : 'GEN'}
        </div>

        {/* Right trim handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize rounded-r-lg bg-white/10 hover:bg-white/25 transition-colors z-10 flex items-center justify-center"
          onMouseDown={(e) => handleTrimMouseDown(e, 'end')}
        >
          <div className="w-0.5 h-4 bg-white/40 rounded-full" />
        </div>

        {/* Remove button (on hover) */}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(clip.id); }}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-600/80 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500 z-20"
        >
          ×
        </button>
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
          title={clip.transition ? TRANSITION_LABELS[clip.transition.type as keyof typeof TRANSITION_LABELS] : 'Add transition'}
        >
          <span className="text-[10px]">◆</span>
        </button>
      )}
    </div>
  );
};

export default ClipBar;
