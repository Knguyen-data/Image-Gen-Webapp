import { useState, useCallback, useRef } from 'react';

export interface MentionOption {
  label: string;      // e.g. "@Video1"
  description: string; // e.g. "Reference video"
  icon?: string;       // e.g. "🎥"
}

export interface UseMentionAutocompleteReturn {
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  isOpen: boolean;
  options: MentionOption[];
  selectedIndex: number;
  position: { top: number; left: number };
  close: () => void;
  onSelect: (option: MentionOption) => void;
}

/**
 * Reusable hook for @ mention autocomplete in textareas.
 * Detects '@' typing, filters options, handles keyboard navigation,
 * and inserts selected mention text.
 */
export function useMentionAutocomplete(
  availableOptions: MentionOption[],
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
  setValue: (val: string) => void
): UseMentionAutocompleteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [filterText, setFilterText] = useState('');
  // Track the cursor position where '@' was typed
  const atStartRef = useRef<number>(-1);

  // Filter options based on text typed after '@'
  const filteredOptions = isOpen
    ? availableOptions.filter(opt =>
        opt.label.toLowerCase().startsWith('@' + filterText.toLowerCase())
      )
    : [];

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedIndex(0);
    setFilterText('');
    atStartRef.current = -1;
  }, []);

  // Calculate dropdown position from textarea cursor
  const updatePosition = useCallback((textarea: HTMLTextAreaElement) => {
    const rect = textarea.getBoundingClientRect();
    const style = window.getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    const paddingTop = parseFloat(style.paddingTop);
    const paddingLeft = parseFloat(style.paddingLeft);
    const fontSize = parseFloat(style.fontSize);

    // Get text up to cursor
    const textBeforeCursor = textarea.value.substring(0, textarea.selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLineIndex = lines.length - 1;
    const currentLineText = lines[currentLineIndex];

    // Estimate position
    const top = paddingTop + (currentLineIndex + 1) * lineHeight - textarea.scrollTop + 4;
    // Approximate left using character width (monospace assumption or average)
    const charWidth = fontSize * 0.55;
    const left = paddingLeft + currentLineText.length * charWidth;

    setPosition({
      top: Math.min(top, rect.height),
      left: Math.min(left, rect.width - 200),
    });
  }, []);

  const insertMention = useCallback((option: MentionOption) => {
    const textarea = textareaRef.current;
    if (!textarea || atStartRef.current < 0) return;

    const before = value.substring(0, atStartRef.current);
    const cursorPos = textarea.selectionStart;
    const after = value.substring(cursorPos);

    const newValue = before + option.label + ' ' + after;
    setValue(newValue);

    // Set cursor position after inserted text
    const newCursorPos = before.length + option.label.length + 1;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    });

    close();
  }, [value, setValue, textareaRef, close]);

  const onSelect = useCallback((option: MentionOption) => {
    insertMention(option);
  }, [insertMention]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || filteredOptions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      insertMention(filteredOptions[selectedIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }, [isOpen, filteredOptions, selectedIndex, insertMention, close]);

  const onChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Check if '@' was just typed or we're in an active mention
    if (!isOpen) {
      // Check if the character just typed is '@'
      const charBefore = cursorPos > 0 ? newValue[cursorPos - 1] : '';
      const charBeforeAt = cursorPos > 1 ? newValue[cursorPos - 2] : ' ';
      if (charBefore === '@' && (charBeforeAt === ' ' || charBeforeAt === '\n' || cursorPos === 1)) {
        if (availableOptions.length > 0) {
          setIsOpen(true);
          setSelectedIndex(0);
          setFilterText('');
          atStartRef.current = cursorPos - 1;
          updatePosition(e.target);
        }
      }
    } else {
      // We're in an active mention — update filter text
      const textAfterAt = newValue.substring(atStartRef.current + 1, cursorPos);

      // Close if space typed or cursor moved before '@'
      if (textAfterAt.includes(' ') || textAfterAt.includes('\n') || cursorPos <= atStartRef.current) {
        close();
      } else {
        setFilterText(textAfterAt);
        setSelectedIndex(0);
        updatePosition(e.target);
      }
    }
  }, [isOpen, availableOptions, close, updatePosition]);

  return {
    onKeyDown,
    onChange,
    isOpen: isOpen && filteredOptions.length > 0,
    options: filteredOptions,
    selectedIndex,
    position,
    close,
    onSelect,
  };
}
