import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Grid, CellComponentProps } from 'react-window';
import {
  listStockCategories,
  listStockVideos,
  searchStockVideos,
  getMoodCounts,
  getSceneTypeCounts,
  StockCategory,
  StockVideo
} from '../../services/supabase-stock-service';
import {
  getCachedThumbnail,
  generateThumbnail
} from '../../services/thumbnail-cache-service';
import { logger } from '../../services/logger';

interface StockGalleryProps {
  onSelectVideo: (video: { url: string; name: string; duration?: number }) => void;
  onClose?: () => void;
  /** Display mode: 'overlay' = fixed fullscreen modal, 'inline' = flows with parent */
  mode?: 'overlay' | 'inline';
}

/** Skeleton placeholder for thumbnails */
function ThumbnailSkeleton() {
  return (
    <div className="w-full h-full bg-gray-800/80 animate-pulse flex items-center justify-center">
      <div className="w-8 h-8 rounded-lg bg-gray-700/50" />
    </div>
  );
}

/** 
 * Lazy-loading thumbnail with IntersectionObserver and IndexedDB caching.
 * Only generates thumbnails when visible, caches them for reuse.
 */
function LazyVideoThumbnail({
  src,
  alt,
  onDurationExtracted
}: {
  src: string;
  alt: string;
  onDurationExtracted?: (duration: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' } // Start loading 100px before visible
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load thumbnail when visible
  useEffect(() => {
    if (!isVisible) return;

    let cleanup: (() => void) | undefined;

    const loadThumbnail = async () => {
      // Check cache first
      const cached = await getCachedThumbnail(src);
      if (cached) {
        setThumbnailUrl(cached.dataUrl);
        setLoading(false);
        if (cached.duration > 0 && onDurationExtracted) {
          onDurationExtracted(cached.duration);
        }
        return;
      }

      // Generate thumbnail
      cleanup = generateThumbnail(
        src,
        (dataUrl, duration) => {
          setThumbnailUrl(dataUrl);
          setLoading(false);
          if (duration > 0 && onDurationExtracted) {
            onDurationExtracted(duration);
          }
        },
        () => {
          setError(true);
          setLoading(false);
        }
      );
    };

    loadThumbnail();

    return () => {
      if (cleanup) cleanup();
    };
  }, [isVisible, src, onDurationExtracted]);

  return (
    <div ref={containerRef} className="w-full h-full">
      {error ? (
        <div className="w-full h-full flex items-center justify-center bg-gray-900/80">
          <span className="text-3xl">🎬</span>
        </div>
      ) : loading || !thumbnailUrl ? (
        <ThumbnailSkeleton />
      ) : (
        <img
          src={thumbnailUrl}
          alt={alt}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
    </div>
  );
}

/** Hover video preview - plays first 3 seconds on hover */
function HoverVideoPreview({ src, isHovered }: { src: string; isHovered: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHovered) {
      video.currentTime = 0;
      video.play().catch(() => { });

      // Stop after 3 seconds
      const timeout = setTimeout(() => {
        video.pause();
        video.currentTime = 0;
      }, 3000);

      return () => clearTimeout(timeout);
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isHovered]);

  if (!isHovered) return null;

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      crossOrigin="anonymous"
      className="absolute inset-0 w-full h-full object-cover z-10"
    />
  );
}

/** Props passed to VideoGridCell via cellProps */
interface VideoGridCellProps {
  videos: StockVideo[];
  videoDurations: Record<string, number>;
  hoveredVideoId: string | null;
  columnCount: number;
  isSearchMode: boolean;
  onPreview: (video: StockVideo, index: number) => void;
  onAdd: (video: StockVideo) => void;
  onHover: (id: string | null) => void;
  onDurationExtracted: (id: string, duration: number) => void;
}

/** Virtual grid cell component for react-window v2 */
function VideoGridCell({
  columnIndex,
  rowIndex,
  style,
  ...cellProps
}: CellComponentProps<VideoGridCellProps>) {
  const {
    videos,
    videoDurations,
    hoveredVideoId,
    columnCount,
    isSearchMode,
    onPreview,
    onAdd,
    onHover,
    onDurationExtracted
  } = cellProps;

  const videoIndex = rowIndex * columnCount + columnIndex;
  if (videoIndex >= videos.length) return null;

  const video = videos[videoIndex];
  const extractedDuration = videoDurations[video.id];
  const displayDuration = extractedDuration || video.duration;

  return (
    <div
      style={{
        ...style,
        left: Number(style.left) + (columnIndex > 0 ? CARD_GAP * columnIndex : 0),
        top: Number(style.top),
        width: Number(style.width) - (columnIndex < columnCount - 1 ? CARD_GAP / 2 : 0),
        height: CARD_HEIGHT,
      }}
    >
      <div
        className="group relative w-full h-full rounded-xl overflow-hidden bg-gray-800/50 border border-gray-700/30 hover:border-dash-500/40 hover:ring-2 hover:ring-dash-500/20 transition-all cursor-pointer"
        onClick={() => onPreview(video, videoIndex)}
        onMouseEnter={() => onHover(video.id)}
        onMouseLeave={() => onHover(null)}
      >
        {/* Lazy Thumbnail with caching */}
        <div className="absolute inset-0">
          <LazyVideoThumbnail
            src={video.url}
            alt={video.name}
            onDurationExtracted={(d) => onDurationExtracted(video.id, d)}
          />
        </div>

        {/* Hover video preview - plays first 3 seconds */}
        <HoverVideoPreview src={video.url} isHovered={hoveredVideoId === video.id} />

        {/* Category badge (in search mode) */}
        {isSearchMode && video.category && (
          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-dash-500/30 text-[9px] text-dash-300 font-medium backdrop-blur-sm">
            {video.category}
          </span>
        )}

        {/* Mood badge */}
        {video.mood && (
          <span
            className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-purple-500/30 text-[9px] text-purple-300 font-medium backdrop-blur-sm"
            style={isSearchMode && video.category ? { left: 'auto', right: '4px' } : {}}
          >
            {video.mood}
          </span>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
          <p className="text-[10px] text-white truncate w-full mb-1.5">{video.name}</p>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(video, videoIndex); }}
              className="px-2 py-1 rounded-md bg-white/20 hover:bg-white/30 text-white text-[10px] transition-colors"
            >
              ▶ Preview
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(video); }}
              className="px-2 py-1 rounded-md bg-dash-600/60 hover:bg-dash-600/80 text-white text-[10px] transition-colors"
            >
              + Add
            </button>
          </div>
        </div>

        {/* Size badge */}
        {video.size > 0 && (
          <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white font-mono">
            {(video.size / 1024 / 1024).toFixed(1)}MB
          </span>
        )}
        {/* Duration badge - use extracted or original */}
        {displayDuration > 0 && (
          <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] text-white font-mono">
            {displayDuration}s
          </span>
        )}
      </div>
    </div>
  );
}

/** Mood icon mapping */
function getMoodIcon(mood: string): string {
  const icons: Record<string, string> = {
    elegant: '✨',
    energetic: '⚡',
    calm: '🌿',
    dramatic: '🎭',
    romantic: '💕',
    mysterious: '🌙',
    playful: '🎈',
    cinematic: '🎬',
  };
  return icons[mood.toLowerCase()] || '🎨';
}

/** Sort options type */
type SortOption = { label: string; sortBy: 'name' | 'size' | 'date'; sortDir: 'asc' | 'desc' };

const SORT_OPTIONS: SortOption[] = [
  { label: 'Name A→Z', sortBy: 'name', sortDir: 'asc' },
  { label: 'Name Z→A', sortBy: 'name', sortDir: 'desc' },
  { label: 'Size ↑', sortBy: 'size', sortDir: 'asc' },
  { label: 'Size ↓', sortBy: 'size', sortDir: 'desc' },
  { label: 'Newest', sortBy: 'date', sortDir: 'desc' },
  { label: 'Oldest', sortBy: 'date', sortDir: 'asc' },
];

const PAGE_SIZE = 40;
const CARD_HEIGHT = 140; // Video card height in pixels
const CARD_GAP = 12; // Gap between cards

const StockGallery: React.FC<StockGalleryProps> = ({ onSelectVideo, onClose, mode = 'overlay' }) => {
  const isInline = mode === 'inline';
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<StockCategory | null>(null);
  const [categories, setCategories] = useState<StockCategory[]>([]);
  const [videos, setVideos] = useState<StockVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<StockVideo | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number>(-1);
  const [sortOption, setSortOption] = useState<SortOption>(SORT_OPTIONS[0]);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [hoveredVideoId, setHoveredVideoId] = useState<string | null>(null);

  // Video durations extracted from thumbnails
  const [videoDurations, setVideoDurations] = useState<Record<string, number>>({});

  // Filter states
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedSceneType, setSelectedSceneType] = useState<string | null>(null);
  const [moodCounts, setMoodCounts] = useState<{ mood: string; count: number }[]>([]);
  const [sceneTypeCounts, setSceneTypeCounts] = useState<{ sceneType: string; count: number }[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [gridContainerSize, setGridContainerSize] = useState({ width: 0, height: 0 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Calculate columns based on container width
  const columnCount = useMemo(() => {
    if (gridContainerSize.width === 0) return 4;
    if (gridContainerSize.width >= 1536) return 6; // 2xl
    if (gridContainerSize.width >= 1280) return 5; // xl
    if (gridContainerSize.width >= 1024) return 4; // lg
    if (gridContainerSize.width >= 768) return 3; // md
    return 2;
  }, [gridContainerSize.width]);

  // Row count for virtual grid
  const rowCount = useMemo(() => Math.ceil(videos.length / columnCount), [videos.length, columnCount]);

  // Total video count across all categories
  const totalVideos = useMemo(() => {
    return categories.reduce((sum, cat) => sum + (cat.videoCount || 0), 0);
  }, [categories]);

  // Track grid container size for virtual scrolling
  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setGridContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape to close preview or gallery (only in overlay mode)
      if (e.key === 'Escape') {
        if (previewVideo) {
          setPreviewVideo(null);
          setPreviewIndex(-1);
        } else if (onClose && !isInline) {
          onClose();
        }
        return;
      }

      // Arrow keys / Enter only work when preview is open
      if (!previewVideo || previewIndex < 0) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const newIndex = Math.max(0, previewIndex - 1);
        if (newIndex !== previewIndex && videos[newIndex]) {
          setPreviewVideo(videos[newIndex]);
          setPreviewIndex(newIndex);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const newIndex = Math.min(videos.length - 1, previewIndex + 1);
        if (newIndex !== previewIndex && videos[newIndex]) {
          setPreviewVideo(videos[newIndex]);
          setPreviewIndex(newIndex);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleAddToTimeline(previewVideo);
        setPreviewVideo(null);
        setPreviewIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewVideo, previewIndex, videos, onClose, isInline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle duration extracted from thumbnail generation
  const handleDurationExtracted = useCallback((videoId: string, duration: number) => {
    setVideoDurations(prev => ({ ...prev, [videoId]: duration }));
  }, []);

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      setLoading(true);
      try {
        const [cats, moods, scenes] = await Promise.all([
          listStockCategories(),
          getMoodCounts(),
          getSceneTypeCounts(),
        ]);
        setCategories(cats);
        setMoodCounts(moods);
        setSceneTypeCounts(scenes);
      } catch (err) {
        logger.error('StockGallery', 'Failed to load categories', err);
        setError('Failed to load categories. Check GCS bucket access.');
      } finally {
        setLoading(false);
      }
    };
    loadCategories();
  }, []);

  // Debounce search query
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 400);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchQuery]);

  // Auto-search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      handleSearch(debouncedQuery);
    } else if (debouncedQuery.trim().length === 0 && isSearchMode) {
      setIsSearchMode(false);
      setVideos([]);
    }
  }, [debouncedQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVideos = useCallback(async (reset = false) => {
    if (!selectedCategory) return;
    setLoading(true);
    setError(null);
    const newPage = reset ? 0 : page;
    try {
      const results = await listStockVideos(selectedCategory.path, {
        sortBy: sortOption.sortBy,
        sortDir: sortOption.sortDir,
        limit: PAGE_SIZE,
        offset: newPage * PAGE_SIZE,
        mood: selectedMood || undefined,
        sceneType: selectedSceneType || undefined,
      });
      if (reset) {
        setVideos(results);
        setPage(0);
      } else {
        setVideos(prev => [...prev, ...results]);
      }
      setHasMore(results.length === PAGE_SIZE);
    } catch (err) {
      logger.error('StockGallery', 'Failed to load videos', err);
      setError('Failed to load videos.');
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, sortOption, page, selectedMood, selectedSceneType]);

  const handleSearch = useCallback(async (query?: string) => {
    const q = query || searchQuery;
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setIsSearchMode(true);
    try {
      const results = await searchStockVideos(q, {
        category: selectedCategory?.id || undefined,
        mood: selectedMood || undefined,
        sceneType: selectedSceneType || undefined,
        sortBy: sortOption.sortBy,
        sortDir: sortOption.sortDir,
        limit: PAGE_SIZE,
      });
      setVideos(results);
      setHasMore(results.length === PAGE_SIZE);
    } catch (err) {
      logger.error('StockGallery', 'Search failed', err);
      setError('Search failed.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, sortOption, selectedCategory, selectedMood, selectedSceneType]);

  // Reload videos when category or sort or filters change
  useEffect(() => {
    if (selectedCategory) {
      setVideos([]);
      setPage(0);
      setHasMore(true);
      loadVideos(true);
    }
  }, [selectedCategory, sortOption, selectedMood, selectedSceneType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle hover with debounce for preview
  const handleVideoHover = useCallback((videoId: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (videoId) {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredVideoId(videoId);
      }, 300);
    } else {
      setHoveredVideoId(null);
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      setPage(p => p + 1);
    }
  }, [loading, hasMore]);

  // Load more when page changes
  useEffect(() => {
    if (page > 0) {
      loadVideos(false);
    }
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll detection
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    const threshold = 200;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
      handleLoadMore();
    }
  }, [loading, hasMore, handleLoadMore]);

  const handlePreview = useCallback((video: StockVideo, index: number) => {
    setPreviewVideo(video);
    setPreviewIndex(index);
  }, []);

  const handleAddToTimeline = useCallback((video: StockVideo) => {
    const duration = videoDurations[video.id] || video.duration;
    onSelectVideo({ url: video.url, name: video.name, duration: duration || undefined });
  }, [videoDurations, onSelectVideo]);

  const handleCategorySelect = (category: StockCategory) => {
    setSelectedCategory(category);
    setSearchQuery('');
    setIsSearchMode(false);
    setVideos([]);
    setPage(0);
    setHasMore(true);
  };

  const handleMoodFilter = (mood: string | null) => {
    setSelectedMood(mood);
    if (isSearchMode && debouncedQuery) {
      handleSearch(debouncedQuery);
    }
  };

  const handleSceneTypeFilter = (sceneType: string | null) => {
    setSelectedSceneType(sceneType);
    if (isSearchMode && debouncedQuery) {
      handleSearch(debouncedQuery);
    }
  };

  const handleBack = () => {
    setSelectedCategory(null);
    setVideos([]);
    setSearchQuery('');
    setIsSearchMode(false);
    setPreviewVideo(null);
    setSelectedMood(null);
    setSelectedSceneType(null);
    setPage(0);
    setHasMore(true);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setIsSearchMode(false);
    setVideos([]);
  };

  const clearAllFilters = () => {
    setSelectedMood(null);
    setSelectedSceneType(null);
  };

  // Container classes based on mode
  const containerClasses = isInline
    ? 'h-full w-full bg-gray-950 flex flex-col'
    : 'fixed inset-0 z-[200] bg-black/95 flex flex-col';

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-800 shrink-0 ${isInline ? 'bg-gray-900/80' : 'bg-gray-900/50'}`}>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-dash-400 uppercase tracking-wider">
            📁 Stock Gallery
          </h2>
          {selectedCategory && (
            <button
              onClick={handleBack}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              ← Back
            </button>
          )}
          {selectedCategory && (
            <span className="text-xs text-gray-600">
              {selectedCategory.icon} {selectedCategory.name}
              {selectedCategory.videoCount ? ` (${selectedCategory.videoCount})` : videos.length > 0 ? ` (${videos.length})` : ''}
            </span>
          )}
          {isSearchMode && !selectedCategory && (
            <span className="text-xs text-gray-600">
              🔍 Search: "{debouncedQuery}" — {videos.length} result{videos.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search clips..."
              className="w-56 px-3 py-1.5 pl-8 rounded-lg bg-gray-800/50 border border-gray-700/50 text-white text-sm focus:border-dash-500/50 focus:outline-none"
            />
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Sort dropdown */}
          {(selectedCategory || isSearchMode) && (
            <div className="relative">
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="px-2.5 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50 text-gray-400 text-xs hover:border-gray-600 transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                {sortOption.label}
              </button>
              {showSortMenu && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 py-1">
                  {SORT_OPTIONS.map((opt) => (
                    <button
                      key={`${opt.sortBy}-${opt.sortDir}`}
                      onClick={() => { setSortOption(opt); setShowSortMenu(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${sortOption === opt ? 'text-dash-400 bg-dash-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                        }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Close button (overlay mode only) */}
          {!isInline && onClose && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-500 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content with Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Categories */}
        {(selectedCategory || isSearchMode) && showSidebar && (
          <div className="w-48 shrink-0 border-r border-gray-800 bg-gray-900/30 overflow-y-auto">
            <div className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase text-gray-500 font-semibold tracking-wider">Categories</span>
                <button
                  onClick={() => setShowSidebar(false)}
                  className="text-gray-600 hover:text-gray-400 p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
              </div>
              <button
                onClick={handleBack}
                className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors mb-1 ${!selectedCategory ? 'text-dash-400 bg-dash-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                  }`}
              >
                📂 All Categories
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors flex items-center justify-between ${selectedCategory?.id === cat.id ? 'text-dash-400 bg-dash-500/10' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
                    }`}
                >
                  <span className="truncate">{cat.icon} {cat.name}</span>
                  {cat.videoCount != null && cat.videoCount > 0 && (
                    <span className="text-[9px] text-gray-600 ml-1">{cat.videoCount}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Collapsed sidebar toggle */}
        {(selectedCategory || isSearchMode) && !showSidebar && (
          <button
            onClick={() => setShowSidebar(true)}
            className="w-6 shrink-0 border-r border-gray-800 bg-gray-900/30 flex items-center justify-center text-gray-600 hover:text-gray-400"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Main content area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4"
        >
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Filter chips */}
          {(selectedCategory || isSearchMode) && (
            <div className="mb-4 flex flex-wrap gap-2 items-center">
              {/* Mood filters */}
              <span className="text-[10px] text-gray-500 uppercase">Mood:</span>
              {moodCounts.slice(0, 8).map(({ mood, count }) => (
                <button
                  key={mood}
                  onClick={() => handleMoodFilter(selectedMood === mood ? null : mood)}
                  className={`px-2 py-1 rounded-full text-[10px] transition-colors flex items-center gap-1 ${selectedMood === mood
                      ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                      : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:border-gray-600'
                    }`}
                >
                  <span>{getMoodIcon(mood)}</span>
                  <span>{mood}</span>
                  <span className="text-gray-600">({count})</span>
                </button>
              ))}

              {/* Scene type filters */}
              {sceneTypeCounts.length > 0 && (
                <>
                  <span className="text-[10px] text-gray-500 uppercase ml-2">Scene:</span>
                  {sceneTypeCounts.slice(0, 6).map(({ sceneType, count }) => (
                    <button
                      key={sceneType}
                      onClick={() => handleSceneTypeFilter(selectedSceneType === sceneType ? null : sceneType)}
                      className={`px-2 py-1 rounded-full text-[10px] transition-colors ${selectedSceneType === sceneType
                          ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                          : 'bg-gray-800/50 text-gray-400 border border-gray-700/50 hover:border-gray-600'
                        }`}
                    >
                      {sceneType} ({count})
                    </button>
                  ))}
                </>
              )}

              {/* Clear filters */}
              {(selectedMood || selectedSceneType) && (
                <button
                  onClick={clearAllFilters}
                  className="px-2 py-1 rounded-full text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                >
                  ✕ Clear filters
                </button>
              )}
            </div>
          )}

          {loading && videos.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-dash-500/30 border-t-dash-500 rounded-full animate-spin" />
                <span className="text-xs text-gray-500">Loading...</span>
              </div>
            </div>
          ) : !selectedCategory && !isSearchMode ? (
            /* Category browse grid */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategorySelect(cat)}
                  className="aspect-video rounded-xl bg-gray-800/50 border border-gray-700/30 hover:border-dash-500/40 hover:bg-gray-800/80 transition-all flex flex-col items-center justify-center gap-2 p-4 group relative"
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">{cat.icon}</span>
                  <span className="text-xs font-medium text-white text-center leading-tight">{cat.name}</span>
                  {/* Video count badge */}
                  {cat.videoCount != null && cat.videoCount > 0 && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-dash-500/20 text-dash-400 text-[10px] font-mono">
                      {cat.videoCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : videos.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500">
              <span className="text-2xl mb-2">🎬</span>
              <p className="text-sm">No videos found</p>
              {isSearchMode && (
                <button
                  onClick={handleClearSearch}
                  className="mt-2 text-xs text-dash-400 hover:text-dash-300"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            /* Video Grid - use explicit height instead of virtual grid when container size is unknown */
            <div
              ref={gridContainerRef}
              className="relative"
              style={{ minHeight: Math.max(400, rowCount * (CARD_HEIGHT + CARD_GAP)) }}
            >
              {(() => {
                const effectiveWidth = gridContainerSize.width > 0 ? gridContainerSize.width : 800;
                const effectiveHeight = gridContainerSize.height > 0
                  ? gridContainerSize.height
                  : Math.max(400, rowCount * (CARD_HEIGHT + CARD_GAP));
                return (
                  <Grid
                    cellComponent={VideoGridCell}
                    cellProps={{
                      videos,
                      videoDurations,
                      hoveredVideoId,
                      columnCount,
                      isSearchMode,
                      onPreview: handlePreview,
                      onAdd: handleAddToTimeline,
                      onHover: handleVideoHover,
                      onDurationExtracted: handleDurationExtracted,
                    }}
                    columnCount={columnCount}
                    columnWidth={(effectiveWidth - CARD_GAP * (columnCount - 1)) / columnCount}
                    height={effectiveHeight}
                    rowCount={rowCount}
                    rowHeight={CARD_HEIGHT + CARD_GAP}
                    width={effectiveWidth}
                    // @ts-expect-error react-window v2 onScroll type mismatch
                    onScroll={({ scrollTop }: { scrollTop: number }) => {
                      // Infinite scroll - load more when near bottom
                      const threshold = 400;
                      const totalHeight = rowCount * (CARD_HEIGHT + CARD_GAP);
                      if (!loading && hasMore && totalHeight - scrollTop - effectiveHeight < threshold) {
                        handleLoadMore();
                      }
                    }}
                  />
                );
              })()}

              {/* Loading indicator overlay */}
              {loading && videos.length > 0 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-gray-900/90 border border-gray-700/50 flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-dash-500/30 border-t-dash-500 rounded-full animate-spin" />
                  <span className="text-xs text-gray-400">Loading more...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Video Preview Modal */}
      {previewVideo && (
        <div
          className="fixed inset-0 z-[210] bg-black/90 flex items-center justify-center p-8"
          onClick={() => { setPreviewVideo(null); setPreviewIndex(-1); }}
        >
          {/* Previous button */}
          {previewIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewVideo(videos[previewIndex - 1]);
                setPreviewIndex(previewIndex - 1);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-gray-800/80 hover:bg-gray-700 text-white transition-colors z-20"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Next button */}
          {previewIndex < videos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewVideo(videos[previewIndex + 1]);
                setPreviewIndex(previewIndex + 1);
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-gray-800/80 hover:bg-gray-700 text-white transition-colors z-20"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}

          <div
            className="relative max-w-4xl w-full rounded-2xl overflow-hidden bg-gray-900 border border-gray-700/50"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={previewVideo.url}
              controls
              autoPlay
              className="w-full max-h-[70vh] bg-black"
              crossOrigin="anonymous"
            />
            <div className="p-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">{previewVideo.name}</p>
                <p className="text-xs text-gray-500">
                  {previewVideo.size > 0 && `${(previewVideo.size / 1024 / 1024).toFixed(1)} MB`}
                  {(videoDurations[previewVideo.id] || previewVideo.duration) > 0 && ` • ${videoDurations[previewVideo.id] || previewVideo.duration}s`}
                  {previewVideo.folder && ` • ${previewVideo.folder}`}
                  {previewVideo.mood && ` • ${previewVideo.mood}`}
                  {` • ${previewIndex + 1}/${videos.length}`}
                </p>
                {/* Tags */}
                {previewVideo.tags && previewVideo.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {previewVideo.tags.slice(0, 8).map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded bg-gray-800 text-[9px] text-gray-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0 items-center">
                {/* Keyboard hints */}
                <div className="hidden md:flex items-center gap-1 text-[9px] text-gray-600 mr-2">
                  <span className="px-1 py-0.5 rounded bg-gray-800 font-mono">←→</span>
                  <span>nav</span>
                  <span className="px-1 py-0.5 rounded bg-gray-800 font-mono ml-1">↵</span>
                  <span>add</span>
                  <span className="px-1 py-0.5 rounded bg-gray-800 font-mono ml-1">Esc</span>
                  <span>close</span>
                </div>
                <button
                  onClick={() => handleAddToTimeline(previewVideo)}
                  className="px-3 py-1.5 rounded-lg bg-dash-600/60 hover:bg-dash-600/80 text-white text-xs transition-colors"
                >
                  + Add to Timeline
                </button>
                <button
                  onClick={() => { setPreviewVideo(null); setPreviewIndex(-1); }}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50 text-xs text-gray-500 shrink-0 flex items-center justify-between">
        <span>
          {selectedCategory
            ? `${videos.length}${hasMore ? '+' : ''} clips in ${selectedCategory.name}${selectedMood ? ` (${selectedMood})` : ''}${selectedSceneType ? ` [${selectedSceneType}]` : ''}`
            : isSearchMode
              ? `${videos.length} result${videos.length !== 1 ? 's' : ''} for "${debouncedQuery}"${selectedMood ? ` • ${selectedMood}` : ''}${selectedSceneType ? ` • ${selectedSceneType}` : ''}`
              : `${categories.length} categories • ${totalVideos} total clips • ${moodCounts.length} moods`}
        </span>
        <span className="text-gray-600 flex items-center gap-2">
          <span className="hidden sm:inline">Virtual scroll • Cached thumbnails</span>
          <span className="px-1 py-0.5 rounded bg-gray-800 font-mono text-[9px]">Esc</span>
          <span>close</span>
        </span>
      </div>
    </div>
  );
};

export default StockGallery;
