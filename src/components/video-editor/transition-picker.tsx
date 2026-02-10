import React, { useRef, useEffect } from 'react';
import { TRANSITION_TYPES, TRANSITION_LABELS } from '../../services/video-editor-service';
import type { TransitionType } from '../../services/video-editor-service';

interface TransitionPickerProps {
  position: { x: number; y: number };
  currentType?: TransitionType;
  onSelect: (type: TransitionType) => void;
  onRemove: () => void;
  onClose: () => void;
}

const TransitionPicker: React.FC<TransitionPickerProps> = ({
  position,
  currentType,
  onSelect,
  onRemove,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[210] bg-gray-900/95 backdrop-blur-xl border border-dash-500/30 rounded-xl shadow-2xl shadow-black/50 p-2 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      <div className="text-xs text-gray-400 uppercase tracking-wider px-2 py-1 mb-1 font-semibold">
        Transition
      </div>
      {TRANSITION_TYPES.map((type) => (
        <button
          key={type}
          onClick={() => onSelect(type)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-150 flex items-center gap-2 ${
            currentType === type
              ? 'bg-dash-600/25 text-dash-300 shadow-[0_0_8px_rgba(163,255,0,0.1)]'
              : 'text-gray-300 hover:bg-gray-800/80 hover:text-white'
          }`}
        >
          <span className="text-xs">
            {currentType === type ? '✓' : '◇'}
          </span>
          {TRANSITION_LABELS[type]}
        </button>
      ))}
      {currentType && (
        <>
          <div className="border-t border-gray-700/50 my-1" />
          <button
            onClick={onRemove}
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-all duration-150 flex items-center gap-2"
          >
            <span className="text-xs">✕</span>
            Remove Transition
          </button>
        </>
      )}
    </div>
  );
};

export default TransitionPicker;
