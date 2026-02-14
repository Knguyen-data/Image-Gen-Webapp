import React, { useState } from 'react';
import { VideoModel } from '../types';

interface VideoModelSelectorProps {
  selectedModel: VideoModel;
  onModelSelect: (model: VideoModel) => void;
}

const MODEL_OPTIONS = {
  kling: [
    { value: 'kling-2.6' as VideoModel, label: 'Kling 2.6', desc: 'Motion Control' },
    { value: 'kling-2.6-pro' as VideoModel, label: 'Kling 2.6 Pro', desc: 'Image to Video' },
    { value: 'kling-3' as VideoModel, label: 'Kling 3', desc: 'MultiShot' },
    { value: 'kling-3-omni' as VideoModel, label: 'Kling 3 Omni', desc: 'Multimodal' },
  ],
  veo: [
    { value: 'veo-3.1' as VideoModel, label: 'Veo 3.1', desc: 'Google AI Video' },
  ],
  director: [
    { value: 'director' as VideoModel, label: 'Director Pipeline', desc: 'Multi-shot • Gemini + Wan 2.2', badge: 'NSFW' },
  ],
} as const;

export const VideoModelSelector: React.FC<VideoModelSelectorProps> = ({
  selectedModel,
  onModelSelect,
}) => {
  const [selectedFamily, setSelectedFamily] = useState<'kling' | 'veo' | 'director'>(() => {
    if (selectedModel === 'veo-3.1') return 'veo';
    if (selectedModel === 'director') return 'director';
    return 'kling';
  });

  const handleFamilyChange = (family: 'kling' | 'veo' | 'director') => {
    setSelectedFamily(family);
    if (family === 'kling') {
      onModelSelect('kling-2.6');
    } else if (family === 'veo') {
      onModelSelect('veo-3.1');
    } else {
      onModelSelect('director');
    }
  };

  const options = MODEL_OPTIONS[selectedFamily];

  return (
    <div className="px-6 py-4 border-b border-gray-800">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
        Video Model
      </label>
      
      <div className="bg-gray-900/60 backdrop-blur-sm border border-gray-800/50 rounded-xl p-3 space-y-2">
        {/* Family Tabs */}
        <div className="flex gap-1 bg-gray-950/50 rounded-lg p-1">
          <button
            onClick={() => handleFamilyChange('kling')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              selectedFamily === 'kling'
                ? 'bg-dash-700/50 text-dash-300 border border-dash-500/30 shadow-[0_0_8px_rgba(74,222,128,0.08)]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <KlingIcon />
            Kling
          </button>
          <button
            onClick={() => handleFamilyChange('veo')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
              selectedFamily === 'veo'
                ? 'bg-dash-700/50 text-dash-300 border border-dash-500/30 shadow-[0_0_8px_rgba(74,222,128,0.08)]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <GoogleIcon />
            Veo
          </button>
          <button
            onClick={() => handleFamilyChange('director')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 relative ${
              selectedFamily === 'director'
                ? 'bg-orange-700/30 text-orange-300 border border-orange-500/30 shadow-[0_0_8px_rgba(249,115,22,0.12)]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border border-transparent'
            }`}
          >
            <span className="text-sm">🎬</span>
            Director
            <span className="absolute -top-2 -right-1 text-[9px] px-1.5 py-0.5 rounded bg-orange-500 text-black font-bold">NEW</span>
          </button>
        </div>

        {/* Model Variants */}
        <div className={`grid gap-1 ${selectedFamily === 'kling' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => onModelSelect(opt.value)}
              className={`py-2 px-2.5 rounded-lg text-xs font-medium transition-all ${
                selectedModel === opt.value
                  ? selectedFamily === 'director'
                    ? 'bg-orange-600/20 backdrop-blur-sm text-orange-200 ring-1 ring-orange-400/50 shadow-[0_0_12px_rgba(249,115,22,0.15)]'
                    : 'bg-dash-600/25 backdrop-blur-sm text-dash-200 ring-1 ring-dash-400/50 shadow-[0_0_12px_rgba(34,197,94,0.15)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <span className="block leading-tight">
                {opt.label}
                {'badge' in opt && opt.badge && (
                  <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-orange-500 text-black font-bold align-middle">
                    {opt.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] opacity-60">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Kling Infinity/Ribbon Logo
const KlingIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <defs>
      <linearGradient id="kling-grad" x1="0" y1="12" x2="24" y2="12" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#34D399" />
        <stop offset="50%" stopColor="#22D3EE" />
        <stop offset="100%" stopColor="#3B82F6" />
      </linearGradient>
    </defs>
    <path
      d="M6 12c-2.2 0-4-1.8-4-4s1.8-4 4-4c1.5 0 2.8.8 3.5 2L12 9.5l2.5-3.5C15.2 4.8 16.5 4 18 4c2.2 0 4 1.8 4 4s-1.8 4-4 4c-1.5 0-2.8-.8-3.5-2L12 6.5 9.5 10c-.7 1.2-2 2-3.5 2zm0 0c-2.2 0-4 1.8-4 4s1.8 4 4 4c1.5 0 2.8-.8 3.5-2L12 14.5l2.5 3.5c.7 1.2 2 2 3.5 2 2.2 0 4-1.8 4-4s-1.8-4-4-4c-1.5 0-2.8.8-3.5 2L12 17.5 9.5 14c-.7-1.2-2-2-3.5-2z"
      stroke="url(#kling-grad)"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

// Google G Logo - 4-color
const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <path d="M43.6 20.5H42V20H24v8h11.3C33.6 33.5 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" fill="#FBBC05"/>
    <path d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" fill="#EA4335"/>
    <path d="M24 44c5.2 0 9.9-1.9 13.4-5.1l-6.2-5.2C29.2 35.2 26.7 36 24 36c-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.5 39.6 16.2 44 24 44z" fill="#34A853"/>
    <path d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l.1-.1 6.2 5.2C37 39.1 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" fill="#4285F4"/>
  </svg>
);

export default VideoModelSelector;
