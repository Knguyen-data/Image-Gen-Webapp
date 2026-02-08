import React from 'react';
import { GeneratedImage, AppMode, ReferenceImage } from '../types';

interface ImageCardProps {
  image: GeneratedImage;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRetry: () => void;
  onModify?: () => void;
  appMode?: AppMode;
}

const ImageCard: React.FC<ImageCardProps> = ({ image, selected, onToggleSelect, onOpen, onDelete, onRetry, onModify, appMode }) => {
  const isGenerating = !image.base64 || image.status === 'generating' || image.status === 'pending';
  const isFailed = image.status === 'failed';

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

  const handleDragStart = (e: React.DragEvent) => {
    if (appMode !== 'video') return;

    // Create ReferenceImage object from GeneratedImage
    const refImage: ReferenceImage = {
      id: image.id,
      base64: image.base64,
      mimeType: image.mimeType,
      previewUrl: `data:${image.mimeType};base64,${image.base64}`
    };

    e.dataTransfer.setData('application/json', JSON.stringify(refImage));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      className={`relative group rounded-xl overflow-hidden bg-gray-900 border transition-all duration-200 ${
        selected ? 'border-dash-300 ring-2 ring-dash-300/30' : 'border-gray-800 hover:border-gray-600'
      } ${appMode === 'video' ? 'cursor-move' : ''}`}
      draggable={appMode === 'video'}
      onDragStart={handleDragStart}
    >
      <div
        className="aspect-[3/4] cursor-pointer bg-gray-950 relative overflow-hidden"
        onClick={!isGenerating && !isFailed ? onOpen : undefined}
      >
        {/* Generating placeholder state */}
        {isGenerating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800">
            <div className="absolute inset-0 backdrop-blur-xl bg-white/5" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 border-2 border-dash-500/30 border-t-dash-500 rounded-full animate-spin mb-3" />
              <span className="text-xs text-gray-400 max-w-[80%] text-center truncate px-2">
                {image.promptUsed?.slice(0, 30)}{image.promptUsed?.length > 30 ? '...' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Failed state with error flash */}
        {isFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 animate-pulse">
            <svg className="w-10 h-10 text-red-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-red-200">Failed</span>
            {image.error && <span className="text-[10px] text-red-300/70 mt-1 px-2 text-center">{image.error}</span>}
          </div>
        )}

        {/* Actual image (only show when base64 exists and not generating/failed) */}
        {!isGenerating && !isFailed && (image.thumbnailBase64 || image.base64) && (
          <img
            src={image.thumbnailBase64
              ? `data:${image.thumbnailMimeType || 'image/jpeg'};base64,${image.thumbnailBase64}`
              : `data:${image.mimeType};base64,${image.base64}`}
            alt="Generated Output"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {/* Hover Overlay (only when image is loaded) */}
        {!isGenerating && !isFailed && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
           <div className="flex gap-1.5 justify-end flex-wrap">
              {/* In video mode: ONLY show delete button */}
              {appMode !== 'video' && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRetry(); }}
                    className="p-1.5 bg-emerald-600/80 hover:bg-emerald-500/80 rounded-full text-white backdrop-blur-sm"
                    title="Retry / Regenerate"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </button>
                  {onModify && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onModify(); }}
                      className="p-1.5 bg-emerald-700/80 hover:bg-emerald-600/80 rounded-full text-white backdrop-blur-sm"
                      title="Modify Image"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={downloadImage}
                    className="p-1.5 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                    title="Download PNG"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  </button>
                  <button
                    onClick={copyPrompt}
                    className="p-1.5 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                    title="Copy Prompt"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </button>
                </>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1.5 bg-red-900/80 hover:bg-red-600/80 rounded-full text-red-200 hover:text-white backdrop-blur-sm"
                title="Delete"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
           </div>
          </div>
        )}
      </div>

      {/* Select Checkbox (Hidden in video mode) */}
      {appMode !== 'video' && (
        <div className={`absolute top-2 left-2 z-10 ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          <div
            onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
            className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center ${
              selected ? 'bg-dash-300 border-dash-300' : 'bg-black/50 border-white/50 hover:bg-black/70'
            }`}
          >
            {selected && <svg className="w-2.5 h-2.5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
          </div>
        </div>
      )}

      <div className="p-1.5 bg-gray-900 border-t border-gray-800 flex justify-between items-center gap-1 overflow-hidden min-w-0">
        <p className="text-[10px] text-gray-500 font-mono truncate min-w-0 flex-1">
          {image.settingsSnapshot?.aspectRatio || '1:1'} • {new Date(image.createdAt).toLocaleTimeString()}
        </p>
        {image.generatedBy && (
          <span className={`text-[9px] px-1 py-0.5 rounded font-medium whitespace-nowrap flex-shrink-0 max-w-[40%] truncate ${
            image.generatedBy === 'gemini'
              ? 'bg-dash-900/50 text-dash-300'
              : 'bg-red-900/50 text-red-300'
          }`}>
            {image.generatedBy === 'gemini' ? 'Gemini' : '🌶️'}
          </span>
        )}
      </div>
    </div>
  );
};

export default ImageCard;
