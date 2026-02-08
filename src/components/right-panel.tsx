import React, { useState, useEffect } from 'react';
import { Run, GeneratedImage, AppMode, GeneratedVideo } from '../types';
import ImageCard from './image-card';
import VideoCard from './video-card';
import { saveAndRevealVideo } from '../services/video-file-service';
import { base64ToBlob, createObjectUrl, revokeObjectUrl, revokeAllObjectUrls } from '../services/image-blob-manager';
import JSZip from 'jszip';

interface RightPanelProps {
  runs: Run[];
  onDeleteRun: (id: string) => void;
  onDeleteImage: (runId: string, imgId: string) => void;
  onRetryImage: (image: GeneratedImage) => void;
  onModifyImage: (image: GeneratedImage) => void;
  isGenerating?: boolean;
  isModifying?: boolean;
  loadingStatus?: string;
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  // Video props
  generatedVideos?: GeneratedVideo[];
  onDeleteVideo?: (videoId: string) => void;
  onRetryVideo?: (video: GeneratedVideo) => void;
}

const RightPanel: React.FC<RightPanelProps> = ({
  runs,
  onDeleteRun,
  onDeleteImage,
  onRetryImage,
  onModifyImage,
  isGenerating = false,
  isModifying = false,
  loadingStatus = '',
  appMode,
  setAppMode,
  generatedVideos = [],
  onDeleteVideo = (_videoId: string) => {},
  onRetryVideo = (_video: GeneratedVideo) => {}
}) => {
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<GeneratedVideo | null>(null);
  const [lightboxObjectUrl, setLightboxObjectUrl] = useState<string | null>(null);
  const [lightboxAspectRatio, setLightboxAspectRatio] = useState<string>('4/3'); // Default aspect ratio
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);

  // Gallery collapse state (persisted)
  const [imagesCollapsed, setImagesCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem('raw_studio_images_collapsed');
    return saved === 'true';
  });

  // Gallery column count (persisted)
  const [columnCount, setColumnCount] = useState(() => {
    if (typeof window === 'undefined') return 5;
    const saved = localStorage.getItem('raw_studio_gallery_columns');
    const parsed = saved ? parseInt(saved, 10) : 5;
    return isNaN(parsed) ? 5 : Math.min(10, Math.max(5, parsed));
  });

  // Video column count (persisted)
  const [videoColumnCount, setVideoColumnCount] = useState(() => {
    if (typeof window === 'undefined') return 3;
    const saved = localStorage.getItem('raw_studio_video_columns');
    const parsed = saved ? parseInt(saved, 10) : 3;
    return isNaN(parsed) ? 3 : Math.min(8, Math.max(3, parsed));
  });

  // Persist collapse preference
  useEffect(() => {
    localStorage.setItem('raw_studio_images_collapsed', String(imagesCollapsed));
  }, [imagesCollapsed]);

  // Persist column preference
  useEffect(() => {
    localStorage.setItem('raw_studio_gallery_columns', String(columnCount));
  }, [columnCount]);

  // Persist video column preference
  useEffect(() => {
    localStorage.setItem('raw_studio_video_columns', String(videoColumnCount));
  }, [videoColumnCount]);

  // Detect aspect ratio when lightbox image changes
  useEffect(() => {
    if (!lightboxImage) {
      setLightboxAspectRatio('4/3');
      return;
    }

    const img = new Image();
    img.onload = () => {
      const aspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
      setLightboxAspectRatio(aspectRatio);
    };
    img.src = `data:${lightboxImage.mimeType};base64,${lightboxImage.base64}`;
  }, [lightboxImage]);

  // Create Object URL for lightbox to avoid inline base64 in DOM
  useEffect(() => {
    if (lightboxImage?.base64) {
      const blob = base64ToBlob(lightboxImage.base64, lightboxImage.mimeType);
      const url = createObjectUrl(blob);
      setLightboxObjectUrl(url);
      return () => {
        revokeObjectUrl(url);
        setLightboxObjectUrl(null);
      };
    }
    setLightboxObjectUrl(null);
  }, [lightboxImage]);

  // Cleanup all Object URLs on unmount
  useEffect(() => {
    return () => revokeAllObjectUrls();
  }, []);

  // Flatten all images for easy lookup (must be before keyboard handler useEffect)
  const allImages = runs.flatMap(r => r.images.map(img => ({ ...img, runId: r.id })));

  // Keyboard handler for lightbox (ESC + Arrow navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle image lightbox
      if (lightboxImage) {
        if (e.key === 'Escape') {
          setLightboxImage(null);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const currentIndex = allImages.findIndex(img => img.id === lightboxImage.id);
          if (currentIndex === -1 || allImages.length <= 1) return;
          const newIndex = e.key === 'ArrowLeft'
            ? (currentIndex - 1 + allImages.length) % allImages.length
            : (currentIndex + 1) % allImages.length;
          setLightboxImage(allImages[newIndex]);
        }
      }
      // Handle video lightbox
      if (lightboxVideo) {
        if (e.key === 'Escape') {
          setLightboxVideo(null);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          const successVideos = generatedVideos.filter(v => v.status === 'success');
          const currentIndex = successVideos.findIndex(v => v.id === lightboxVideo.id);
          if (currentIndex === -1 || successVideos.length <= 1) return;
          const newIndex = e.key === 'ArrowLeft'
            ? (currentIndex - 1 + successVideos.length) % successVideos.length
            : (currentIndex + 1) % successVideos.length;
          setLightboxVideo(successVideos[newIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage, lightboxVideo, allImages, generatedVideos]);

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedImageIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      if (newSet.size >= 4) {
        alert("Select max 4 images to compare");
        return;
      }
      newSet.add(id);
    }
    setSelectedImageIds(newSet);
  };

  const getSelectedImages = () => {
    return allImages.filter(img => selectedImageIds.has(img.id));
  };

  const handleBatchDownload = async (run: Run) => {
    if (downloadingRunId) return;
    setDownloadingRunId(run.id);

    try {
      const zip = new JSZip();
      const folder = zip.folder(run.name.replace(/\s+/g, '_') || 'images');

      run.images.forEach((img, index) => {
        const filename = `image_${index + 1}_${img.id.slice(0, 6)}.png`;
        folder.file(filename, img.base64, { base64: true });
      });

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${run.name.replace(/\s+/g, '_')}_${run.images.length}files.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (e) {
      console.error("Zip error", e);
      alert("Failed to create zip file");
    } finally {
      setDownloadingRunId(null);
    }
  };

  const handleDownloadVideo = async (video: GeneratedVideo) => {
    try {
      const response = await fetch(video.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video_${video.id.slice(0, 8)}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Video download error", e);
      alert("Failed to download video");
    }
  };

  const handleSaveAndRevealVideo = async (video: GeneratedVideo) => {
    try {
      await saveAndRevealVideo(video.url);
    } catch (e) {
      console.error("Save & reveal error", e);
      alert("Failed to save and reveal video: " + (e as Error).message);
    }
  };

  if (compareMode) {
    const imagesToCompare = getSelectedImages();
    return (
      <div className="flex flex-col h-full bg-black">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900">
          <h2 className="text-lg font-bold text-white">Compare Mode ({imagesToCompare.length})</h2>
          <button
            onClick={() => setCompareMode(false)}
            className="text-sm px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-200"
          >
            Close Comparison
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <div className={`grid h-full gap-4 ${imagesToCompare.length === 2 ? 'grid-cols-2' :
              imagesToCompare.length === 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-2'
            }`}>
            {imagesToCompare.map(img => (
              <div key={img.id} className="relative w-full h-full min-h-[400px] border border-gray-800 rounded-lg overflow-hidden bg-gray-950 flex items-center justify-center">
                <img
                  src={`data:${img.mimeType};base64,${img.base64}`}
                  className="max-w-full max-h-full object-contain"
                  alt="comparison"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-black/70 p-2 text-xs font-mono text-gray-300">
                  {img.settingsSnapshot.aspectRatio} | T:{img.settingsSnapshot.temperature} | Size:{img.settingsSnapshot.imageSize}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-950 w-full overflow-hidden relative">
      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          className="absolute inset-0 z-50 bg-black/95 flex flex-col p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxImage(null);
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-400 font-mono text-sm">{lightboxImage.id}</span>
            <div className="flex items-center gap-2">
              {/* Arrow navigation (only if >1 image) */}
              {allImages.length > 1 && (
                <>
                  <button
                    onClick={() => {
                      const currentIndex = allImages.findIndex(img => img.id === lightboxImage.id);
                      const newIndex = (currentIndex - 1 + allImages.length) % allImages.length;
                      setLightboxImage(allImages[newIndex]);
                    }}
                    className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
                    title="Previous image"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      const currentIndex = allImages.findIndex(img => img.id === lightboxImage.id);
                      const newIndex = (currentIndex + 1) % allImages.length;
                      setLightboxImage(allImages[newIndex]);
                    }}
                    className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
                    title="Next image"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
              <button
                onClick={() => setLightboxImage(null)}
                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxObjectUrl || ''}
              className="max-w-full max-h-full object-contain shadow-2xl"
              alt="Full view"
            />
          </div>
          <div className="mt-4 p-4 bg-gray-900 rounded-lg max-h-32 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-gray-400 font-mono mb-1">PROMPT USED:</p>
            <p className="text-sm text-gray-200">{lightboxImage.promptUsed}</p>
          </div>
        </div>
      )}

      {/* Video Lightbox Modal */}
      {lightboxVideo && (
        <div
          className="absolute inset-0 z-50 bg-black/95 flex flex-col p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLightboxVideo(null);
          }}
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-400 font-mono text-sm">🎬 {lightboxVideo.id}</span>
            <div className="flex items-center gap-2">
              {/* Download button */}
              <button
                onClick={() => handleDownloadVideo(lightboxVideo)}
                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
                title="Download video"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
              {/* Arrow navigation (only if >1 video) */}
              {generatedVideos.filter(v => v.status === 'success').length > 1 && (
                <>
                  <button
                    onClick={() => {
                      const successVideos = generatedVideos.filter(v => v.status === 'success');
                      const currentIndex = successVideos.findIndex(v => v.id === lightboxVideo.id);
                      const newIndex = (currentIndex - 1 + successVideos.length) % successVideos.length;
                      setLightboxVideo(successVideos[newIndex]);
                    }}
                    className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
                    title="Previous video"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      const successVideos = generatedVideos.filter(v => v.status === 'success');
                      const currentIndex = successVideos.findIndex(v => v.id === lightboxVideo.id);
                      const newIndex = (currentIndex + 1) % successVideos.length;
                      setLightboxVideo(successVideos[newIndex]);
                    }}
                    className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
                    title="Next video"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
              <button
                onClick={() => setLightboxVideo(null)}
                className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <video
              src={lightboxVideo.url}
              className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
              controls
              autoPlay
            />
          </div>
          <div className="mt-4 p-4 bg-gray-900 rounded-lg max-h-32 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs text-gray-400 font-mono mb-1">MOTION PROMPT:</p>
            <p className="text-sm text-gray-200">{lightboxVideo.prompt}</p>
            {lightboxVideo.duration > 0 && (
              <p className="text-xs text-gray-500 mt-2">Duration: {Math.floor(lightboxVideo.duration / 60)}:{(lightboxVideo.duration % 60).toString().padStart(2, '0')}</p>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/50 backdrop-blur-sm z-30 sticky top-0 relative">
        {/* Progress Bar */}
        {(isGenerating || isModifying) && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-800 overflow-hidden">
            <div className="h-full w-1/3 bg-dash-300 animate-[progress_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-gray-200">
            {appMode === 'video' ? (
              <>
                <span className="text-dash-400">Video</span> Gallery
                <span className="text-gray-500 font-normal ml-2">
                  ({allImages.length} images, {generatedVideos.length} videos)
                </span>
              </>
            ) : (
              <>
                <span className="text-dash-300">Image</span> Gallery
                <span className="text-gray-500 font-normal ml-2">
                  ({allImages.length})
                </span>
              </>
            )}
          </h2>

          {/* Mode Toggle */}
          <div className="flex bg-gray-800 rounded-lg p-1 ml-2">
            <button
              className={`px-3 py-1 rounded text-sm transition-all ${appMode === 'image' ? 'bg-dash-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              onClick={() => setAppMode('image')}
              title="Image Mode"
            >
              🖼️
            </button>
            <button
              className={`px-3 py-1 rounded text-sm transition-all ${appMode === 'video' ? 'bg-dash-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
              onClick={() => setAppMode('video')}
              title="Video Mode"
            >
              🎬
            </button>
          </div>
        </div>

        {selectedImageIds.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-dash-200">{selectedImageIds.size} selected</span>
            <button
              onClick={() => setCompareMode(true)}
              disabled={selectedImageIds.size < 2}
              className="px-3 py-1.5 bg-dash-900 text-dash-100 hover:bg-dash-800 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Compare
            </button>
            <button
              onClick={() => setSelectedImageIds(new Set())}
              className="px-3 py-1.5 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded text-sm"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto scroll-smooth">
        {appMode === 'video' ? (
          // VIDEO MODE: 50/50 Split Layout
          <div className="h-full flex flex-col">
            {/* IMAGES SECTION - Top 50% (for drag-drop source) */}
            <div className={`${imagesCollapsed ? 'flex-none' : 'flex-1'} border-b border-gray-800 ${imagesCollapsed ? 'overflow-hidden' : 'overflow-y-auto'} transition-all duration-200`}>
              <div className="sticky top-0 w-full bg-gray-900/95 backdrop-blur px-6 py-3 border-b border-gray-700/50 z-20">
                {/* Top row: Title + Collapse toggle + Column slider */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setImagesCollapsed(!imagesCollapsed)}
                    className="flex items-center gap-2 hover:bg-gray-800/50 rounded px-2 py-1 -ml-2 transition-colors"
                    aria-expanded={!imagesCollapsed}
                    aria-controls="images-grid"
                  >
                    <h3 className="text-sm font-semibold text-gray-300">
                      📸 Images <span className="text-gray-500 font-normal">({allImages.length})</span>
                    </h3>
                    <svg
                      className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${imagesCollapsed ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>

                  {/* Column slider - only when expanded */}
                  {!imagesCollapsed && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Cols:</label>
                      <input
                        type="range"
                        min={5}
                        max={10}
                        value={columnCount}
                        onChange={(e) => setColumnCount(parseInt(e.target.value, 10))}
                        className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs text-gray-400 font-mono w-4 text-center">{columnCount}</span>
                    </div>
                  )}
                </div>

                {/* Subtitle - only when expanded */}
                {!imagesCollapsed && (
                  <p className="text-xs text-gray-500 mt-0.5">Drag to scene queue →</p>
                )}
              </div>

              {!imagesCollapsed && (
                <>
                  {allImages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 p-6">
                      <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p className="text-sm font-medium">No images yet</p>
                      <p className="text-xs mt-1 text-gray-500">Generate images in image mode first</p>
                    </div>
                  ) : (
                    <div
                      id="images-grid"
                      className="grid gap-6 p-6 transition-all duration-200"
                      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
                    >
                      {allImages.map((img) => (
                        <ImageCard
                          key={img.id}
                          image={img}
                          onRetry={onRetryImage}
                          onDelete={() => onDeleteImage(img.runId, img.id)}
                          appMode={appMode}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* VIDEOS SECTION - Bottom 50% (results) */}
            <div className="flex-1 overflow-y-auto">
              <div className="sticky top-0 bg-gray-900/95 backdrop-blur px-6 py-3 border-b border-gray-700/50 z-20">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-dash-400">
                    🎬 Videos <span className="text-gray-500 font-normal">({generatedVideos.length})</span>
                  </h3>

                  {/* Video column slider */}
                  {generatedVideos.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Size:</label>
                      <input
                        type="range"
                        min={3}
                        max={8}
                        value={videoColumnCount}
                        onChange={(e) => setVideoColumnCount(parseInt(e.target.value, 10))}
                        className="w-16 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-dash-500"
                      />
                      <span className="text-xs text-gray-400 font-mono w-4 text-center">{videoColumnCount}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">Generated results</p>
              </div>

              {generatedVideos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-600 p-6">
                  <svg className="w-12 h-12 mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm font-medium">No videos yet</p>
                  <p className="text-xs mt-1 text-gray-500">Drag images to scene queue and generate</p>
                </div>
              ) : (
                <div
                  className="grid gap-4 p-6"
                  style={{ gridTemplateColumns: `repeat(${videoColumnCount}, minmax(0, 1fr))` }}
                >
                  {generatedVideos.map((video) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      onDownload={() => handleDownloadVideo(video)}
                      onDelete={() => onDeleteVideo(video.id)}
                      onOpen={() => setLightboxVideo(video)}
                      onSaveAndReveal={() => handleSaveAndRevealVideo(video)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          // IMAGE MODE: Show only images (unchanged)
          runs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-600">
              <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-medium">No images yet</p>
              <p className="text-sm mt-2 text-gray-500">Enter a prompt on the left to start</p>
            </div>
          ) : (
            <div className="space-y-12 p-6">
              {runs.map((run) => (
                <div key={run.id} className="animate-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between mb-4 mt-2 py-2 border-b border-gray-800/50">
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                        {run.name.startsWith('Run #')
                          ? `Run #${runs.length - runs.indexOf(run)}`
                          : run.name}
                      </h3>
                      <span className="text-xs text-gray-600 font-mono">{new Date(run.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleBatchDownload(run)}
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

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {run.images.map(img => (
                      <ImageCard
                        key={img.id}
                        image={img}
                        selected={selectedImageIds.has(img.id)}
                        onToggleSelect={() => handleToggleSelect(img.id)}
                        onOpen={() => setLightboxImage(img)}
                        onDelete={() => onDeleteImage(run.id, img.id)}
                        onRetry={() => onRetryImage(img)}
                        onModify={() => onModifyImage(img)}
                        appMode={appMode}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default RightPanel;
