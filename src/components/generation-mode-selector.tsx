import React from 'react';
import { SpicySubMode, SpicyModeSettings } from '../../types';

interface GenerationModeSelectorProps {
  spicyMode: SpicyModeSettings | undefined;
  setSpicyMode: (settings: SpicyModeSettings) => void;
  credits: number | null;
  creditsLoading: boolean;
  isLowCredits: boolean;
  isCriticalCredits: boolean;
}

export const GenerationModeSelector: React.FC<GenerationModeSelectorProps> = ({
  spicyMode,
  setSpicyMode,
  credits,
  creditsLoading,
  isLowCredits,
  isCriticalCredits,
}) => {
  const enabled = spicyMode?.enabled || false;
  const subMode = spicyMode?.subMode || 'edit';

  const setEnabled = (value: boolean) => {
    setSpicyMode({
      ...spicyMode,
      enabled: value,
      subMode: value ? subMode : 'edit',
    });
  };

  const setSubMode = (newSubMode: SpicySubMode) => {
    setSpicyMode({
      ...spicyMode,
      enabled: true,
      subMode: newSubMode,
      comfyui: newSubMode === 'extreme' 
        ? spicyMode?.comfyui || { steps: 25, cfg: 1, denoise: 1, sampler: 'euler', scheduler: 'simple', seed: -1, ipAdapterWeight: 1, ipAdapterFaceidWeight: 1 }
        : spicyMode?.comfyui,
    });
  };

  return (
    <div className="px-6 py-3 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Generation Mode
        </span>
        
        {/* Spicy Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEnabled(!enabled)}
            className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 ${
              enabled
                ? 'bg-red-900/30 text-red-400 border-red-500/50 ring-1 ring-red-500/30'
                : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
            }`}
            title={enabled ? 'Spicy Mode ON (Seedream)' : 'Spicy Mode OFF (Gemini)'}
          >
            <span className="text-lg">🌶️</span>
            {enabled && credits !== null && (
              <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                isCriticalCredits ? 'bg-red-900/50 text-red-300' :
                isLowCredits ? 'bg-yellow-900/50 text-yellow-300' :
                'bg-gray-800 text-gray-300'
              }`}>
                {creditsLoading ? '...' : credits}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Sub-Mode Selector - Only show when Spicy Mode is enabled */}
      {enabled && (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 ml-auto">
            <button
              onClick={() => setSubMode('edit')}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                subMode === 'edit'
                  ? 'bg-red-500 text-white font-medium'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Edit mode - requires reference image"
            >
              Edit
            </button>
            <button
              onClick={() => setSubMode('generate')}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                subMode === 'generate'
                  ? 'bg-red-500 text-white font-medium'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Generate mode - text only, no image needed"
            >
              Generate
            </button>
            <button
              onClick={() => setSubMode('extreme')}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                subMode === 'extreme'
                  ? 'bg-gradient-to-r from-red-600 to-red-800 text-white font-medium ring-1 ring-red-400/50'
                  : 'text-gray-400 hover:text-white'
              }`}
              title="Extreme mode - ComfyUI Lustify (RunPod)"
            >
              Extreme
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GenerationModeSelector;
