import React, { useState, useRef, useEffect } from 'react';
import {
  enhancePrompt,
  EnhanceMode,
  PromptTarget,
} from '../services/prompt-enhance-service';

interface PromptEnhanceButtonProps {
  /** Current prompt text */
  prompt: string;
  /** Callback to set the enhanced prompt */
  onEnhance: (enhanced: string) => void;
  /** Target model family */
  target: PromptTarget;
  /** Gemini API key */
  apiKey: string;
  /** Optional reference image for visual context */
  referenceImage?: { base64: string; mimeType: string };
  /** Optional style notes */
  styleNotes?: string;
  /** Disable when generating */
  disabled?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  /** Additional class */
  className?: string;
}

const ENHANCE_MODES: { value: EnhanceMode; label: string; icon: string; desc: string }[] = [
  { value: 'enhance', label: 'Enhance', icon: '✨', desc: 'Add detail & optimize' },
  { value: 'expand', label: 'Expand', icon: '📐', desc: 'Expand short prompts' },
  { value: 'rewrite', label: 'Rewrite', icon: '🔄', desc: 'Fresh take, same idea' },
  { value: 'translate', label: 'Translate', icon: '🌐', desc: 'Any language → English' },
];

const TARGET_LABELS: Record<PromptTarget, string> = {
  'gemini-image': 'Gemini Image',
  'seedream': 'Seedream 4.5',
  'flux-dev': 'FLUX Dev',
  'kling-2.6': 'Kling 2.6',
  'kling-3': 'Kling 3',
  'kling-3-omni': 'Kling 3 Omni',
  'veo-3.1': 'Veo 3.1',
  'wan-2.2': 'Wan 2.2',
};

const PromptEnhanceButton: React.FC<PromptEnhanceButtonProps> = ({
  prompt,
  onEnhance,
  target,
  apiKey,
  referenceImage,
  styleNotes,
  disabled = false,
  size = 'sm',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOriginal, setLastOriginal] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleEnhance = async (mode: EnhanceMode) => {
    if (!prompt.trim()) {
      setError('Type a prompt first');
      setTimeout(() => setError(null), 2000);
      return;
    }
    if (!apiKey) {
      setError('Set Gemini API key first');
      setTimeout(() => setError(null), 2000);
      return;
    }

    setIsOpen(false);
    setIsEnhancing(true);
    setError(null);
    setLastOriginal(prompt);

    try {
      const result = await enhancePrompt(apiKey, {
        prompt,
        target,
        mode,
        referenceImage,
        styleNotes,
      });
      onEnhance(result.enhanced);
    } catch (err: any) {
      console.error('[PromptEnhance] Enhancement failed:', err);
      setError(err.message?.substring(0, 60) || 'Enhancement failed');
      setTimeout(() => setError(null), 4000);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleUndo = () => {
    if (lastOriginal !== null) {
      onEnhance(lastOriginal);
      setLastOriginal(null);
    }
  };

  const isSm = size === 'sm';

  return (
    <div className={`relative inline-flex items-center gap-1 ${className}`} ref={menuRef}>
      {/* Main enhance button */}
      <button
        onClick={() => isEnhancing ? null : setIsOpen(!isOpen)}
        disabled={disabled || isEnhancing || !prompt.trim()}
        className={`
          ${isSm ? 'text-[10px] px-2 py-1' : 'text-xs px-3 py-1.5'}
          rounded border transition-all flex items-center gap-1
          ${isEnhancing
            ? 'bg-purple-900/30 text-purple-300 border-purple-500/50 animate-pulse cursor-wait'
            : 'bg-purple-900/20 hover:bg-purple-900/40 text-purple-300 border-purple-700/50 hover:border-purple-500/50 active:scale-95'
          }
          disabled:opacity-40 disabled:cursor-not-allowed
        `}
        title={`Enhance prompt for ${TARGET_LABELS[target]}`}
      >
        {isEnhancing ? (
          <>
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Enhancing...
          </>
        ) : (
          <>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Enhance
          </>
        )}
      </button>

      {/* Undo button (appears after enhancement) */}
      {lastOriginal !== null && !isEnhancing && (
        <button
          onClick={handleUndo}
          className={`${isSm ? 'text-[10px] px-1.5 py-1' : 'text-xs px-2 py-1.5'} rounded border border-gray-700 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-all active:scale-95`}
          title="Undo enhancement"
        >
          ↩
        </button>
      )}

      {/* Error tooltip */}
      {error && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-red-900/90 border border-red-500/50 rounded-lg px-3 py-1.5 text-[10px] text-red-200 whitespace-nowrap shadow-lg">
          {error}
        </div>
      )}

      {/* Mode dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden min-w-[200px]">
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-800 bg-gray-950">
            <div className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">
              Enhance for {TARGET_LABELS[target]}
            </div>
            {referenceImage && (
              <div className="text-[9px] text-purple-400 mt-0.5 flex items-center gap-1">
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Visual context enabled
              </div>
            )}
          </div>

          {/* Mode options */}
          {ENHANCE_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => handleEnhance(m.value)}
              className="w-full px-3 py-2.5 text-left hover:bg-gray-800 transition-colors flex items-center gap-2.5 group"
            >
              <span className="text-sm">{m.icon}</span>
              <div>
                <div className="text-xs text-gray-200 font-medium group-hover:text-white">{m.label}</div>
                <div className="text-[10px] text-gray-500 group-hover:text-gray-400">{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default PromptEnhanceButton;
