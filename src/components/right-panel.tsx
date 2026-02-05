import React, { useState } from 'react';
import { Run, GeneratedImage } from '../types';
import ImageCard from './image-card';
// @ts-ignore
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
}

const RightPanel: React.FC<RightPanelProps> = ({
  runs,
  onDeleteRun,
  onDeleteImage,
  onRetryImage,
  onModifyImage,
  isGenerating = false,
  isModifying = false,
  loadingStatus = ''
}) => {
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set());
  const [compareMode, setCompareMode] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<GeneratedImage | null>(null);
  const [downloadingRunId, setDownloadingRunId] = useState<string | null>(null);

  // Flatten all images for easy lookup
  const allImages = runs.flatMap(r => r.images.map(img => ({ ...img, runId: r.id })));

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
        <div className="absolute inset-0 z-50 bg-black/95 flex flex-col p-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-400 font-mono text-sm">{lightboxImage.id}</span>
            <button
              onClick={() => setLightboxImage(null)}
              className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <img
              src={`data:${lightboxImage.mimeType};base64,${lightboxImage.base64}`}
              className="max-w-full max-h-full object-contain shadow-2xl"
              alt="Full view"
            />
          </div>
          <div className="mt-4 p-4 bg-gray-900 rounded-lg max-h-32 overflow-y-auto">
            <p className="text-xs text-gray-400 font-mono mb-1">PROMPT USED:</p>
            <p className="text-sm text-gray-200">{lightboxImage.promptUsed}</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="h-16 border-b border-gray-800 flex items-center justify-between px-6 bg-gray-900/50 backdrop-blur-sm z-10 sticky top-0 relative">
        {/* Progress Bar */}
        {(isGenerating || isModifying) && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-gray-800 overflow-hidden">
            <div className="h-full w-1/3 bg-dash-300 animate-[progress_1.5s_ease-in-out_infinite]" />
          </div>
        )}

        {/* Status Badge */}
        {loadingStatus && (
          <div className="absolute top-2 right-6 flex items-center gap-2 text-xs">
            <div className="w-2 h-2 bg-dash-300 rounded-full animate-pulse" />
            <span className="text-gray-400 font-mono">{loadingStatus}</span>
          </div>
        )}

        <h2 className="font-semibold text-gray-200">Gallery <span className="text-gray-500 font-normal">({allImages.length} items)</span></h2>

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
      <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
        {runs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-600">
            <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <p>No generations yet.</p>
            <p className="text-sm mt-2">Enter a prompt on the left to start.</p>
          </div>
        ) : (
          <div className="space-y-12">
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

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;
