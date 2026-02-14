import React from 'react';
import { AppMode } from '../../types';
import { ImagePlus, Video, Clapperboard } from 'lucide-react';

interface GalleryToolbarProps {
  appMode: AppMode;
  onSetAppMode: (mode: AppMode) => void;
  selectedCount: number;
  onCompare?: () => void;
  onClearSelection?: () => void;
  isGenerating?: boolean;
  isModifying?: boolean;
}

export const GalleryToolbar: React.FC<GalleryToolbarProps> = ({
  appMode,
  onSetAppMode,
  selectedCount,
  onCompare,
  onClearSelection,
  isGenerating,
  isModifying,
}) => {
  const modeConfig = {
    image: { icon: ImagePlus, label: 'Image', color: 'text-dash-300', bg: 'bg-dash-700' },
    video: { icon: Video, label: 'Video', color: 'text-dash-400', bg: 'bg-dash-700' },
    editing: { icon: Clapperboard, label: 'Edit', color: 'text-purple-400', bg: 'bg-dash-700' },
  };

  return (
    <>
      {/* Progress Bar */}
      {(isGenerating || isModifying) && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-800 overflow-hidden">
          <div className="h-full w-1/3 bg-dash-300 animate-[progress_1.5s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Title and Mode Toggle */}
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-gray-200">
          {appMode === 'editing' && (
            <>
              <span className="text-purple-400">✂️ Editing</span> Workspace
            </>
          )}
          {appMode === 'video' && (
            <>
              <span className="text-dash-400">Video</span> Gallery
            </>
          )}
          {appMode === 'image' && (
            <>
              <span className="text-dash-300">Image</span> Gallery
            </>
          )}
        </h2>

        {/* Mode Toggle */}
        <div className="flex bg-gray-800 rounded-lg p-1 ml-2">
          {Object.entries(modeConfig).map(([mode, config]) => {
            const Icon = config.icon;
            const isActive = appMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onSetAppMode(mode as AppMode)}
                className={`px-3 py-1.5 rounded text-sm transition-all duration-150 flex items-center gap-1.5 ${
                  isActive
                    ? `${config.bg} text-white`
                    : 'text-gray-400 hover:text-gray-200 hover:scale-[1.02]'
                }`}
                title={mode === 'editing' ? 'Editing Workspace' : `${config.label} Generation`}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-xs">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selection Actions */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-dash-200">{selectedCount} selected</span>
          {onCompare && (
            <button
              onClick={onCompare}
              disabled={selectedCount < 2}
              className="px-3 py-1.5 bg-dash-900 text-dash-100 hover:bg-dash-800 rounded text-sm font-medium disabled:opacity-50"
            >
              Compare
            </button>
          )}
          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className="px-3 py-1.5 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded text-sm"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </>
  );
};

export default GalleryToolbar;
