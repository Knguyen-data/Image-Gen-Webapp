import React, { useState, useEffect } from 'react';
import { GeneratedVideo } from '../types';
import { detectVideoDimensions, getVideoAspectRatioCSS } from '../utils/video-dimensions';

interface VideoCardProps {
  video: GeneratedVideo;
  onDownload: () => void;
  onRetry: () => void;
  onDelete: () => void;
  onOpen?: () => void;
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onDownload, onRetry, onDelete, onOpen }) => {
  const [aspectRatio, setAspectRatio] = useState<string>('16/9'); // default fallback

  useEffect(() => {
    if (video.url) {
      detectVideoDimensions(video.url)
        .then(dims => {
          setAspectRatio(getVideoAspectRatioCSS(dims));
        })
        .catch(err => {
          console.warn('Failed to detect video dimensions, using 16:9 fallback', err);
        });
    }
  }, [video.url]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const copyPrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(video.prompt);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-600 transition-all duration-200">
      <div className="relative w-full bg-gray-950 rounded overflow-hidden cursor-pointer" style={{ aspectRatio }}>
        {video.status === 'generating' || video.status === 'pending' ? (
          <div className="flex flex-col items-center justify-center h-full">
            <div className="w-12 h-12 border-4 border-dash-300 border-t-transparent rounded-full animate-spin mb-3"></div>
            <span className="text-sm text-gray-400">
              {video.status === 'pending' ? 'Queued...' : 'Generating video...'}
            </span>
          </div>
        ) : video.status === 'failed' ? (
          <div className="flex flex-col items-center justify-center h-full text-red-400">
            <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">Failed</span>
            {video.error && <span className="text-xs text-gray-500 mt-1 px-4 text-center">{video.error}</span>}
          </div>
        ) : (
          <>
            <video
              src={video.url}
              className="w-full h-full object-contain"
              poster={video.thumbnailUrl}
              preload="metadata"
            />
            {/* Play button overlay - click opens lightbox */}
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
            {/* Timestamp - shown when NOT hovering (hides on hover since overlay has its own) */}
            <span className="absolute bottom-2 right-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white font-mono backdrop-blur-sm group-hover:opacity-0 transition-opacity z-10">
              {formatDuration(video.duration)}
            </span>
          </>
        )}

        {/* Hover Overlay with Actions - clicking anywhere opens lightbox, buttons have stopPropagation */}
        {video.status === 'success' && (
          <div
            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (onOpen) onOpen();
            }}
          >
            {/* Timestamp shown on hover - fixed at bottom right above buttons */}
            <div className="absolute bottom-12 right-3 bg-black/70 px-2 py-0.5 rounded text-xs text-white font-mono backdrop-blur-sm">
              {formatDuration(video.duration)}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={(e) => { e.stopPropagation(); onRetry(); }}
                className="p-2 bg-indigo-600/80 hover:bg-indigo-500/80 rounded-full text-white backdrop-blur-sm"
                title="Retry / Regenerate"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(); }}
                className="p-2 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                title="Download Video"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              <button
                onClick={copyPrompt}
                className="p-2 bg-gray-800/80 hover:bg-white/20 rounded-full text-white backdrop-blur-sm"
                title="Copy Prompt"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
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
      </div>

      {/* Footer */}
      <div className="p-2 bg-gray-900 border-t border-gray-800 flex justify-between items-center">
        <p className="text-[10px] text-gray-500 font-mono truncate flex-1 mr-2" title={video.prompt}>
          {video.prompt.substring(0, 50)}{video.prompt.length > 50 ? '...' : ''}
        </p>
        <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-purple-900/50 text-purple-300">
          🎬 Video
        </span>
      </div>
    </div>
  );
};

export default VideoCard;
