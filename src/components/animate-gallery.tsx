/**
 * Animate Gallery - Right panel gallery for Wan 2.2 Animate output videos
 * Reuses VideoCard pattern for consistent UI.
 */

import React, { useState } from 'react';
import { AnimateJob } from '../types';
import { detectVideoDimensions, getVideoAspectRatioCSS } from '../utils/video-dimensions';

const formatDate = (ts: number): string => {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

interface AnimateGalleryProps {
  jobs: AnimateJob[];
  onDelete: (jobId: string) => void;
  onRetry: (job: AnimateJob) => void;
}

const AnimateGallery: React.FC<AnimateGalleryProps> = ({ jobs, onDelete, onRetry }) => {
  const [lightboxJob, setLightboxJob] = useState<AnimateJob | null>(null);

  const handleDownload = async (job: AnimateJob) => {
    if (!job.resultVideoUrl) return;
    try {
      const res = await fetch(job.resultVideoUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `animate-${job.subMode}-${job.id.slice(0, 8)}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(job.resultVideoUrl, '_blank');
    }
  };

  if (jobs.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-600 px-8">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <p className="text-sm font-medium text-gray-500">No animated videos yet</p>
        <p className="text-xs text-gray-600 mt-1">Upload a character image and reference video to start</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 p-4">
        {jobs.map(job => (
          <AnimateVideoCard
            key={job.id}
            job={job}
            onDownload={() => handleDownload(job)}
            onRetry={() => onRetry(job)}
            onDelete={() => onDelete(job.id)}
            onOpen={() => setLightboxJob(job)}
          />
        ))}
      </div>

      {/* Lightbox */}
      {lightboxJob && lightboxJob.resultVideoUrl && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxJob(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-gray-800/80 hover:bg-gray-700 rounded-full text-white z-10"
            onClick={() => setLightboxJob(null)}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <video
            src={lightboxJob.resultVideoUrl}
            className="max-w-full max-h-full rounded-lg"
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

// Individual card for an animate job
const AnimateVideoCard: React.FC<{
  job: AnimateJob;
  onDownload: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onOpen: () => void;
}> = ({ job, onDownload, onRetry, onDelete, onOpen }) => {
  const [aspectRatio, setAspectRatio] = useState('16/9');

  React.useEffect(() => {
    if (job.resultVideoUrl) {
      detectVideoDimensions(job.resultVideoUrl)
        .then(dims => setAspectRatio(getVideoAspectRatioCSS(dims)))
        .catch(() => {});
    }
  }, [job.resultVideoUrl]);

  return (
    <div className="relative group rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-600 transition-all duration-200">
      <div className="relative w-full bg-gray-950 rounded overflow-hidden cursor-pointer" style={{ aspectRatio }}>
        {job.status === 'pending' || job.status === 'generating' ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mb-3" />
            <span className="text-sm text-gray-400">
              {job.status === 'pending' ? 'Queued...' : 'Generating...'}
            </span>
          </div>
        ) : job.status === 'failed' ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">Failed</span>
            {job.error && <span className="text-xs text-gray-500 mt-1 px-4 text-center">{job.error}</span>}
          </div>
        ) : (
          <>
            <video
              src={job.resultVideoUrl}
              className="w-full h-full object-contain"
              preload="metadata"
            />
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/30 transition-colors cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onOpen(); }}
            >
              <button className="w-10 h-10 flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white shadow-lg shadow-black/20 hover:bg-white/30 transition-all duration-200">
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* Hover overlay with actions */}
        {job.status === 'success' && (
          <div
            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
          >
            <div className="flex gap-2 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="p-2 bg-indigo-600/80 hover:bg-indigo-500/80 rounded-full text-white backdrop-blur-sm"
                title="Retry"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(); }}
                className="p-2 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                title="Download"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-2 bg-red-900/80 hover:bg-red-600/80 rounded-full text-red-200 hover:text-white backdrop-blur-sm"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Failed overlay with retry */}
        {job.status === 'failed' && (
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); onRetry(); }}
              className="px-4 py-2 bg-indigo-600/90 hover:bg-indigo-500 rounded-lg text-white text-sm font-medium backdrop-blur-sm"
            >
              Retry
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 bg-gray-900 border-t border-gray-800 flex justify-between items-center">
        <span className="text-[10px] text-gray-500 font-mono">{formatDate(job.createdAt)}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
          job.subMode === 'move'
            ? 'bg-purple-900/50 text-purple-300'
            : 'bg-pink-900/50 text-pink-300'
        }`}>
          {job.subMode === 'move' ? '🎭 Move' : '🔄 Replace'}
        </span>
      </div>
    </div>
  );
};

export default AnimateGallery;
