import React, { useRef, useState } from 'react';

interface EditorToolbarProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  timeDisplay: string;
  zoom: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAddTrack: () => void;
  onImportBroll: (files: FileList) => void;
  onImportUrl: (url: string) => void;
}

const EditorToolbar: React.FC<EditorToolbarProps> = ({
  playing,
  currentTime,
  duration,
  timeDisplay,
  zoom,
  onPlay,
  onPause,
  onSeek,
  onZoomIn,
  onZoomOut,
  onAddTrack,
  onImportBroll,
  onImportUrl,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    onSeek(percent * duration);
  };

  const handleUrlSubmit = () => {
    if (urlValue.trim()) {
      onImportUrl(urlValue.trim());
      setUrlValue('');
      setShowUrlInput(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-2 bg-gray-900/80 border-t border-b border-gray-800/50">
      {/* Scrubber */}
      <div
        className="w-full h-2 bg-gray-800 rounded-full cursor-pointer relative group"
        onClick={handleScrubberClick}
      >
        <div
          className="absolute inset-y-0 left-0 bg-dash-500/60 rounded-full transition-all duration-75"
          style={{ width: `${progressPercent}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-dash-400 rounded-full shadow-lg shadow-dash-400/30 transition-all duration-75 group-hover:scale-125"
          style={{ left: `calc(${progressPercent}% - 6px)` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between">
        {/* Left: playback controls */}
        <div className="flex items-center gap-2">
          {/* Play/Pause */}
          <button
            onClick={playing ? onPause : onPlay}
            className="w-9 h-9 rounded-xl bg-dash-600/20 hover:bg-dash-600/40 text-dash-300 flex items-center justify-center transition-all duration-200 border border-dash-500/20"
          >
            {playing ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <polygon points="6,4 20,12 6,20" />
              </svg>
            )}
          </button>

          {/* Skip to start */}
          <button
            onClick={() => onSeek(0)}
            className="w-7 h-7 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white flex items-center justify-center transition-all"
            title="Skip to start"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <rect x="4" y="5" width="3" height="14" rx="1" />
              <polygon points="9,12 19,5 19,19" />
            </svg>
          </button>

          {/* Time display */}
          <span className="text-xs text-gray-400 font-mono min-w-[120px]">
            <span className="text-dash-300">{formatTime(currentTime)}</span>
            <span className="text-gray-600"> / </span>
            <span>{formatTime(duration)}</span>
          </span>
        </div>

        {/* Center: zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={onZoomOut}
            className="w-6 h-6 rounded bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white flex items-center justify-center text-sm transition-all"
            title="Zoom out"
          >
            −
          </button>
          <span className="text-[10px] text-gray-500 font-mono min-w-[36px] text-center">
            {zoom}x
          </span>
          <button
            onClick={onZoomIn}
            className="w-6 h-6 rounded bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white flex items-center justify-center text-sm transition-all"
            title="Zoom in"
          >
            +
          </button>
        </div>

        {/* Right: add actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onAddTrack}
            className="px-3 py-1.5 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white text-xs transition-all border border-gray-700/30"
          >
            + Track
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-lg bg-blue-900/30 hover:bg-blue-800/40 text-blue-300 text-xs transition-all border border-blue-500/20"
          >
            📎 B-Roll
          </button>

          <button
            onClick={() => setShowUrlInput(!showUrlInput)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
              showUrlInput
                ? 'bg-dash-600/25 text-dash-300 border-dash-500/30'
                : 'bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 hover:text-white border-gray-700/30'
            }`}
          >
            🔗 URL
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onImportBroll(e.target.files)}
          />
        </div>
      </div>

      {/* URL input row */}
      {showUrlInput && (
        <div className="flex items-center gap-2 pb-1">
          <input
            type="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="Paste video URL..."
            className="flex-1 bg-gray-800/80 border border-gray-700/50 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-dash-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
            autoFocus
          />
          <button
            onClick={handleUrlSubmit}
            disabled={!urlValue.trim()}
            className="px-3 py-1.5 rounded-lg bg-dash-600/25 text-dash-300 text-xs transition-all border border-dash-500/20 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
};

export default EditorToolbar;
