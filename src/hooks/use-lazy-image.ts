/**
 * React Hook for Lazy Image Loading
 * Uses Intersection Observer for efficient viewport-based loading
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getImageUrl, getThumbnail } from '../services/image-optimization';

type ImageSize = 'tiny' | 'small' | 'medium' | 'large' | 'original';

interface UseLazyImageOptions {
  imageId: string;
  size?: ImageSize;
  rootMargin?: string;
  threshold?: number;
  priority?: boolean; // Load immediately if true
}

interface UseLazyImageReturn {
  src: string | null;
  isLoading: boolean;
  isVisible: boolean;
  error: Error | null;
  ref: React.RefObject<HTMLImageElement | null>;
  retry: () => void;
}

export function useLazyImage({
  imageId,
  size = 'small',
  rootMargin = '50px',
  threshold = 0.1,
  priority = false,
}: UseLazyImageOptions): UseLazyImageReturn {
  const [src, setSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVisible, setIsVisible] = useState(priority);
  const [error, setError] = useState<Error | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (priority) {
      setIsVisible(true);
      return;
    }

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [priority, rootMargin, threshold]);

  // Load image when visible
  useEffect(() => {
    if (!isVisible || !imageId) return;

    let cancelled = false;

    const loadImage = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Revoke previous URL
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
        }

        // Get image URL (blob URL)
        const url = size === 'original'
          ? await getImageUrl(imageId, 'original')
          : await getImageUrl(imageId, size);

        if (!cancelled) {
          if (url) {
            objectUrlRef.current = url;
            setSrc(url);
          } else {
            setError(new Error('Image not found'));
          }
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load image'));
          setIsLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [isVisible, imageId, size]);

  const retry = useCallback(() => {
    setError(null);
    setIsVisible(true); // Trigger reload
  }, []);

  return {
    src,
    isLoading,
    isVisible,
    error,
    ref,
    retry,
  };
}

/**
 * Hook for loading a batch of images with priority levels
 */
interface BatchImageItem {
  id: string;
  priority?: boolean;
}

interface UseLazyBatchImagesReturn {
  loadedImages: Map<string, string>;
  loadingImages: Set<string>;
  failedImages: Set<string>;
}

export function useLazyBatchImages(
  images: BatchImageItem[],
  size: ImageSize = 'small'
): UseLazyBatchImagesReturn {
  const [loadedImages, setLoadedImages] = useState<Map<string, string>>(new Map());
  const [loadingImages, setLoadingImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Load priority images immediately
    const priorityImages = images.filter(img => img.priority);
    const nonPriorityImages = images.filter(img => !img.priority);

    // Load priority images
    priorityImages.forEach(img => {
      if (loadedImages.has(img.id) || loadingImages.has(img.id)) return;

      setLoadingImages(prev => new Set(prev).add(img.id));

      getImageUrl(img.id, size)
        .then(url => {
          if (url) {
            setLoadedImages(prev => new Map(prev).set(img.id, url));
          } else {
            setFailedImages(prev => new Set(prev).add(img.id));
          }
        })
        .catch(() => {
          setFailedImages(prev => new Set(prev).add(img.id));
        })
        .finally(() => {
          setLoadingImages(prev => {
            const next = new Set(prev);
            next.delete(img.id);
            return next;
          });
        });
    });

    // Stagger load non-priority images
    nonPriorityImages.forEach((img, index) => {
      if (loadedImages.has(img.id) || loadingImages.has(img.id)) return;

      setTimeout(() => {
        setLoadingImages(prev => new Set(prev).add(img.id));

        getImageUrl(img.id, size)
          .then(url => {
            if (url) {
              setLoadedImages(prev => new Map(prev).set(img.id, url));
            } else {
              setFailedImages(prev => new Set(prev).add(img.id));
            }
          })
          .catch(() => {
            setFailedImages(prev => new Set(prev).add(img.id));
          })
          .finally(() => {
            setLoadingImages(prev => {
              const next = new Set(prev);
              next.delete(img.id);
              return next;
            });
          });
      }, index * 50); // 50ms stagger
    });
  }, [images, size]);

  return {
    loadedImages,
    loadingImages,
    failedImages,
  };
}

export default useLazyImage;
