import React from 'react';
import { AppSettings, PromptItem } from '../../types';

interface HelperPanelsProps {
  prompts: PromptItem[];
  settings: AppSettings;
}

export const HelperPanels: React.FC<HelperPanelsProps> = ({ prompts, settings }) => {
  const activePrompt = prompts[0];
  const promptText = activePrompt?.text || '';
  
  // Calculate stats
  const promptLength = promptText.length;
  const estimatedTokens = Math.ceil(promptLength / 4); // Rough estimate: 4 chars per token
  const aspectRatio = settings.aspectRatio || '1:1';
  const imageSize = settings.imageSize || '1K';
  const temperature = settings.temperature || 1.0;

  return (
    <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700/50">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-semibold text-lime-400 uppercase tracking-wider">
          Helper Panels
        </span>
      </div>

      {/* Stats Grid - Bigger and clearer */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {/* Prompt Length */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 min-w-[100px]">Prompt length:</span>
          <span className="text-gray-200 font-mono">
            {promptLength} chars, {estimatedTokens} tokens
          </span>
        </div>

        {/* Aspect Ratio */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 min-w-[100px]">Aspect ratio:</span>
          <span className="text-gray-200 font-mono">{aspectRatio}</span>
        </div>

        {/* Image Size */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 min-w-[100px]">Image size:</span>
          <span className="text-gray-200 font-mono">{imageSize}</span>
        </div>

        {/* Temperature */}
        <div className="flex items-center gap-2">
          <span className="text-gray-500 min-w-[100px]">Temperature:</span>
          <span className="text-gray-200 font-mono">{temperature.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
};

export default HelperPanels;
