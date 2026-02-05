import React from 'react';
import { GeneratedImage } from '../types';

interface ImageCardProps {
  image: GeneratedImage;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onModify?: () => void;
}

const ImageCard: React.FC<ImageCardProps> = ({ image, selected, onToggleSelect, onOpen, onDelete, onRetry, onModify }) => {
  const downloadImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = `data:${image.mimeType};base64,${image.base64}`;
    link.download = `dash-gen-${image.id.slice(0, 8)}.png`;
    link.click();
  };

  const copyPrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(image.promptUsed);
  };

  return (
    <div
      className={`relative group rounded-xl overflow-hidden bg-gray-900 border transition-all duration-200 ${
        selected ? 'border-dash-300 ring-2 ring-dash-300/30' : 'border-gray-800 hover:border-gray-600'
      }`}
    >
      <div
        className="aspect-[3/4] cursor-pointer bg-gray-950 relative"
        onClick={onOpen}
      >
        <img
          src={`data:${image.mimeType};base64,${image.base64}`}
          alt="Generated Output"
          className="w-full h-full object-cover"
          loading="lazy"
        />

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
           <div className="flex gap-2 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="p-2 bg-indigo-600/80 hover:bg-indigo-500/80 rounded-full text-white backdrop-blur-sm"
                title="Retry / Regenerate"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              {onModify && (
                <button
                  onClick={(e) => { e.stopPropagation(); onModify(); }}
                  className="p-2 bg-purple-600/80 hover:bg-purple-500/80 rounded-full text-white backdrop-blur-sm"
                  title="Modify Image"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={downloadImage}
                className="p-2 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                title="Download PNG"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              <button
                onClick={copyPrompt}
                className="p-2 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                title="Copy Prompt"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-2 bg-red-900/80 hover:bg-red-600/80 rounded-full text-red-200 hover:text-white backdrop-blur-sm"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
           </div>
        </div>
      </div>

      {/* Select Checkbox (Always visible if selected, or on hover) */}
      <div className={`absolute top-3 left-3 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        <div
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          className={`w-5 h-5 rounded border cursor-pointer flex items-center justify-center ${
            selected ? 'bg-dash-300 border-dash-300' : 'bg-black/50 border-white/50 hover:bg-black/70'
          }`}
        >
          {selected && <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
        </div>
      </div>

      <div className="p-2 bg-gray-900 border-t border-gray-800">
        <p className="text-[10px] text-gray-500 font-mono truncate">{image.settingsSnapshot.aspectRatio} • {new Date(image.createdAt).toLocaleTimeString()}</p>
      </div>
    </div>
  );
};

export default ImageCard;
