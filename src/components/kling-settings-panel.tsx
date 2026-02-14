import React from 'react';
import { VideoSettings, KlingProDuration, KlingProAspectRatio } from '../../types';

interface KlingSettingsPanelProps {
  videoSettings: VideoSettings;
  setVideoSettings: (settings: VideoSettings) => void;
  selectedModel: 'kling-2.6' | 'kling-2.6-pro';
}

export const KlingSettingsPanel: React.FC<KlingSettingsPanelProps> = ({
  videoSettings,
  setVideoSettings,
  selectedModel,
}) => {
  const orientation = videoSettings.orientation || 'image';
  const resolution = videoSettings.resolution || '720p';
  const klingProvider = videoSettings.klingProvider || 'freepik';
  const klingCfgScale = videoSettings.klingCfgScale ?? 0.5;
  const klingProDuration = videoSettings.klingProDuration || '5';
  const klingProAspectRatio = videoSettings.klingProAspectRatio || 'widescreen_16_9';
  const klingProNegativePrompt = videoSettings.klingProNegativePrompt || '';
  const klingProGenerateAudio = videoSettings.klingProGenerateAudio || false;

  return (
    <div className="px-6 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Video Settings
        </label>
      </div>

      {/* Orientation Control */}
      {selectedModel === 'kling-2.6' && (
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Orientation</span>
          <div className="flex gap-2">
            <button
              onClick={() => setVideoSettings({ ...videoSettings, orientation: 'image' })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                orientation === 'image'
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              <span className="block">Image Mode</span>
              <span className="text-[10px] opacity-60">10s max</span>
            </button>
            <button
              onClick={() => setVideoSettings({ ...videoSettings, orientation: 'video' })}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                orientation === 'video'
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              <span className="block">Video Mode</span>
              <span className="text-[10px] opacity-60">30s max</span>
            </button>
          </div>
        </div>
      )}

      {/* Duration Control - Pro I2V only */}
      {selectedModel === 'kling-2.6-pro' && (
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Duration</span>
          <div className="flex gap-2">
            {(['5', '10'] as KlingProDuration[]).map(dur => (
              <button
                key={dur}
                onClick={() => setVideoSettings({ ...videoSettings, klingProDuration: dur })}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  klingProDuration === dur
                    ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {dur}s
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Resolution Control - Kling 2.6 only */}
      {selectedModel === 'kling-2.6' && (
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Resolution</span>
          <div className="flex gap-2">
            <button
              onClick={() => setVideoSettings({ ...videoSettings, resolution: '720p' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                resolution === '720p'
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              720p
            </button>
            <button
              onClick={() => setVideoSettings({ ...videoSettings, resolution: '1080p' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                resolution === '1080p'
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              1080p
            </button>
          </div>
        </div>
      )}

      {/* Aspect Ratio Control - Pro I2V only */}
      {selectedModel === 'kling-2.6-pro' && (
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Aspect Ratio</span>
          <div className="flex gap-2">
            {([
              { value: 'widescreen_16_9' as KlingProAspectRatio, label: '16:9' },
              { value: 'square_1_1' as KlingProAspectRatio, label: '1:1' },
              { value: 'social_story_9_16' as KlingProAspectRatio, label: '9:16' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setVideoSettings({ ...videoSettings, klingProAspectRatio: opt.value })}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  klingProAspectRatio === opt.value
                    ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Provider Control - Kling 2.6 only */}
      {selectedModel === 'kling-2.6' && (
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Provider</span>
          <div className="flex gap-2">
            <button
              onClick={() => setVideoSettings({ ...videoSettings, klingProvider: 'freepik' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                klingProvider === 'freepik'
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              Freepik
            </button>
            <button
              onClick={() => setVideoSettings({ ...videoSettings, klingProvider: 'kieai' })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                klingProvider === 'kieai'
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              Kie.ai
            </button>
          </div>
        </div>
      )}

      {/* CFG Scale Slider */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-xs text-gray-500">CFG Scale</span>
          <span className="text-xs text-dash-300 font-mono">{klingCfgScale.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-300"
          value={klingCfgScale}
          onChange={(e) => setVideoSettings({ ...videoSettings, klingCfgScale: parseFloat(e.target.value) })}
        />
        <p className="text-[10px] text-gray-600">Higher = stronger prompt adherence, lower = more creative</p>
      </div>

      {/* Negative Prompt - Pro I2V only */}
      {selectedModel === 'kling-2.6-pro' && (
        <div className="space-y-2">
          <span className="text-xs text-gray-500">Negative Prompt</span>
          <textarea
            className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 font-mono resize-y min-h-[40px]"
            rows={2}
            value={klingProNegativePrompt}
            onChange={(e) => setVideoSettings({ ...videoSettings, klingProNegativePrompt: e.target.value })}
            placeholder="Things to avoid (e.g. blurry, shaky, watermark)..."
          />
        </div>
      )}

      {/* Generate Audio Toggle - Pro I2V only */}
      {selectedModel === 'kling-2.6-pro' && (
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs text-gray-500 block">Generate Audio</span>
            <span className="text-[10px] text-gray-600">AI-generated sound for the video</span>
          </div>
          <button
            onClick={() => setVideoSettings({ ...videoSettings, klingProGenerateAudio: !klingProGenerateAudio })}
            className={`w-10 h-5 rounded-full relative transition-colors ${
              klingProGenerateAudio
                ? 'bg-dash-700 ring-1 ring-dash-400'
                : 'bg-gray-700'
            }`}
          >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${
              klingProGenerateAudio ? 'left-6' : 'left-1'
            }`} />
          </button>
        </div>
      )}

      {/* Info Box */}
      <div className="p-3 bg-dash-900/20 border border-dash-500/30 rounded-lg text-xs text-dash-300">
        <p className="font-medium mb-1">
          {selectedModel === 'kling-2.6-pro' ? 'Kling 2.6 Pro — Image to Video' : 'Kling 2.6 Motion Control'}
        </p>
        <p className="text-dash-400/80">
          {selectedModel === 'kling-2.6-pro'
            ? 'Animate any image with AI-driven motion. No reference video needed.'
            : orientation === 'image'
            ? 'Video-to-Video: Up to 10 seconds per scene'
            : 'Video-to-Video: Up to 30 seconds per scene'}
        </p>
      </div>
    </div>
  );
};

export default KlingSettingsPanel;
