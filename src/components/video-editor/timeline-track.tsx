import React from 'react';
import ClipBar from './clip-bar';
import type { EditorLayerInfo, TransitionType } from '../../services/video-editor-service';

interface TimelineTrackProps {
  layer: EditorLayerInfo;
  pixelsPerSecond: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onTrimStart: (clipId: string, newStartSec: number) => void;
  onTrimEnd: (clipId: string, newEndSec: number) => void;
  onTransitionClick: (clipId: string, position: { x: number; y: number }) => void;
  onRemoveClip: (clipId: string) => void;
  onRemoveTrack: (layerIndex: number) => void;
  // Drag reorder
  dragOverClipId: string | null;
  onDragStart: (clipId: string) => void;
  onDragOver: (clipId: string) => void;
  onDragEnd: () => void;
}

const TimelineTrack: React.FC<TimelineTrackProps> = ({
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
}) => {
  return (
    <div className="group/track">
      {/* Track header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/50">
        <div className="flex items-center gap-2 min-w-[100px]">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            Track {layer.index + 1}
          </span>
          <span className="text-[9px] text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
            {layer.mode === 'SEQUENTIAL' ? 'SEQ' : 'STACK'}
          </span>
        </div>
        <div className="flex-1" />
        {layer.clips.length === 0 && (
          <button
            onClick={() => onRemoveTrack(layer.index)}
            className="text-[10px] text-gray-600 hover:text-red-400 transition-colors opacity-0 group-hover/track:opacity-100"
          >
            Remove
          </button>
        )}
      </div>

      {/* Clips */}
      <div className="flex items-center px-3 py-2 min-h-[60px] overflow-x-visible">
        {layer.clips.length === 0 ? (
          <div className="text-xs text-gray-600 italic select-none pl-1">
            Empty track — drag clips here or import B-roll
          </div>
        ) : (
          layer.clips.map((clip, i) => (
            <ClipBar
              key={clip.id}
              clip={clip}
              pixelsPerSecond={pixelsPerSecond}
              isSelected={selectedClipId === clip.id}
              onSelect={onSelectClip}
              onTrimStart={onTrimStart}
              onTrimEnd={onTrimEnd}
              onTransitionClick={onTransitionClick}
              onRemove={onRemoveClip}
              isLast={i === layer.clips.length - 1}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              isDragOver={dragOverClipId === clip.id}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default TimelineTrack;
