import React, { useState } from 'react';
import { VideoScene, ReferenceImage, ReferenceVideo } from '../../types';
import { formatDuration } from '../../utils/video-dimensions';

interface SceneCardProps {
  scene: VideoScene;
  index: number;
  totalScenes: number;
  isKling3: boolean;
  isKling3Omni: boolean;
  isKling3MultiShot: boolean;
  showPromptToggle: boolean;
  dragOverIndex: number | null;
  reorderDragIndex: number | null;
  reorderOverIndex: number | null;
  onDragOver: (index: number) => void;
  onDragLeave: () => void;
  onDrop: (index: number) => void;
  onReorderDragStart: (index: number) => void;
  onReorderDragOver: (index: number) => void;
  onReorderDragEnd: () => void;
  onReorderDrop: (index: number) => void;
  onRemove: () => void;
  onUpdatePrompt: (prompt: string) => void;
  onTogglePrompt: () => void;
  onDurationChange: (duration: number) => void;
  onAddImage: () => void;
  onRemoveImage: () => void;
  onAddVideo: () => void;
  onRemoveVideo: () => void;
  onFileDrop: (file: File) => void;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  index,
  totalScenes,
  isKling3,
  isKling3Omni,
  isKling3MultiShot,
  showPromptToggle,
  dragOverIndex,
  reorderDragIndex,
  reorderOverIndex,
  onDragOver,
  onDragLeave,
  onDrop,
  onReorderDragStart,
  onReorderDragOver,
  onReorderDragEnd,
  onReorderDrop,
  onRemove,
  onUpdatePrompt,
  onTogglePrompt,
  onDurationChange,
  onAddImage,
  onRemoveImage,
  onAddVideo,
  onRemoveVideo,
  onFileDrop,
}) => {
  const [localDragOver, setLocalDragOver] = useState(false);
  
  const handleLocalDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalDragOver(true);
    onDragOver(index);
  };

  const handleLocalDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalDragOver(false);
    onDragLeave();
  };

  const handleLocalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalDragOver(false);
    onDragLeave();

    const file = e.dataTransfer.files[0];
    if (file) {
      onFileDrop(file);
    }
  };

  const handleReorderDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
    onReorderDragStart(index);
  };

  const handleReorderDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (reorderDragIndex !== null && reorderDragIndex !== index) {
      onReorderDragOver(index);
    }
  };

  const isReorderActive = reorderDragIndex !== null;
  const isCurrentReorderTarget = reorderOverIndex === index;

  return (
    <div
      draggable={!localDragOver && !isReorderActive}
      onDragStart={handleReorderDragStart}
      onDragOver={handleReorderDragOver}
      onDragEnd={onReorderDragEnd}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onReorderDragEnd();
        if (reorderDragIndex !== null) {
          onReorderDrop(index);
        }
      }}
      className={`
        relative group rounded-xl border transition-all duration-200
        ${isCurrentReorderTarget ? 'border-dash-400 ring-2 ring-dash-400/30 scale-[1.02]' : ''}
        ${dragOverIndex === index || localDragOver
          ? 'border-dash-400 bg-dash-900/20'
          : 'bg-gray-900/40 border-gray-800 hover:border-gray-700'}
      `}
    >
      {/* Scene Number & Reorder Handle */}
      <div className="flex items-center justify-between p-3 border-b border-gray-800/50 bg-gray-900/30">
        <div className="flex items-center gap-2">
          <span className={`
            drag-handle cursor-grab active:cursor-grabbing px-1.5 py-0.5 rounded text-xs font-mono
            ${isReorderActive ? 'opacity-50' : ''}
          `}>
            #{index + 1}
          </span>
          {isKling3MultiShot && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-dash-900/30 text-dash-400 font-mono border border-dash-500/20">
              {formatDuration(scene.duration || 3)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Remove button */}
          {totalScenes > 1 && (
            <button
              onClick={onRemove}
              className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
              title="Remove scene"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Reference Image Area */}
      <div
        onDragOver={handleLocalDragOver}
        onDragLeave={handleLocalDragLeave}
        onDrop={handleLocalDrop}
        className={`
          relative p-3 ${!scene.referenceImage ? 'flex items-center justify-center' : ''}
          ${localDragOver ? 'bg-dash-900/20' : ''}
          ${!scene.referenceImage ? 'min-h-[120px]' : ''}
        `}
      >
        {scene.referenceImage ? (
          <div className="relative">
            <img
              src={scene.referenceImage.previewUrl || `data:${scene.referenceImage.mimeType};base64,${scene.referenceImage.base64}`}
              alt={`Scene ${index + 1} reference`}
              className="w-full aspect-video object-contain rounded-lg bg-gray-950"
              draggable={false}
            />
            {/* Remove Image */}
            <button
              onClick={onRemoveImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
              title="Remove image"
            >
              ×
            </button>
            {/* Duration badge for Kling 3 MultiShot */}
            {isKling3MultiShot && scene.duration && (
              <div className="absolute -bottom-1.5 -right-1.5 flex items-center gap-1 bg-gray-900/90 backdrop-blur rounded px-1.5 py-0.5 border border-gray-700">
                <svg className="w-3 h-3 text-dash-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[10px] text-dash-300 font-mono">{scene.duration}s</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-500">
            <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-xs">Drop or click</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*,video/*"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileDrop(file);
          }}
        />
      </div>

      {/* Prompt Section */}
      {showPromptToggle && (
        <div className="p-3 pt-0 space-y-2">
          {/* Prompt Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={onTogglePrompt}
              className={`
                px-2 py-1 rounded text-xs flex items-center gap-1.5 transition-all
                ${scene.usePrompt
                  ? 'bg-dash-900/30 text-dash-300 border border-dash-500/30'
                  : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-600'}
              `}
              title="Toggle prompt for this scene"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${scene.usePrompt ? 'bg-dash-400 animate-pulse' : 'bg-gray-600'}`} />
              {scene.usePrompt ? 'Prompt ON' : 'Prompt OFF'}
            </button>
          </div>

          {/* Prompt Input */}
          {scene.usePrompt && (
            <textarea
              value={scene.prompt || ''}
              onChange={(e) => onUpdatePrompt(e.target.value)}
              placeholder={isKling3 ? 'Optional: Add custom prompt (or leave empty for auto-generated)' : 'Enter motion prompt...'}
              className="w-full bg-gray-950/50 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-dash-500/50"
              rows={2}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default SceneCard;
