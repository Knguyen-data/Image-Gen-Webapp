import React, { useState, useEffect } from 'react';

interface BulkInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProcess: (prompts: string[]) => void;
}

const BulkInputModal: React.FC<BulkInputModalProps> = ({ isOpen, onClose, onProcess }) => {
  const [text, setText] = useState('');

  // Reset text when opened
  useEffect(() => {
    if (isOpen) setText('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleProcess = () => {
    // Split by new lines, filter empty whitespace
    // Supports splitting by single newline or double newline
    const lines = text
      .split(/\n+/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    onProcess(lines);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl flex flex-col shadow-2xl scale-100 animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-dash-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              Bulk Input Processor
            </h3>
            <p className="text-xs text-gray-500 mt-1">Paste your prompts below. Each line will become a separate card.</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex-1">
          <textarea
            autoFocus
            className="w-full h-80 bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-200 focus:ring-2 focus:ring-dash-300 focus:border-transparent outline-none font-mono leading-relaxed resize-none custom-scrollbar"
            placeholder={`Example:\nA futuristic city with neon lights\n\nA portrait of a cat in space\n\nAbstract geometric shapes in pastel colors`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-600 font-mono">
              Detected: {text.split(/\n+/).filter(t => t.trim().length > 0).length} prompts
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-800 bg-gray-900/50 rounded-b-xl flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProcess}
            disabled={!text.trim()}
            className="px-6 py-2 rounded-lg text-sm font-bold text-dash-900 bg-dash-300 hover:bg-dash-200 transition-all shadow-[0_0_15px_rgba(134,239,172,0.2)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Process Prompts
          </button>
        </div>

      </div>
    </div>
  );
};

export default BulkInputModal;
