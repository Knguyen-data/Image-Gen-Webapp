import React from 'react';
import ClipBar from './clip-bar';
import type { EditorLayerInfo } from '../../services/video-editor-service';

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
  // Waveform display
  showWaveforms?: boolean;
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
  showWaveforms = true,
}) => {
  return (
    <div className="flex items-center h-10 border-b border-gray-800/30 relative group/track">
      {/* Clips container */}
      <div className="flex-1 flex items-center min-w-0 relative">
        {layer.clips.length === 0 ? (
          <div className="flex items-center h-full pl-2">
            <span className="text-xs text-gray-700 select-none">Empty</span>
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
              showWaveform={showWaveforms}
            />
          ))
        )}

        {/* Drop indicator when dragging */}
        {dragOverClipId && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-dash-500 animate-pulse z-10" />
        )}
      </div>
    </div>
  );
};

export default TimelineTrack;
