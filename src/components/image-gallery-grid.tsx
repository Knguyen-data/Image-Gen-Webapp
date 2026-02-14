import React, { useState } from 'react';
import { Run, GeneratedImage } from '../types';
import ImageCard from './image-card';

interface ImageGalleryGridProps {
  runs: Run[];
  selectedImageIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (image: GeneratedImage) => void;
  onDeleteImage: (runId: string, imageId: string) => void;
  onDeleteRun: (runId: string) => void;
  onRetryImage: (image: GeneratedImage) => void;
  onModifyImage: (image: GeneratedImage) => void;
  onBatchDownload: (run: Run) => void;
  downloadingRunId: string | null;
}

export const ImageGalleryGrid: React.FC<ImageGalleryGridProps> = ({
  runs,
  selectedImageIds,
  onToggleSelect,
  onOpen,
  onDeleteImage,
  onDeleteRun,
  onRetryImage,
  onModifyImage,
  onBatchDownload,
  downloadingRunId,
}) => {
  if (runs.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-600">
        <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-lg font-medium">No images yet</p>
        <p className="text-sm mt-2 text-gray-500">Enter a prompt on the left to start</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 p-6">
      {runs.map((run, index) => {
        const runNumber = runs.length - index;
        return (
          <div key={run.id} className="animate-in slide-in-from-bottom-4 duration-500">
            {/* Run Header */}
            <div className="flex items-center justify-between mb-4 mt-2 py-2 border-b border-gray-800/50">
              <div className="flex items-baseline gap-3">
                <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                  {run.name.startsWith('Run #')
                    ? `Run #${runNumber}`
                    : run.name}
                </h3>
                <span className="text-xs text-gray-600 font-mono">
                  {new Date(run.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => onBatchDownload(run)}
                  disabled={downloadingRunId === run.id}
                  className="text-xs text-dash-300 hover:text-white transition-colors flex items-center gap-1"
                >
                  {downloadingRunId === run.id ? 'Zipping...' : 'Download Batch'}
                </button>
                <span className="text-gray-800">|</span>
                <button
                  onClick={() => onDeleteRun(run.id)}
                  className="text-xs text-red-900 hover:text-red-500 transition-colors"
                >
                  Delete Run
                </button>
              </div>
            </div>

            {/* Image Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {run.images.map(img => (
                <div
                  key={img.id}
                  style={{
                    contentVisibility: 'auto',
                    containIntrinsicSize: '0 300px',
                  }}
                >
                  <ImageCard
                    image={img}
                    selected={selectedImageIds.has(img.id)}
                    onToggleSelect={() => onToggleSelect(img.id)}
                    onOpen={() => onOpen(img)}
                    onDelete={() => onDeleteImage(run.id, img.id)}
                    onRetry={() => onRetryImage(img)}
                    onModify={() => onModifyImage(img)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ImageGalleryGrid;

