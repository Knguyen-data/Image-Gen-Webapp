import React from 'react';
import { GeneratedImage } from '../../types';

interface LightboxProps {
  image: GeneratedImage | null;
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export const ImageLightbox: React.FC<LightboxProps> = ({
  image,
  onClose,
  onNext,
  onPrev,
  hasNext = false,
  hasPrev = false,
}) => {
  if (!image) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <span className="text-gray-400 font-mono text-sm">🖼️ {image.id}</span>
        <div className="flex items-center gap-2">
          {hasPrev && (
            <button
              onClick={onPrev}
              className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
              title="Previous image"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {hasNext && (
            <button
              onClick={onNext}
              className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
              title="Next image"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Image */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {image.base64 && (
          <img
            src={`data:${image.mimeType};base64,${image.base64}`}
            className="max-w-full max-h-full object-contain shadow-2xl"
            alt="Full view"
          />
        )}
      </div>

      {/* Prompt */}
      <div className="mt-4 p-4 bg-gray-900 rounded-lg max-h-32 overflow-y-auto">
        <p className="text-xs text-gray-400 font-mono mb-1">PROMPT USED:</p>
        <p className="text-sm text-gray-200">{image.promptUsed}</p>
      </div>
    </div>
  );
};

export default ImageLightbox;
