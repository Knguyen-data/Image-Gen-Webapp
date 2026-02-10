import React, { useState } from 'react';
import { VeoModel, VeoAspectRatio, VeoGenerationType } from '../../types';

export interface VeoSettings {
  model: VeoModel;
  aspectRatio: VeoAspectRatio;
  enableTranslation: boolean;
  seeds?: number;
  watermark?: string;
  callBackUrl?: string;
}

interface VeoSettingsPanelProps {
  settings: VeoSettings;
  onUpdate: (settings: VeoSettings) => void;
  generationMode: VeoGenerationType;
}

const VeoSettingsPanel: React.FC<VeoSettingsPanelProps> = ({
  settings, onUpdate, generationMode,
}) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isRefMode = generationMode === 'REFERENCE_2_VIDEO';

  // Model options
  const modelOptions: { value: VeoModel; label: string; desc: string }[] = [
    { value: 'veo3', label: 'Quality', desc: 'Highest fidelity, slower' },
    { value: 'veo3_fast', label: 'Fast', desc: 'Cost-efficient, faster' },
  ];

  // Aspect ratio options — Reference mode: no Auto
  const aspectOptions: { value: VeoAspectRatio; label: string }[] = isRefMode
    ? [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
      ]
    : [
        { value: '16:9', label: '16:9' },
        { value: '9:16', label: '9:16' },
        { value: 'Auto', label: 'Auto' },
      ];

  return (
    <div className="px-6 py-4 space-y-4">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">
        Settings
      </label>

      {/* Model Selection */}
      <div className="space-y-2">
        <span className="text-xs text-gray-500">Model</span>
        <div className="flex gap-2">
          {modelOptions.map(opt => {
            // Reference mode forces veo3_fast
            const disabled = isRefMode && opt.value === 'veo3';
            return (
              <button
                key={opt.value}
                onClick={() => !disabled && onUpdate({ ...settings, model: opt.value })}
                disabled={disabled}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                  settings.model === opt.value
                    ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                    : disabled
                    ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed border border-gray-800'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
                title={disabled ? 'Reference mode requires Fast model' : opt.desc}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {isRefMode && (
          <p className="text-[10px] text-amber-400/80">
            Reference-to-Video requires the Fast model.
          </p>
        )}
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-2">
        <span className="text-xs text-gray-500">Aspect Ratio</span>
        <div className="flex gap-2">
          {aspectOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => onUpdate({ ...settings, aspectRatio: opt.value })}
              className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                settings.aspectRatio === opt.value
                  ? 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isRefMode && (
          <p className="text-[10px] text-amber-400/80">
            Reference mode requires explicit aspect ratio (16:9 or 9:16).
          </p>
        )}
      </div>

      {/* Auto-translate toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs text-gray-500 block">Auto-translate to English</span>
          <span className="text-[10px] text-gray-600">Translates non-English prompts automatically</span>
        </div>
        <button
          onClick={() => onUpdate({ ...settings, enableTranslation: !settings.enableTranslation })}
          className={`w-10 h-5 rounded-full relative transition-colors ${
            settings.enableTranslation
              ? 'bg-dash-700 ring-1 ring-dash-400'
              : 'bg-gray-700'
          }`}
        >
          <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-transform ${
            settings.enableTranslation ? 'left-6' : 'left-1'
          }`} />
        </button>
      </div>

      {/* Advanced Options (Collapsible) */}
      <div className="space-y-2">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
        >
          <span className={`text-[10px] transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>&#9654;</span>
          Advanced Options
        </button>

        {advancedOpen && (
          <div className="space-y-3 pl-2 border-l-2 border-gray-800">
            {/* Seeds */}
            <div className="space-y-1">
              <span className="text-xs text-gray-500">Seed (10000-99999)</span>
              <input
                type="number"
                min={10000}
                max={99999}
                placeholder="Auto"
                value={settings.seeds ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdate({
                    ...settings,
                    seeds: val === '' ? undefined : parseInt(val, 10),
                  });
                }}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 font-mono focus:ring-1 focus:ring-dash-400 focus:border-dash-500/50 transition-all placeholder:text-gray-600"
              />
            </div>

            {/* Watermark */}
            <div className="space-y-1">
              <span className="text-xs text-gray-500">Watermark (max 50 chars)</span>
              <input
                type="text"
                maxLength={50}
                placeholder="Optional watermark text"
                value={settings.watermark ?? ''}
                onChange={(e) => onUpdate({ ...settings, watermark: e.target.value || undefined })}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 focus:ring-1 focus:ring-dash-400 focus:border-dash-500/50 transition-all placeholder:text-gray-600"
              />
            </div>

            {/* Callback URL */}
            <div className="space-y-1">
              <span className="text-xs text-gray-500">Callback URL</span>
              <input
                type="url"
                placeholder="https://your-server.com/callback"
                value={settings.callBackUrl ?? ''}
                onChange={(e) => onUpdate({ ...settings, callBackUrl: e.target.value || undefined })}
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2 text-xs text-gray-300 font-mono focus:ring-1 focus:ring-dash-400 focus:border-dash-500/50 transition-all placeholder:text-gray-600"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VeoSettingsPanel;
