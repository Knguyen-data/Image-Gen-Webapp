import React, { useState, useEffect, useMemo } from 'react';
import { GeneratedVideo } from '../types';
import { getRIFECapability, type RIFECapability } from '../services/browser-capability-detector';

interface VideoCardProps {
  video: GeneratedVideo;
  onDownload: () => void;
  onDelete: () => void;
  onOpen?: () => void;
  onSaveAndReveal?: () => void;
  onInterpolate?: (videoId: string) => void;
  isInterpolating?: boolean;
  // Selection mode props
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (videoId: string) => void;
}

const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onDownload,
  onDelete,
  onOpen,
  onSaveAndReveal,
  onInterpolate,
  isInterpolating = false,
  selectable = false,
  selected = false,
  onSelect
}) => {
  // Check RIFE browser capability once on mount
  const rifeCapability = useMemo(() => getRIFECapability(), []);
  const rifeSupported = rifeCapability.supported;
  const rifeSlow = rifeCapability.estimatedSpeed === 'slow';

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`group relative overflow-hidden rounded-xl backdrop-blur-lg bg-white/10 dark:bg-gray-800/30 border border-white/20 hover:border-dash-500/50 transition-all duration-300 hover:scale-[1.02] ${selected ? 'border-emerald-500 ring-2 ring-emerald-500/50' : ''}`}>
      {/* Selection checkbox */}
      {selectable && (
        <div className="absolute top-2 left-2 z-20">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(video.id)}
            className="w-5 h-5 rounded border-2 border-gray-400 bg-gray-800 checked:bg-emerald-600 checked:border-emerald-600 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Fixed 9:16 aspect ratio container */}
      <div className="relative w-full aspect-[9/16] bg-gray-950 rounded overflow-hidden cursor-pointer">
        {video.status === 'generating' || video.status === 'pending' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800">
            <div className="absolute inset-0 backdrop-blur-xl bg-white/5" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="w-10 h-10 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-3" />
              <span className="text-xs text-gray-400 max-w-[80%] text-center truncate px-2">
                {video.status === 'pending' ? 'Queued...' : 'Generating video...'}
              </span>
            </div>
          </div>
        ) : video.status === 'failed' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 animate-pulse">
            <svg className="w-10 h-10 text-red-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-red-200">Failed</span>
            {video.error && <span className="text-[10px] text-red-300/70 mt-1 px-3 text-center">{video.error}</span>}
          </div>
        ) : (
          <>
            <video
              src={video.url}
              className="w-full h-full object-contain"
              poster={video.thumbnailUrl}
              preload="metadata"
            />
            {/* Play button overlay */}
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/30 transition-colors cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                if (onOpen) onOpen();
              }}
            >
              <button className="w-10 h-10 flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/30 rounded-full text-white shadow-lg shadow-black/20 hover:bg-white/30 transition-all duration-200">
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
            </div>
            {/* Timestamp */}
            <span className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white font-mono backdrop-blur-sm group-hover:opacity-0 transition-opacity z-10">
              {formatDuration(video.duration)}
            </span>
            {/* Provider badge */}
            {video.provider && (
              <span className={`absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded font-medium text-white z-10 ${video.provider === 'freepik' ? 'bg-indigo-500/80' : 'bg-dash-500/80'}`}>
                {video.provider === 'freepik' ? 'Freepik' : 'Kie.ai'}
              </span>
            )}
            {/* Interpolated badge */}
            {video.isInterpolated && (
              <span className="absolute top-1 right-1 text-[10px] px-1.5 py-0.5 rounded font-medium text-white bg-cyan-500/80 z-10">
                Smooth
              </span>
            )}
          </>
        )}

        {/* Hover Overlay with Actions */}
        {video.status === 'success' && (
          <div
            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpen) onOpen();
            }}
          >
            <div className="absolute bottom-12 right-3 bg-black/70 px-2 py-0.5 rounded text-xs text-white font-mono backdrop-blur-sm">
              {formatDuration(video.duration)}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(); }}
                className="p-2 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                title="Download Video"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              {onSaveAndReveal && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSaveAndReveal(); }}
                  className="p-2 bg-dash-700/80 hover:bg-dash-600/80 rounded-full text-white backdrop-blur-sm"
                  title="Save & Open in Explorer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                  </svg>
                </button>
              )}
              {/* Smooth Video (RIFE) button */}
              {onInterpolate && !video.isInterpolated && rifeSupported && (
                <button
                  onClick={(e) => { e.stopPropagation(); onInterpolate(video.id); }}
                  disabled={isInterpolating}
                  className="p-2 bg-cyan-600/80 hover:bg-cyan-500/80 rounded-full text-white backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  title={isInterpolating ? 'Interpolating...' : rifeSlow ? 'Smooth Video (RIFE AI) — May be slow on this browser' : 'Smooth Video (RIFE AI)'}
                >
                  {isInterpolating ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  )}
                </button>
              )}
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
      </div>

      {/* Compact Footer */}
      <div className="px-2 py-1.5 bg-gray-900 border-t border-gray-800 flex justify-between items-center gap-1">
        <p className="text-[10px] text-gray-500 font-mono truncate flex-1" title={video.prompt}>
          {video.prompt.substring(0, 40)}{video.prompt.length > 40 ? '...' : ''}
        </p>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-emerald-900/50 text-emerald-300 shrink-0">
          Video
        </span>
      </div>
    </div>
  );
};

export default React.memo(VideoCard);
