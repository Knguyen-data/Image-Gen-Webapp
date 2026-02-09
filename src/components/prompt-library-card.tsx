import React from 'react';
import { SavedPrompt } from '../types/prompt-library';

interface PromptLibraryCardProps {
  prompt: SavedPrompt;
  isSelected: boolean;
  onLoad: () => void;
  onSelect: () => void;   // single click to select & edit
  onDelete: () => void;
  onToggleFavorite: () => void;
  onCopy: () => void;
}

const PromptLibraryCard: React.FC<PromptLibraryCardProps> = ({
  prompt,
  isSelected,
  onLoad,
  onSelect,
  onDelete,
  onToggleFavorite,
  onCopy,
}) => {
  return (
    <div
      className={`rounded-lg p-3 cursor-pointer transition-colors border ${
        isSelected
          ? 'bg-gray-800 border-dash-500/50'
          : 'bg-gray-900 hover:bg-gray-800 border-transparent'
      }`}
      onClick={onSelect}
      onDoubleClick={onLoad}
      title="Click to edit · Double-click to load"
    >
      {/* Prompt text (2 lines max) */}
      <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed mb-2">
        {prompt.prompt}
      </p>

      {/* Reference image thumbnails */}
      {prompt.referenceImages.length > 0 && (
        <div className="flex gap-1 mb-2 overflow-hidden">
          {prompt.referenceImages.slice(0, 3).map((img, i) => (
            <div key={img.id || i} className="w-8 h-8 rounded bg-gray-700 overflow-hidden flex-shrink-0">
              <img
                src={`data:${img.mimeType};base64,${img.base64}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}
          {prompt.referenceImages.length > 3 && (
            <span className="text-[10px] text-gray-500 self-center">+{prompt.referenceImages.length - 3}</span>
          )}
        </div>
      )}

      {/* Bottom row: refs count, favorite, copy, delete, load */}
      <div className="flex items-center gap-2 text-[10px]">
        {prompt.settings?.model && (
          <span className="text-gray-600 truncate max-w-[60px]" title={prompt.settings.model}>
            {prompt.settings.model}
          </span>
        )}

        <span className="flex-1" />

        {/* Load into left panel */}
        <button
          onClick={e => { e.stopPropagation(); onLoad(); }}
          className="text-gray-600 hover:text-dash-300 transition-colors"
          title="Load into prompt"
        >
          ↗
        </button>

        <button
          onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          className={`transition-colors ${prompt.isFavorite ? 'text-yellow-400' : 'text-gray-600 hover:text-yellow-400'}`}
          title={prompt.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          ★
        </button>

        <button
          onClick={e => { e.stopPropagation(); onCopy(); }}
          className="text-gray-600 hover:text-gray-300 transition-colors"
          title="Copy prompt"
        >
          ⎘
        </button>

        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-gray-600 hover:text-red-400 transition-colors"
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default PromptLibraryCard;
