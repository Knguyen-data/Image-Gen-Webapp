/**
 * Supabase Stock Gallery Service
 * Lists and streams stock videos from Supabase Storage bucket.
 * Zero API cost — videos are hosted on Supabase, users browse for free.
 */

import { supabase } from './supabase';
import { logger } from './logger';

const STOCK_BUCKET = 'media';

/**
 * List stock categories (top-level folders in the bucket)
 */
export async function listStockCategories(): Promise<StockCategory[]> {
  const { data, error } = await supabase.storage
    .from(STOCK_BUCKET)
    .list('stock/', {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' },
    });

  if (error) {
    logger.error('StockGallery', 'Failed to list categories', error);
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  const categories: StockCategory[] = (data || [])
    .filter(item => item.name && !item.name.startsWith('.') && item.id === null)
    .map(item => ({
      id: item.name,
      name: formatCategoryName(item.name),
      icon: getCategoryIcon(item.name),
      path: `stock/${item.name}/`,
    }));

  return categories;
}

/**
 * List videos in a category folder
 */
export async function listStockVideos(categoryPath: string): Promise<StockVideo[]> {
  const { data, error } = await supabase.storage
    .from(STOCK_BUCKET)
    .list(categoryPath, {
      limit: 100,
      sortBy: { column: 'name', order: 'asc' },
    });

  if (error) {
    logger.error('StockGallery', 'Failed to list videos', error);
    throw new Error(`Failed to load videos: ${error.message}`);
  }

  const videos: StockVideo[] = (data || [])
    .filter(item => item.name && (item.name.endsWith('.mp4') || item.name.endsWith('.webm') || item.name.endsWith('.mov')))
    .map(item => ({
      id: item.id,
      name: item.name.replace(/\.(mp4|webm|mov)$/i, ''),
      url: getPublicUrl(`${categoryPath}/${item.name}`),
      thumbnailUrl: getThumbnailUrl(`${categoryPath}/${item.name}`),
      size: item.metadata?.size || 0,
      duration: extractDuration(item.name),
    }));

  return videos;
}

/**
 * Get a public URL for a stock video
 */
function getPublicUrl(path: string): string {
  const { data } = supabase.storage
    .from(STOCK_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Generate thumbnail URL — Supabase doesn't auto-generate thumbnails
 * For now, return null (will show placeholder)
 * TODO: Generate thumbnails on upload via Edge Functions
 */
function getThumbnailUrl(path: string): string | null {
  // Placeholder — Supabase doesn't auto-generate video thumbnails
  // Users will see a video icon instead
  return null;
}

/**
 * Extract approximate duration from filename (e.g., "porsche-911-5sec.mp4" → 5)
 */
function extractDuration(filename: string): number {
  const match = filename.match(/(\d+)s(?:ec)?\.?(mp4|webm|mov)$/i);
  if (match) return parseInt(match[1]);
  // Default fallback
  return 10;
}

/**
 * Format category folder name to display name
 */
function formatCategoryName(name: string): string {
  const names: Record<string, string> = {
    'luxury': 'Luxury',
    'cars': 'Cars',
    'yachts': 'Yachts',
    'planes': 'Planes',
    'watches': 'Watches',
    'property': 'Property',
    'lifestyle': 'Lifestyle',
    'abstract': 'Abstract',
    'nature': 'Nature',
    'business': 'Business',
    'technology': 'Technology',
    'people': 'People',
    'urban': 'Urban',
    'food': 'Food',
    'travel': 'Travel',
  };
  return names[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Get emoji icon for category
 */
function getCategoryIcon(name: string): string {
  const icons: Record<string, string> = {
    'luxury': '💎',
    'cars': '🚗',
    'yachts': '🛥️',
    'planes': '✈️',
    'watches': '⌚',
    'property': '🏠',
    'lifestyle': '✨',
    'abstract': '🎨',
    'nature': '🌿',
    'business': '💼',
    'technology': '💻',
    'people': '👥',
    'urban': '🌆',
    'food': '🍽️',
    'travel': '🗺️',
  };
  return icons[name.toLowerCase()] || '🎬';
}

/**
 * Search videos across all categories
 */
export async function searchStockVideos(query: string): Promise<StockVideo[]> {
  // For now, search is limited — ideally we'd have a search index
  // For now, return empty (category browsing is the primary UX)
  logger.info('StockGallery', 'Search requested but not implemented', { query });
  return [];
}

/**
 * Types
 */
export interface StockCategory {
  id: string;
  name: string;
  icon: string;
  path: string;
}

export interface StockVideo {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  size: number;
  duration: number;
}
