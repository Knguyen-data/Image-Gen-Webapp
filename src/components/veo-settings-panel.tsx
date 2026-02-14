import React from 'react';
import { useVeoGeneration } from '../../hooks/use-veo-generation';
import type { VeoSettings, VeoTaskResult } from '../veo3';

interface VeoSettingsPanelProps {
  settings: VeoSettings;
  onSettingsChange: (settings: VeoSettings) => void;
  taskResult: VeoTaskResult | null;
  isGenerating: boolean;
}

export const VeoSettingsPanel: React.FC<VeoSettingsPanelProps> = ({
  settings,
  onSettingsChange,
  taskResult,
  isGenerating,
}) => {
  const aspectRatio = settings.aspectRatio || '16:9';
  const resolution = settings.resolution || '720p';

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Veo Settings
        </label>
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <span className="text-xs text-gray-500">Aspect Ratio</span>
        <div className="flex gap-2">
          {(['16:9', '9:16', '1:1'] as const).map(ratio => (
            <button
              key={ratio}
              onClick={() => onSettingsChange({ ...settings, aspectRatio: ratio })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                aspectRatio === ratio
                  ? 'bg-dash-600/25 text-dash-200 ring-1 ring-dash-400/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      {/* Resolution */}
      <div className="space-y-2">
        <span className="text-xs text-gray-500">Resolution</span>
        <div className="flex gap-2">
          {(['720p', '1080p', '4K'] as const).map(res => (
            <button
              key={res}
              onClick={() => onSettingsChange({ ...settings, resolution: res })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                resolution === res
                  ? 'bg-dash-600/25 text-dash-200 ring-1 ring-dash-400/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {res}
            </button>
          ))}
        </div>
      </div>

      {/* Enhanced Prompt Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-500 block">Enhanced Prompt</span>
          <span className="text-[10px] text-gray-600">Auto-optimize prompt for Veo</span>
        </div>
        <button
          onClick={() => onSettingsChange({ ...settings, enhancedPrompt: !settings.enhancedPrompt })}
          className={`w-10 h-5 rounded-full relative transition-colors ${
            settings.enhancedPrompt
              ? 'bg-dash-700 ring-1 ring-dash-400'
              : 'bg-gray-700'
          }`}
        >
          <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${
            settings.enhancedPrompt ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>

      {/* Seed Input */}
      <div className="space-y-2">
        <span className="text-xs text-gray-500">Seed (optional)</span>
        <input
          type="number"
          placeholder="Random"
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
          value={settings.seed || ''}
          onChange={(e) => onSettingsChange({ ...settings, seed: e.target.value ? parseInt(e.target.value) : undefined })}
        />
      </div>

      {/* Watermark Input */}
      <div className="space-y-2">
        <span className="text-xs text-gray-500">Watermark (optional)</span>
        <input
          type="text"
          placeholder="None"
          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300"
          value={settings.watermark || ''}
          onChange={(e) => onSettingsChange({ ...settings, watermark: e.target.value })}
        />
      </div>

      {/* Info Box */}
      <div className="p-3 bg-dash-900/20 border border-dash-500/30 rounded-lg text-xs text-dash-300">
        <p className="font-medium mb-1">Veo 3.1 — Google AI Video</p>
        <p className="text-dash-400/80">
          Generate high-quality videos from text or images with Google's latest AI model.
        </p>
      </div>
    </div>
  );
};

export default VeoSettingsPanel;
