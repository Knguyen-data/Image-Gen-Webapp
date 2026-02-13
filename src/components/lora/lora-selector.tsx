import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Sparkles, Settings2, X } from 'lucide-react';
import type { LoraModel } from '../../types';
import { listUserLoras } from '../../services/lora-model-service';
import { supabase } from '../../services/supabase';

interface LoraSelectorProps {
  selectedLoraId?: string;
  loraWeight?: number;
  onLoraChange: (loraId: string | undefined) => void;
  onWeightChange: (weight: number) => void;
  onManageClick: () => void;
}

const LoraSelector: React.FC<LoraSelectorProps> = ({
  selectedLoraId,
  loraWeight = 0.8,
  onLoraChange,
  onWeightChange,
  onManageClick,
}) => {
  const [loras, setLoras] = useState<LoraModel[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user's ready LoRA models
  useEffect(() => {
    const fetchLoras = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const allLoras = await listUserLoras(user.id);
          setLoras(allLoras.filter(l => l.status === 'ready'));
        }
      } catch (err) {
        console.error('Failed to fetch LoRAs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLoras();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectedLora = loras.find(l => l.id === selectedLoraId);

  return (
    <div className="space-y-2">
      {/* Label row */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          LoRA Model
        </label>
        <button
          onClick={onManageClick}
          className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1"
        >
          <Settings2 className="w-3 h-3" />
          Manage
        </button>
      </div>

      {/* Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            selectedLoraId
              ? 'bg-violet-950/30 border-violet-700/50 text-zinc-100'
              : 'bg-zinc-900 border-zinc-700 text-zinc-400'
          } hover:border-zinc-600`}
        >
          <span className="truncate text-left flex-1">
            {loading ? (
              <span className="text-zinc-500">Loading…</span>
            ) : selectedLora ? (
              <span className="flex items-center gap-2">
                <span className="truncate">{selectedLora.name}</span>
                <span className="text-[10px] text-violet-400/70 font-mono shrink-0">
                  {selectedLora.trigger_word}
                </span>
              </span>
            ) : (
              'None (no LoRA)'
            )}
          </span>
          {selectedLoraId ? (
            <X
              className="w-3.5 h-3.5 text-zinc-500 hover:text-zinc-300 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onLoraChange(undefined);
              }}
            />
          ) : (
            <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          )}
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            {/* None option */}
            <button
              onClick={() => {
                onLoraChange(undefined);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 ${
                !selectedLoraId ? 'text-violet-400 bg-zinc-800/50' : 'text-zinc-400'
              }`}
            >
              None (no LoRA)
            </button>

            {loras.length === 0 && !loading && (
              <div className="px-3 py-3 text-xs text-zinc-500 text-center">
                No trained LoRA models yet.
                <button
                  onClick={() => {
                    setIsOpen(false);
                    onManageClick();
                  }}
                  className="block mx-auto mt-1 text-violet-400 hover:text-violet-300"
                >
                  Train your first LoRA →
                </button>
              </div>
            )}

            {loras.map((lora) => (
              <button
                key={lora.id}
                onClick={() => {
                  onLoraChange(lora.id);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-zinc-800 flex items-center justify-between gap-2 ${
                  selectedLoraId === lora.id ? 'text-violet-400 bg-zinc-800/50' : 'text-zinc-200'
                }`}
              >
                <span className="truncate">{lora.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                  {lora.trigger_word}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Weight slider — shown only when a LoRA is selected */}
      {selectedLoraId && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] text-zinc-500">LoRA Weight</label>
            <span className="text-[10px] font-mono text-violet-400">{loraWeight.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={loraWeight}
            onChange={(e) => onWeightChange(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500
              [&::-webkit-slider-thumb]:hover:bg-violet-400 [&::-webkit-slider-thumb]:transition-colors
              [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-violet-500 [&::-moz-range-thumb]:border-0"
          />
        </div>
      )}
    </div>
  );
};

export default LoraSelector;
