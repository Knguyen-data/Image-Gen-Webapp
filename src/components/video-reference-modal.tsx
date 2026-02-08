import React, { useState, useRef, useEffect, useCallback } from 'react';
import { extractFrames, ExtractedFrame } from '../services/ffmpeg-frame-extractor';
import { ReferenceImage } from '../types';

interface VideoReferenceModalProps {
  isOpen: boolean;
  file: File | null;
  onConfirm: (images: ReferenceImage[]) => void;
  onCancel: () => void;
}

const CLIP_DURATION = 3; // Fixed 3-second clip window

const VideoReferenceModal: React.FC<VideoReferenceModalProps> = ({
  isOpen,
  file,
  onConfirm,
  onCancel,
}) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Extraction state
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState('');
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);

  // Load video object URL
  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setExtractedFrames([]);
      setSelectedFrameIndex(0);
      setError('');
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const endTime = Math.min(startTime + CLIP_DURATION, duration);
  const clipLen = endTime - startTime;

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const dur = videoRef.current.duration;
      setDuration(dur);
      setStartTime(0);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);
      if (time >= endTime) {
        videoRef.current.pause();
        setIsPlaying(false);
        videoRef.current.currentTime = startTime;
      }
    }
  };

  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      if (currentTime < startTime || currentTime >= endTime) {
        videoRef.current.currentTime = startTime;
      }
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleStartChange = (value: number) => {
    const maxStart = Math.max(0, duration - CLIP_DURATION);
    const newStart = Math.min(Math.max(0, value), maxStart);
    setStartTime(newStart);
    if (videoRef.current && !isPlaying) {
      videoRef.current.currentTime = newStart;
    }
    // Clear previously extracted frames when window moves
    setExtractedFrames([]);
  };

  // Extract frames using FFmpeg WASM
  const handleExtract = useCallback(async () => {
    if (!file) return;
    setIsExtracting(true);
    setError('');
    setExtractedFrames([]);
    try {
      const frames = await extractFrames(file, startTime, clipLen, setExtractProgress);
      setExtractedFrames(frames);
      setSelectedFrameIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Frame extraction failed');
    } finally {
      setIsExtracting(false);
      setExtractProgress('');
    }
  }, [file, startTime, clipLen]);

  // Confirm: convert selected frames to ReferenceImages
  const handleConfirm = () => {
    // Reorder: put selected frame first, then the rest
    const reordered = [
      extractedFrames[selectedFrameIndex],
      ...extractedFrames.filter((_, i) => i !== selectedFrameIndex),
    ];
    const images: ReferenceImage[] = reordered.map((frame) => ({
      id: crypto.randomUUID(),
      base64: frame.base64,
      mimeType: frame.mimeType,
      previewUrl: frame.previewUrl,
    }));
    onConfirm(images);
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">
            Extract Reference Frames
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Select a {CLIP_DURATION}s window, then extract {CLIP_DURATION} frames (1 per second)
          </p>
        </div>

        <div className="p-6 space-y-4">
          {/* Video Player */}
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              src={videoUrl || undefined}
              className="w-full h-full object-contain"
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => {
                setError('Video failed to load. Please try a different file.');
              }}
            />
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

          {/* Timeline with 3s window */}
          <div className="space-y-3">
            <div className="relative h-12 bg-gray-800 rounded overflow-hidden">
              {/* Selected 3s window */}
              <div
                className="absolute top-0 h-full bg-dash-600/30 border-x-2 border-dash-400"
                style={{
                  left: `${(startTime / (duration || 1)) * 100}%`,
                  width: `${(clipLen / (duration || 1)) * 100}%`,
                }}
              />
              {/* Current time indicator */}
              <div
                className="absolute top-0 w-0.5 h-full bg-white"
                style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
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

            {/* Start time slider */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-gray-400 font-semibold w-20 shrink-0">Clip Start</label>
              <input
                type="range"
                min={0}
                max={Math.max(0, duration - CLIP_DURATION)}
                step={0.1}
                value={startTime}
                onChange={(e) => handleStartChange(parseFloat(e.target.value))}
                className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-500"
              />
              <span className="text-sm text-gray-300 font-mono w-24 text-right">
                {startTime.toFixed(1)}s – {endTime.toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Extract Button */}
          <button
            onClick={handleExtract}
            disabled={isExtracting || duration === 0}
            className="w-full py-3 bg-dash-700 hover:bg-dash-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isExtracting ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {extractProgress || 'Extracting...'}
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Extract {CLIP_DURATION} Frames
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Extracted Frame Previews */}
          {extractedFrames.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 font-semibold">
                Click a frame to set it as primary reference (first sent to AI)
              </p>
              <div className="flex gap-3 justify-center">
                {extractedFrames.map((frame, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedFrameIndex(i)}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                      i === selectedFrameIndex
                        ? 'border-dash-400 ring-2 ring-dash-400/50 scale-105'
                        : 'border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <img
                      src={frame.previewUrl}
                      alt={`Frame ${i + 1}`}
                      className="w-36 h-24 object-cover"
                    />
                    <div className="absolute bottom-0 inset-x-0 bg-black/70 py-1 text-center">
                      <span className="text-[10px] font-mono text-gray-300">
                        {frame.timestamp.toFixed(1)}s
                        {i === selectedFrameIndex && ' (primary)'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
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
            disabled={extractedFrames.length === 0}
            className="px-6 py-2 bg-dash-700 hover:bg-dash-600 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Use {extractedFrames.length} Frame{extractedFrames.length !== 1 ? 's' : ''} as Reference
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoReferenceModal;
