import React from 'react';
import { MentionOption } from '../hooks/use-mention-autocomplete';

interface MentionDropdownProps {
  isOpen: boolean;
  options: MentionOption[];
  selectedIndex: number;
  position: { top: number; left: number };
  onSelect: (option: MentionOption) => void;
}

/**
 * Floating dropdown for @ mention autocomplete.
 * Renders anchored to textarea cursor position.
 */
const MentionDropdown: React.FC<MentionDropdownProps> = ({
  isOpen,
  options,
  selectedIndex,
  position,
  onSelect,
}) => {
  if (!isOpen || options.length === 0) return null;

  return (
    <div
      className="absolute z-50 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden"
      style={{
        top: position.top,
        left: Math.max(0, position.left),
        minWidth: '180px',
        maxWidth: '260px',
      }}
    >
      <div className="max-h-[200px] overflow-y-auto">
        {options.map((option, idx) => (
          <button
            key={option.label}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
              idx === selectedIndex
                ? 'bg-dash-700/30 text-dash-200'
                : 'text-gray-300 hover:bg-gray-700/50'
            }`}
            onMouseDown={(e) => {
              // Use mouseDown to fire before textarea blur
              e.preventDefault();
              onSelect(option);
            }}
          >
            {option.icon && <span className="text-sm shrink-0">{option.icon}</span>}
            <div className="min-w-0">
              <span className="font-medium block">{option.label}</span>
              <span className="text-[10px] text-gray-500 block truncate">{option.description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MentionDropdown;
