import React, { useState, useEffect, useCallback } from 'react';
import { DriveFile, searchVideos, listFolderContents, getStreamingUrl } from '../services/google-drive-stock-service';
import { uploadBlobToStorage } from '../services/supabase-storage-service';
import { logger } from '../logger';

interface StockGalleryProps {
  onSelectVideo: (video: { url: string; name: string; duration?: number }) => void;
  onClose: () => void;
}

// Video categories for the luxury stock footage
const CATEGORIES = [
  { id: 'luxury', name: 'Luxury', icon: '💎', color: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30' },
  { id: 'cars', name: 'Cars', icon: '🚗', color: 'from-red-500/20 to-orange-500/20 border-red-500/30' },
  { id: 'yachts', name: 'Yachts', icon: '🛥️', color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30' },
  { id: 'planes', name: 'Planes', icon: '✈️', color: 'from-sky-500/20 to-indigo-500/20 border-sky-500/30' },
  { id: 'watches', name: 'Watches', icon: '⌚', color: 'from-zinc-500/20 to-gray-500/20 border-zinc-500/30' },
  { id: 'property', name: 'Property', icon: '🏠', color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30' },
  { id: 'lifestyle', name: 'Lifestyle', icon: '✨', color: 'from-purple-500/20 to-pink-500/20 border-purple-500/30' },
  { id: 'abstract', name: 'Abstract', icon: '🎨', color: 'from-violet-500/20 to-fuchsia-500/20 border-violet-500/30' },
];

const StockGallery: React.FC<StockGalleryProps> = ({ onSelectVideo, onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [videos, setVideos] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderId, setFolderId] = useState('');
  const [isConfigured, setIsConfigured] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  // Check if Google Drive is configured
  useEffect(() => {
    const apiKey = localStorage.getItem('google_drive_api_key');
    const folder = localStorage.getItem('google_drive_stock_folder_id');
    if (apiKey && folder) {
      setFolderId(folder);
      setIsConfigured(true);
    }
  }, []);

  // Load videos when category or search changes
  const loadVideos = useCallback(async () => {
    if (!isConfigured || !folderId) return;

    setLoading(true);
    setError(null);

    try {
      let results: DriveFile[] = [];

      if (searchQuery.trim()) {
        // Search mode
        results = await searchVideos(searchQuery, folderId);
      } else if (selectedCategory) {
        // Category mode - search by category name
        results = await searchVideos(selectedCategory, folderId);
      } else {
        // List folder contents
        const data = await listFolderContents(folderId);
        results = data.files;
      }

      setVideos(results);
    } catch (err) {
      logger.error('StockGallery', 'Failed to load videos', err);
      setError('Failed to load videos from Google Drive. Check your API key and folder ID.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, selectedCategory, folderId, isConfigured]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  const handleSaveConfig = () => {
    localStorage.setItem('google_drive_stock_folder_id', folderId);
    setIsConfigured(true);
  };

  const handlePreview = async (file: DriveFile) => {
    setPreviewing(file.id);
    try {
      const url = await getStreamingUrl(file.id);
      onSelectVideo({ url, name: file.name });
    } catch (err) {
      logger.error('StockGallery', 'Preview failed', err);
    } finally {
      setPreviewing(null);
    }
  };

  const handleImportToTimeline = async (file: DriveFile) => {
    setImporting(file.id);
    try {
      // Get streaming URL for direct playback
      const url = await getStreamingUrl(file.id);
      
      // For timeline, we can use the streaming URL directly
      // If offline access is needed later, we can cache it
      onSelectVideo({ url, name: file.name });
    } catch (err) {
      logger.error('StockGallery', 'Import failed', err);
      setError('Failed to import video. Try previewing first.');
    } finally {
      setImporting(null);
    }
  };

  // Configuration screen
  if (!isConfigured) {
    return (
      <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center">
        <div className="w-full max-w-md p-6 rounded-2xl bg-gray-900/90 border border-dash-500/30 backdrop-blur-xl">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span>📁</span> Connect Google Drive
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">
                Folder ID or Shared Drive Link
              </label>
              <input
                type="text"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                placeholder="Paste folder ID or shared drive URL"
                className="w-full px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700/50 text-white placeholder-gray-500 focus:border-dash-500/50 focus:outline-none transition-colors"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Get this from the folder URL: folder/ID/edit → copy the long ID string
              </p>
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wider">
                API Key (optional for public folders)
              </label>
              <input
                type="password"
                placeholder="Google API key with Drive API enabled"
                className="w-full px-4 py-2 rounded-lg bg-gray-800/50 border border-gray-700/50 text-white placeholder-gray-500 focus:border-dash-500/50 focus:outline-none transition-colors"
                onChange={(e) => localStorage.setItem('google_drive_api_key', e.target.value)}
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Required for private folders. For public shared folders, leave empty.
              </p>
            </div>

            <button
              onClick={handleSaveConfig}
              disabled={!folderId.trim()}
              className="w-full py-2.5 rounded-xl bg-dash-600/30 hover:bg-dash-500/40 border border-dash-400/30 text-dash-200 font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Connect Folder
            </button>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-dash-400 uppercase tracking-wider">
            📁 Stock Gallery
          </h2>
          <button
            onClick={() => {
              setIsConfigured(false);
              localStorage.removeItem('google_drive_stock_folder_id');
            }}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Change folder
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search videos..."
              className="w-48 px-3 py-1.5 pr-8 rounded-lg bg-gray-800/50 border border-gray-700/50 text-white text-sm placeholder-gray-500 focus:border-dash-500/50 focus:outline-none transition-colors"
            />
            <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
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
      </div>

      {/* Categories */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-800/50 overflow-x-auto">
        <button
          onClick={() => { setSelectedCategory(null); setSearchQuery(''); }}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
            !selectedCategory && !searchQuery
              ? 'bg-dash-600/25 text-dash-300 border border-dash-500/30'
              : 'bg-gray-800/40 text-gray-400 border border-gray-700/30 hover:border-gray-600/50'
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setSelectedCategory(cat.id); setSearchQuery(''); }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
              selectedCategory === cat.id
                ? `bg-gradient-to-r ${cat.color} text-white border`
                : 'bg-gray-800/40 text-gray-400 border border-gray-700/30 hover:border-gray-600/50'
            }`}
          >
            {cat.icon} {cat.name}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-dash-500/30 border-t-dash-500 rounded-full animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-500">
            <span className="text-2xl mb-2">🎬</span>
            <p className="text-sm">No videos found</p>
            <p className="text-xs text-gray-600">Try a different search or category</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {videos.map((file) => (
              <div
                key={file.id}
                className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-800/50 border border-gray-700/30 hover:border-dash-500/40 transition-all"
              >
                {/* Thumbnail */}
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50">
                  {file.thumbnailUrl ? (
                    <img
                      src={file.thumbnailUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl">🎬</span>
                  )}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-end p-2">
                  <p className="text-[10px] text-white text-center truncate w-full mb-2">
                    {file.name}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handlePreview(file)}
                      disabled={previewing === file.id}
                      className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[10px] transition-colors"
                    >
                      {previewing === file.id ? '⏳' : '▶ Preview'}
                    </button>
                    <button
                      onClick={() => handleImportToTimeline(file)}
                      disabled={importing === file.id}
                      className="px-2 py-1 rounded-lg bg-dash-600/60 hover:bg-dash-500/60 text-white text-[10px] transition-colors"
                    >
                      {importing === file.id ? '⏳' : '+ Add'}
                    </button>
                  </div>
                </div>

                {/* Duration badge (if available) */}
                {file.size > 0 && (
                  <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white font-mono">
                    {(file.size / 1024 / 1024).toFixed(1)}MB
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50 flex items-center justify-between text-xs text-gray-500">
        <span>{videos.length} videos loaded</span>
        <span>Powered by Google Drive</span>
      </div>
    </div>
  );
};

export default StockGallery;
