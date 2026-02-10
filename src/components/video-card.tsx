import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GeneratedVideo } from '../types';
import { getRIFECapability, type RIFECapability } from '../services/browser-capability-detector';
import { applyVfxEffect } from '../services/freepik-vfx-service';
import { VFX_FILTERS, VFX_FPS_OPTIONS, type VfxFilterType, type VfxApplyOptions, type VfxFps } from '../types/vfx';

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

  // VFX state
  const [showVfxPanel, setShowVfxPanel] = useState(false);
  const [vfxSelectedFilter, setVfxSelectedFilter] = useState<VfxFilterType>(1);
  const [vfxFps, setVfxFps] = useState<VfxFps>(48);
  const [vfxBloomContrast, setVfxBloomContrast] = useState(0.5);
  const [vfxMotionKernel, setVfxMotionKernel] = useState(5);
  const [vfxMotionDecay, setVfxMotionDecay] = useState(0.5);
  const [vfxProcessing, setVfxProcessing] = useState(false);
  const [vfxProgress, setVfxProgress] = useState('');
  const [vfxResultUrl, setVfxResultUrl] = useState<string | null>(null);
  const [vfxError, setVfxError] = useState<string | null>(null);
  const vfxPanelRef = useRef<HTMLDivElement>(null);

  // Close VFX panel when clicking outside
  useEffect(() => {
    if (!showVfxPanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (vfxPanelRef.current && !vfxPanelRef.current.contains(e.target as Node)) {
        setShowVfxPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVfxPanel]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleApplyVfx = async () => {
    if (!video.url) return;

    setVfxProcessing(true);
    setVfxError(null);
    setVfxProgress('Starting…');

    const options: VfxApplyOptions = {
      filter_type: vfxSelectedFilter,
      fps: vfxFps,
    };

    // Add filter-specific params
    if (vfxSelectedFilter === 7) {
      options.bloom_filter_contrast = vfxBloomContrast;
    }
    if (vfxSelectedFilter === 2) {
      options.motion_filter_kernel_size = vfxMotionKernel;
      options.motion_filter_decay_factor = vfxMotionDecay;
    }

    try {
      const result = await applyVfxEffect(video.url, options, (status) => {
        setVfxProgress(status);
      });

      if (result.success && result.videoUrl) {
        setVfxResultUrl(result.videoUrl);
        setShowVfxPanel(false);
      } else {
        setVfxError(result.error || 'VFX processing failed');
      }
    } catch (err) {
      setVfxError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setVfxProcessing(false);
    }
  };

  const selectedFilterInfo = VFX_FILTERS.find(f => f.id === vfxSelectedFilter);

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
              src={vfxResultUrl || video.url}
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
            {/* VFX result badge */}
            {vfxResultUrl && (
              <span className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 rounded font-medium text-white bg-purple-500/80 z-10">
                🎬 VFX
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
              {/* VFX Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVfxPanel(prev => !prev);
                }}
                disabled={vfxProcessing}
                className="p-2 bg-purple-600/80 hover:bg-purple-500/80 rounded-full text-white backdrop-blur-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={vfxProcessing ? 'Processing VFX…' : 'Apply VFX Filter'}
              >
                {vfxProcessing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="text-sm leading-none">🎬</span>
                )}
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

        {/* VFX Panel (popover) */}
        {showVfxPanel && video.status === 'success' && (
          <div
            ref={vfxPanelRef}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-[90%] max-h-[90%] overflow-y-auto rounded-xl bg-gray-900/95 backdrop-blur-xl border border-dash-500/30 p-3 shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-bold text-dash-400 uppercase tracking-wider">VFX Filters</h4>
                <button
                  onClick={() => setShowVfxPanel(false)}
                  className="text-gray-500 hover:text-white text-lg leading-none"
                >
                  ×
                </button>
              </div>

              {/* Filter Grid */}
              <div className="grid grid-cols-4 gap-1.5 mb-3">
                {VFX_FILTERS.map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setVfxSelectedFilter(filter.id)}
                    className={`flex flex-col items-center p-1.5 rounded-lg text-center transition-all duration-150 ${
                      vfxSelectedFilter === filter.id
                        ? 'bg-dash-600/25 backdrop-blur-sm border border-dash-500/50 ring-1 ring-dash-500/30'
                        : 'bg-gray-800/50 border border-gray-700/50 hover:border-gray-600/70'
                    }`}
                    title={filter.description}
                  >
                    <span className="text-base leading-none">{filter.icon}</span>
                    <span className="text-[8px] text-gray-400 mt-0.5 leading-tight truncate w-full">{filter.name}</span>
                  </button>
                ))}
              </div>

              {/* FPS Selector */}
              <div className="mb-3">
                <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1 block">FPS</label>
                <div className="flex gap-1.5">
                  {VFX_FPS_OPTIONS.map(fps => (
                    <button
                      key={fps}
                      onClick={() => setVfxFps(fps)}
                      className={`flex-1 py-1 rounded text-[11px] font-mono transition-all ${
                        vfxFps === fps
                          ? 'bg-dash-600/30 text-dash-400 border border-dash-500/50'
                          : 'bg-gray-800/50 text-gray-500 border border-gray-700/50 hover:text-gray-300'
                      }`}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter-specific controls */}
              {vfxSelectedFilter === 7 && (
                <div className="mb-3">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1 flex justify-between">
                    <span>Bloom Contrast</span>
                    <span className="text-dash-400 font-mono">{vfxBloomContrast.toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={vfxBloomContrast}
                    onChange={(e) => setVfxBloomContrast(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-full appearance-none bg-gray-700 accent-dash-500"
                  />
                </div>
              )}

              {vfxSelectedFilter === 2 && (
                <div className="space-y-2 mb-3">
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1 flex justify-between">
                      <span>Kernel Size</span>
                      <span className="text-dash-400 font-mono">{vfxMotionKernel}</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      step="2"
                      value={vfxMotionKernel}
                      onChange={(e) => setVfxMotionKernel(parseInt(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-gray-700 accent-dash-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 uppercase tracking-wider font-medium mb-1 flex justify-between">
                      <span>Decay Factor</span>
                      <span className="text-dash-400 font-mono">{vfxMotionDecay.toFixed(2)}</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={vfxMotionDecay}
                      onChange={(e) => setVfxMotionDecay(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-gray-700 accent-dash-500"
                    />
                  </div>
                </div>
              )}

              {/* Error display */}
              {vfxError && (
                <div className="mb-2 p-2 rounded-lg bg-red-900/30 border border-red-500/30 text-[10px] text-red-300">
                  {vfxError}
                </div>
              )}

              {/* Progress */}
              {vfxProcessing && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-dash-500/30 border-t-dash-500 rounded-full animate-spin shrink-0" />
                  <span className="text-[10px] text-gray-400 truncate">{vfxProgress}</span>
                </div>
              )}

              {/* Apply Button */}
              <button
                onClick={handleApplyVfx}
                disabled={vfxProcessing}
                className="w-full py-2 rounded-lg bg-dash-600/80 hover:bg-dash-500/80 text-white text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {vfxProcessing ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    {selectedFilterInfo?.icon} Apply {selectedFilterInfo?.name}
                  </>
                )}
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
