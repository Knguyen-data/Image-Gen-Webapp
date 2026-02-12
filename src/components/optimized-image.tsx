/**
 * Optimized Image Component
 * Features:
 * - Lazy loading with Intersection Observer
 * - Progressive loading (tiny -> small -> medium -> large)
 * - Blur-up placeholder effect
 * - Automatic thumbnail selection based on container size
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getThumbnail, getOptimizedImage } from '../services/image-optimization';

interface OptimizedImageProps {
  imageId: string;
  alt?: string;
  className?: string;
  containerWidth?: number;
  priority?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

// Determine optimal thumbnail size based on container width
function getOptimalSize(width: number): 'tiny' | 'small' | 'medium' | 'large' {
  if (width <= 100) return 'tiny';
  if (width <= 300) return 'small';
  if (width <= 600) return 'medium';
  return 'large';
}

export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  imageId,
  alt = '',
  className = '',
  containerWidth = 400,
  priority = false,
  onLoad,
  onError,
}) => {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isInViewport, setIsInViewport] = useState(priority);
  const containerRef = useRef<HTMLDivElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  // Clean up object URLs
  const cleanup = useCallback(() => {
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) {
      setIsInViewport(true);
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px', threshold: 0.1 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [priority]);

  // Progressive image loading
  useEffect(() => {
    if (!isInViewport) return;

    let cancelled = false;
    const targetSize = getOptimalSize(containerWidth);

    const loadProgressively = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Step 1: Load tiny placeholder first (fast)
        const tinyBlob = await getThumbnail(imageId, 'tiny');
        if (tinyBlob && !cancelled) {
          const tinyUrl = URL.createObjectURL(tinyBlob);
          objectUrlsRef.current.push(tinyUrl);
          setCurrentSrc(tinyUrl);
        }

        // Step 2: Load target size
        const targetBlob = await getThumbnail(imageId, targetSize);
        if (targetBlob && !cancelled) {
          const targetUrl = URL.createObjectURL(targetBlob);
          objectUrlsRef.current.push(targetUrl);
          setCurrentSrc(targetUrl);
          setIsLoading(false);
          onLoad?.();
        }

        // Step 3: If target was small/medium, preload larger for zoom
        if ((targetSize === 'small' || targetSize === 'medium') && !cancelled) {
          const largeBlob = await getThumbnail(imageId, 'large');
          if (largeBlob) {
            // Preload but don't display yet
            const largeUrl = URL.createObjectURL(largeBlob);
            objectUrlsRef.current.push(largeUrl);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error('Failed to load image');
          setError(error);
          setIsLoading(false);
          onError?.(error);
        }
      }
    };

    loadProgressively();

    return () => {
      cancelled = true;
    };
  }, [isInViewport, imageId, containerWidth, onLoad, onError]);

  // Retry loading
  const handleRetry = useCallback(() => {
    cleanup();
    setCurrentSrc(null);
    setError(null);
    setIsInViewport(true);
  }, [cleanup]);

  if (error) {
    return (
      <div
        ref={containerRef}
        className={`flex items-center justify-center bg-gray-800/50 ${className}`}
        style={{ minHeight: '100px' }}
      >
        <button
          onClick={handleRetry}
          className="px-3 py-1 text-sm text-white/60 hover:text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
    >
      {currentSrc ? (
        <img
          src={currentSrc}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoading ? 'opacity-80 blur-sm' : 'opacity-100 blur-0'
          }`}
          loading={priority ? 'eager' : 'lazy'}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800/30">
          <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

/**
 * Optimized thumbnail for grid layouts
 * Uses tiny thumbnail for instant render
 */
interface OptimizedThumbnailProps {
  imageId: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
}

export const OptimizedThumbnail: React.FC<OptimizedThumbnailProps> = ({
  imageId,
  alt = '',
  className = '',
  onClick,
}) => {
  const [src, setSrc] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadThumbnail();
          observer.disconnect();
        }
      },
      { rootMargin: '50px' }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [imageId]);

  const loadThumbnail = async () => {
    try {
      const blob = await getThumbnail(imageId, 'small');
      if (blob) {
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setSrc(url);
      }
    } catch (err) {
      console.warn('Failed to load thumbnail:', err);
    }
  };

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden cursor-pointer ${className}`}
      onClick={onClick}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setIsLoaded(true)}
        />
      ) : (
        <div className="w-full h-full bg-gray-800/30 animate-pulse" />
      )}
    </div>
  );
};

export default OptimizedImage;
