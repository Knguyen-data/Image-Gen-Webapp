import React, { useState, useRef, useEffect } from 'react';
import { detectVideoDimensions, getVideoAspectRatioCSS } from '../utils/video-dimensions';

interface VideoTrimmerModalProps {
  isOpen: boolean;
  file: File | null;
  maxDuration: number;
  onConfirm: (trimmedFile: File, startTime: number, endTime: number) => void;
  onCancel: () => void;
}

const VideoTrimmerModal: React.FC<VideoTrimmerModalProps> = ({
  isOpen,
  file,
  maxDuration,
  onConfirm,
  onCancel
}) => {
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(maxDuration);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<string>('16/9');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load video when file changes
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  // Detect aspect ratio when video URL changes
  useEffect(() => {
    if (videoUrl) {
      detectVideoDimensions(videoUrl)
        .then(dims => {
          setAspectRatio(getVideoAspectRatioCSS(dims));
        })
        .catch(err => {
          console.warn('Failed to detect video dimensions in trimmer, using 16:9 fallback', err);
        });
    }
  }, [videoUrl]);

  // Set initial end time when duration loads
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setStartTime(0);
      setEndTime(Math.min(maxDuration, dur));
    }
  };

  // Update current time
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      // Stop at end time
      if (time >= endTime) {
        videoRef.current.pause();
        setIsPlaying(false);
        videoRef.current.currentTime = startTime;
      }
    }
  };

  // Play/Pause toggle
  const togglePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        // Ensure playback starts at start time
        if (currentTime < startTime || currentTime >= endTime) {
          videoRef.current.currentTime = startTime;
        }
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Handle slider change
  const handleStartChange = (value: number) => {
    const newStart = Math.min(value, endTime - 1);
    setStartTime(newStart);
    if (videoRef.current && !isPlaying) {
      videoRef.current.currentTime = newStart;
    }
  };

  const handleEndChange = (value: number) => {
    const newEnd = Math.max(value, startTime + 1);
    setEndTime(newEnd);
  };

  // Confirm trim
  const handleConfirm = () => {
    if (file) {
      // For now, pass the original file with trim metadata
      // In production, you'd use FFmpeg.wasm to actually trim the video
      onConfirm(file, startTime, endTime);
    }
  };

  const trimDuration = endTime - startTime;
  const isValid = trimDuration <= maxDuration && trimDuration > 0;

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">
            Video Too Long ({duration.toFixed(1)}s) - Max: {maxDuration}s
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Select a {maxDuration}s clip from your video
          </p>
        </div>

        {/* Video Player */}
        <div className="p-6 space-y-4">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio }}>
            <video
              ref={videoRef}
              src={videoUrl}
              className="w-full h-full object-contain"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Play/Pause Overlay */}
            <button
              onClick={togglePlayPause}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors group"
            >
              {!isPlaying && (
                <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <svg className="w-8 h-8 text-gray-900 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
            </button>
          </div>

          {/* Timeline */}
          <div className="space-y-3">
            <div className="relative h-12 bg-gray-800 rounded">
              {/* Progress bar */}
              <div
                className="absolute top-0 left-0 h-full bg-blue-600/30"
                style={{
                  left: `${(startTime / duration) * 100}%`,
                  width: `${((endTime - startTime) / duration) * 100}%`
                }}
              />

              {/* Current time indicator */}
              <div
                className="absolute top-0 w-0.5 h-full bg-white"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />

              {/* Time markers */}
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[10px] text-gray-500 font-mono">
                <span>0s</span>
                <span>{(duration / 4).toFixed(1)}s</span>
                <span>{(duration / 2).toFixed(1)}s</span>
                <span>{(3 * duration / 4).toFixed(1)}s</span>
                <span>{duration.toFixed(1)}s</span>
              </div>
            </div>

            {/* Start/End Controls */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-semibold">Start Time</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={startTime}
                    onChange={(e) => handleStartChange(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <input
                    type="number"
                    min={0}
                    max={endTime - 1}
                    step={0.1}
                    value={startTime.toFixed(1)}
                    onChange={(e) => handleStartChange(parseFloat(e.target.value))}
                    className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 font-mono"
                  />
                  <span className="text-xs text-gray-500">s</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-semibold">End Time</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={endTime}
                    onChange={(e) => handleEndChange(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <input
                    type="number"
                    min={startTime + 1}
                    max={duration}
                    step={0.1}
                    value={endTime.toFixed(1)}
                    onChange={(e) => handleEndChange(parseFloat(e.target.value))}
                    className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 font-mono"
                  />
                  <span className="text-xs text-gray-500">s</span>
                </div>
              </div>
            </div>

            {/* Duration Display */}
            <div className={`text-center p-3 rounded-lg ${
              isValid ? 'bg-green-900/20 border border-green-500/30' : 'bg-red-900/20 border border-red-500/30'
            }`}>
              <p className={`text-sm font-semibold ${isValid ? 'text-green-300' : 'text-red-300'}`}>
                Selected Duration: {trimDuration.toFixed(1)}s
              </p>
              {!isValid && (
                <p className="text-xs text-red-400 mt-1">
                  Duration must be ≤ {maxDuration}s
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-gray-700 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isValid}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use This Clip
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoTrimmerModal;
