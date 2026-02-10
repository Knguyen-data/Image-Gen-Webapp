import React, { useState, useEffect, useCallback } from 'react';
import { listStockCategories, listStockVideos, type StockCategory, type StockVideo } from '../../services/supabase-stock-service';
import { logger } from '../../services/logger';

interface StockGalleryProps {
  onSelectVideo: (video: { url: string; name: string; duration?: number }) => void;
  onClose: () => void;
}

// Predefined categories (should match folder names in Supabase storage)
const CATEGORIES = [
  { id: 'luxury', name: 'Luxury', icon: '💎' },
  { id: 'cars', name: 'Cars', icon: '🚗' },
  { id: 'yachts', name: 'Yachts', icon: '🛥️' },
  { id: 'planes', name: 'Planes', icon: '✈️' },
  { id: 'watches', name: 'Watches', icon: '⌚' },
  { id: 'property', name: 'Property', icon: '🏠' },
  { id: 'lifestyle', name: 'Lifestyle', icon: '✨' },
  { id: 'abstract', name: 'Abstract', icon: '🎨' },
  { id: 'nature', name: 'Nature', icon: '🌿' },
  { id: 'business', name: 'Business', icon: '💼' },
  { id: 'technology', name: 'Technology', icon: '💻' },
  { id: 'people', name: 'People', icon: '👥' },
  { id: 'urban', name: 'Urban', icon: '🌆' },
  { id: 'food', name: 'Food', icon: '🍽️' },
  { id: 'travel', name: 'Travel', icon: '🗺️' },
];

const StockGallery: React.FC<StockGalleryProps> = ({ onSelectVideo, onClose }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [videos, setVideos] = useState<StockVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [previewVideo, setPreviewVideo] = useState<StockVideo | null>(null);

  // Load videos when category changes
  const loadCategory = useCallback(async (categoryId: string) => {
    setLoading(true);
    setError(null);
    setLoadingMessage('Loading videos...');
    setVideos([]);

    try {
      const categoryPath = `stock/${categoryId}/`;
      const result = await listStockVideos(categoryPath);
      setVideos(result);
    } catch (err) {
      logger.error('StockGallery', 'Failed to load category', err);
      setError(err instanceof Error ? err.message : 'Failed to load videos');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      loadCategory(selectedCategory);
    }
  }, [selectedCategory, loadCategory]);

  const handleCategoryClick = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  const handleVideoSelect = (video: StockVideo) => {
    setPreviewVideo(video);
  };

  const handleConfirmSelect = () => {
    if (previewVideo) {
      onSelectVideo({
        url: previewVideo.url,
        name: previewVideo.name,
        duration: previewVideo.duration,
      });
    }
  };

  // Show categories grid when none selected
  if (!selectedCategory) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
          <h2 className="text-sm font-semibold text-dash-400 uppercase tracking-wider">
            📁 Stock Gallery
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.id)}
                className="aspect-[9/16] rounded-xl overflow-hidden bg-gray-800/50 border border-gray-700/30 hover:border-dash-500/40 transition-all group hover:scale-[1.02]"
              >
                <div className="flex flex-col items-center justify-center h-full p-4">
                  <span className="text-3xl mb-2">{cat.icon}</span>
                  <span className="text-xs text-gray-300 font-medium">{cat.name}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50 text-xs text-gray-500">
          {CATEGORIES.length} categories • Click to browse
        </div>
      </div>
    );
  }

  // Show videos in selected category
  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedCategory(null)}
            className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-sm font-semibold text-dash-400 uppercase tracking-wider">
            {CATEGORIES.find(c => c.id === selectedCategory)?.icon} {CATEGORIES.find(c => c.id === selectedCategory)?.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-dash-500/30 border-t-dash-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-400">{loadingMessage || 'Loading...'}</p>
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <span className="text-2xl mb-2">🎬</span>
            <p className="text-sm">No videos in this category yet</p>
            <p className="text-xs text-gray-600 mt-1">Upload videos to stock/{selectedCategory}/ in Supabase Storage</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {videos.map((video) => (
              <button
                key={video.id}
                onClick={() => handleVideoSelect(video)}
                className={`relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-800/50 border transition-all group hover:scale-[1.02] ${
                  previewVideo?.id === video.id
                    ? 'border-dash-400 ring-2 ring-dash-400/30'
                    : 'border-gray-700/30 hover:border-dash-500/40'
                }`}
              >
                {/* Thumbnail or placeholder */}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
                  {video.thumbnailUrl ? (
                    <img src={video.thumbnailUrl} alt={video.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">🎬</span>
                  )}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end p-2">
                  <p className="text-[10px] text-white text-center truncate w-full">{video.name}</p>
                  <span className="text-[9px] text-gray-400">{video.duration}s</span>
                </div>

                {/* Selection indicator */}
                {previewVideo?.id === video.id && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-dash-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer with actions */}
      <div className="px-4 py-3 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {videos.length} videos
        </span>
        <div className="flex gap-2">
          {previewVideo && (
            <button
              onClick={handleConfirmSelect}
              className="px-4 py-1.5 rounded-lg bg-dash-600/30 hover:bg-dash-500/40 text-dash-200 text-xs font-medium transition-colors"
            >
              + Add to Timeline
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockGallery;
