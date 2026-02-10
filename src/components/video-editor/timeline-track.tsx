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
    <div className="relative h-12 border-b border-gray-800/30">
      {layer.clips.map((clip, i) => (
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
      ))}

      {/* Empty track placeholder */}
      {layer.clips.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-600 text-xs border-2 border-dashed border-gray-700/30 rounded-lg px-4 py-2">
            Drop clips here
          </div>
        </div>
      )}

      {/* Drop indicator when dragging */}
      {dragOverClipId && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-dash-500 animate-pulse z-10" />
      )}
    </div>
  );
};

export default TimelineTrack;
