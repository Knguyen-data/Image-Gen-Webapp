/**
 * Supabase-backed Stock Gallery Service
 * 
 * Queries the `stock_videos` table in Supabase for categories, listings, and search.
 * Falls back to direct GCS API if Supabase is empty/unavailable.
 * 
 * Bucket: higgfails_media (publicly readable)
 * Structure: higgfails_media/{category}/video.mp4
 */

import { supabase } from './supabase';
import { logger } from './logger';

const GCS_BUCKET = 'higgfails_media';
const GCS_BASE_URL = `https://storage.googleapis.com/${GCS_BUCKET}`;
const GCS_API_BASE = `https://storage.googleapis.com/storage/v1/b/${GCS_BUCKET}/o`;

// === TYPES ===

export interface StockCategory {
  id: string;
  name: string;
  icon: string;
  path: string;
  rawName?: string;
  videoCount?: number;
}

export interface StockVideo {
  id: string;
  name: string;
  displayName?: string;
  url: string;
  thumbnailUrl: string | null;
  size: number;
  duration: number;
  mimeType?: string;
  folder?: string;
  category?: string;
  tags?: string[];
  description?: string;
  mood?: string;
  aiCategory?: string;
  colors?: string[];
  sceneType?: string;
}

// Available moods for filtering
export const STOCK_MOODS = ['elegant', 'energetic', 'calm', 'dramatic', 'romantic', 'mysterious', 'playful', 'cinematic'] as const;
export type StockMood = typeof STOCK_MOODS[number];

// Available scene types
export const STOCK_SCENE_TYPES = ['outdoor', 'indoor', 'nature', 'urban', 'abstract', 'portrait', 'aerial', 'underwater'] as const;
export type StockSceneType = typeof STOCK_SCENE_TYPES[number];

// === SUPABASE-BACKED API ===

/**
 * List stock categories with video counts from Supabase.
 * Uses RPC function if available, otherwise paginates to get all categories.
 */
export async function listStockCategories(): Promise<StockCategory[]> {
  try {
    // Try RPC first (most efficient — single query, server-side grouping)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_stock_category_counts');
    
    if (!rpcError && rpcData && rpcData.length > 0) {
      return (rpcData as Array<{ category: string; count: number }>)
        .sort((a, b) => a.category.localeCompare(b.category))
        .map(({ category, count }) => ({
          id: category,
          name: formatCategoryName(category),
          icon: getCategoryIcon(category),
          path: `${category}/`,
          rawName: category,
          videoCount: count,
        }));
    }

    // Fallback: paginate through all rows to count categories client-side
    // (PostgREST defaults to 1000 row limit, so we must paginate)
    logger.info('StockGallery', 'RPC not available, paginating for category counts');
    const counts: Record<string, number> = {};
    let offset = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from('stock_videos')
        .select('category')
        .range(offset, offset + pageSize - 1);

      if (error) {
        logger.warn('StockGallery', 'Supabase category fetch failed, falling back to GCS', error);
        return listStockCategoriesFromGCS();
      }

      if (!data || data.length === 0) {
        if (offset === 0) {
          logger.info('StockGallery', 'No categories in Supabase, falling back to GCS');
          return listStockCategoriesFromGCS();
        }
        break;
      }

      for (const row of data as Array<{ category: string }>) {
        if (row.category) {
          counts[row.category] = (counts[row.category] || 0) + 1;
        }
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, count]) => ({
        id: category,
        name: formatCategoryName(category),
        icon: getCategoryIcon(category),
        path: `${category}/`,
        rawName: category,
        videoCount: count,
      }));
  } catch (error) {
    logger.error('StockGallery', 'Failed to list categories', error);
    return listStockCategoriesFromGCS();
  }
}

/**
 * List videos in a category from Supabase
 */
export interface StockVideoFilters {
  category?: string;
  mood?: string;
  sceneType?: string;
  sortBy?: 'name' | 'size' | 'date';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export async function listStockVideos(
  categoryPath: string,
  options: StockVideoFilters = {}
): Promise<StockVideo[]> {
  const { sortBy = 'name', sortDir = 'asc', limit = 100, offset = 0, mood, sceneType } = options;
  const category = categoryPath.replace(/\/$/, '');

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('stock_videos')
      .select('*')
      .eq('category', category);
    
    // Apply optional filters
    if (mood) query = query.eq('mood', mood);
    if (sceneType) query = query.eq('scene_type', sceneType);

    // Sort by the correct column
    const sortColumn = sortBy === 'date' ? 'created_at' : sortBy === 'size' ? 'size' : 'name';
    query = query.order(sortColumn, { ascending: sortDir === 'asc' });
    query = query.range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      logger.warn('StockGallery', 'Supabase video list failed, falling back to GCS', error);
      return listStockVideosFromGCS(categoryPath);
    }

    if (!data || data.length === 0) {
      return listStockVideosFromGCS(categoryPath);
    }

    return mapSupabaseRows(data);
  } catch (error) {
    logger.error('StockGallery', 'Failed to list videos', error);
    return listStockVideosFromGCS(categoryPath);
  }
}

export interface StockSearchOptions {
  category?: string;
  mood?: string;
  sceneType?: string;
  sortBy?: 'name' | 'size' | 'date';
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Search videos using the RPC function `search_stock_videos`
 * Params: search_query, category_filter, mood_filter, scene_filter, result_limit, result_offset
 */
export async function searchStockVideos(
  query: string,
  options: StockSearchOptions = {}
): Promise<StockVideo[]> {
  const { category = '', mood = '', sceneType = '', limit = 50, offset = 0 } = options;

  try {
    // Use the RPC function for search
    const { data, error } = await supabase.rpc('search_stock_videos', {
      search_query: query.trim(),
      category_filter: category || null,
      mood_filter: mood || null,
      scene_filter: sceneType || null,
      result_limit: limit,
      result_offset: offset,
    });

    if (error) {
      logger.warn('StockGallery', 'RPC search failed, falling back to LIKE search', error);
      return fallbackSearch(query, category, limit, mood, sceneType);
    }

    if (!data || data.length === 0) {
      // Try fallback search with LIKE
      return fallbackSearch(query, category, limit, mood, sceneType);
    }

    return mapSupabaseRows(data);
  } catch (error) {
    logger.error('StockGallery', 'Search failed', error);
    return searchStockVideosFromGCS(query);
  }
}

/**
 * Fallback search using ILIKE when RPC returns no results
 */
async function fallbackSearch(
  query: string,
  category: string,
  limit: number,
  mood?: string,
  sceneType?: string
): Promise<StockVideo[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let queryBuilder: any = supabase
      .from('stock_videos')
      .select('*')
      .or(`name.ilike.%${query}%,description.ilike.%${query}%,filename.ilike.%${query}%`)
      .limit(limit);

    if (category) queryBuilder = queryBuilder.eq('category', category);
    if (mood) queryBuilder = queryBuilder.eq('mood', mood);
    if (sceneType) queryBuilder = queryBuilder.eq('scene_type', sceneType);

    const { data, error } = await queryBuilder;

    if (error) throw error;
    return mapSupabaseRows(data || []);
  } catch {
    return searchStockVideosFromGCS(query);
  }
}

/**
 * Get total video count for a category
 */
export async function getVideoCategoryCount(category: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('stock_videos')
      .select('id', { count: 'exact', head: true })
      .eq('category', category);

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

// === MAP SUPABASE ROWS TO StockVideo ===

function mapSupabaseRows(rows: any[]): StockVideo[] {
  return rows.map(row => ({
    id: row.id?.toString() || row.filename,
    name: row.name || extractDisplayName(row.filename || ''),
    displayName: row.display_name || row.name,
    url: row.url,
    thumbnailUrl: null,
    size: Number(row.size) || 0,
    duration: extractDuration(row.filename || ''),
    mimeType: row.mime_type || 'video/mp4',
    folder: row.category,
    category: row.category,
    tags: row.tags || [],
    description: row.description || '',
    mood: row.mood || '',
    aiCategory: row.ai_category || '',
    colors: row.colors || [],
    sceneType: row.scene_type || '',
  }));
}

/**
 * Get available moods from the database with counts
 */
export async function getMoodCounts(): Promise<{ mood: string; count: number }[]> {
  try {
    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_stock_mood_counts');
    if (!rpcError && rpcData && rpcData.length > 0) {
      return (rpcData as Array<{ mood: string; count: number }>)
        .sort((a, b) => b.count - a.count);
    }

    // Fallback: paginate
    const counts: Record<string, number> = {};
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('stock_videos')
        .select('mood')
        .range(offset, offset + pageSize - 1);

      if (error || !data || data.length === 0) break;

      for (const row of data as Array<Record<string, unknown>>) {
        const mood = row.mood as string | null;
        if (mood) {
          counts[mood] = (counts[mood] || 0) + 1;
        }
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return Object.entries(counts)
      .map(([mood, count]) => ({ mood, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

/**
 * Get available scene types from the database with counts
 */
export async function getSceneTypeCounts(): Promise<{ sceneType: string; count: number }[]> {
  try {
    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_stock_scene_counts');
    if (!rpcError && rpcData && rpcData.length > 0) {
      return (rpcData as Array<{ scene_type: string; count: number }>)
        .map(r => ({ sceneType: r.scene_type, count: r.count }))
        .sort((a, b) => b.count - a.count);
    }

    // Fallback: paginate
    const counts: Record<string, number> = {};
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await supabase
        .from('stock_videos')
        .select('scene_type')
        .range(offset, offset + pageSize - 1);

      if (error || !data || data.length === 0) break;

      for (const row of data as unknown as Array<Record<string, unknown>>) {
        const sceneType = row.scene_type as string | null;
        if (sceneType) {
          counts[sceneType] = (counts[sceneType] || 0) + 1;
        }
      }

      if (data.length < pageSize) break;
      offset += pageSize;
    }

    return Object.entries(counts)
      .map(([sceneType, count]) => ({ sceneType, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}

// === GCS FALLBACK FUNCTIONS ===

async function listStockCategoriesFromGCS(): Promise<StockCategory[]> {
  try {
    const response = await fetch(`${GCS_API_BASE}?delimiter=/&maxResults=200`);
    if (!response.ok) throw new Error(`GCS API error: ${response.status}`);

    const data = await response.json();
    const prefixes: string[] = data.prefixes || [];

    return prefixes
      .filter(p => !p.startsWith('.'))
      .sort()
      .map(prefix => {
        const name = prefix.replace(/\/$/, '');
        return {
          id: name,
          name: formatCategoryName(name),
          icon: getCategoryIcon(name),
          path: prefix,
          rawName: name,
        };
      });
  } catch (error) {
    logger.error('StockGallery', 'GCS fallback failed for categories', error);
    throw error;
  }
}

async function listStockVideosFromGCS(categoryPath: string): Promise<StockVideo[]> {
  try {
    const allVideos: StockVideo[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({ prefix: categoryPath, maxResults: '500' });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(`${GCS_API_BASE}?${params}`);
      if (!response.ok) throw new Error(`GCS API error: ${response.status}`);

      const data = await response.json();
      const items: any[] = data.items || [];
      pageToken = data.nextPageToken;

      for (const item of items) {
        const name: string = item.name;
        if (!isVideoFile(name)) continue;
        const fileName = name.slice(categoryPath.length);
        if (fileName.includes('/')) continue;

        const size = parseInt(item.size || '0', 10);
        const url = `${GCS_BASE_URL}/${encodeGCSPath(name)}`;

        allVideos.push({
          id: name,
          name: extractDisplayName(fileName),
          url,
          thumbnailUrl: null,
          size,
          duration: extractDuration(fileName),
          mimeType: item.contentType || 'video/mp4',
          folder: categoryPath.replace(/\/$/, ''),
        });
      }
    } while (pageToken);

    return allVideos;
  } catch (error) {
    logger.error('StockGallery', 'GCS fallback failed for videos', error);
    throw error;
  }
}

async function searchStockVideosFromGCS(query: string): Promise<StockVideo[]> {
  try {
    const categories = await listStockCategoriesFromGCS();
    const allVideos: StockVideo[] = [];
    const searchCategories = categories.slice(0, 10);

    for (const cat of searchCategories) {
      const videos = await listStockVideosFromGCS(cat.path);
      const matches = videos.filter(v =>
        v.name.toLowerCase().includes(query.toLowerCase())
      );
      allVideos.push(...matches);
      if (allVideos.length >= 50) break;
    }

    return allVideos.slice(0, 50);
  } catch (error) {
    logger.error('StockGallery', 'GCS search fallback failed', error);
    return [];
  }
}

// === HELPERS ===

function isVideoFile(name: string): boolean {
  const ext = name.toLowerCase();
  return ext.endsWith('.mp4') || ext.endsWith('.mov') || ext.endsWith('.webm');
}

function encodeGCSPath(path: string): string {
  return path.split('/').map(s => encodeURIComponent(s)).join('/');
}

function extractDisplayName(fileName: string): string {
  return fileName
    .replace(/\.(mp4|webm|mov)$/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDuration(filename: string): number {
  const match = filename.match(/(\d+)s(?:ec)?\.?(mp4|webm|mov)$/i);
  if (match) return parseInt(match[1]);
  return 0;
}

function formatCategoryName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getCategoryIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('car')) return '🚗';
  if (lower.includes('animal')) return '🐾';
  if (lower.includes('city') || lower.includes('urban')) return '🌆';
  if (lower.includes('dark')) return '🌑';
  if (lower.includes('luxury') && lower.includes('woman')) return '👗';
  if (lower.includes('luxury') && lower.includes('lifestyle')) return '✨';
  if (lower.includes('luxury') && lower.includes('travel')) return '✈️';
  if (lower.includes('luxury')) return '💎';
  if (lower.includes('nature') || lower.includes('stunning')) return '🌿';
  if (lower.includes('training')) return '🎓';
  if (lower.includes('travel')) return '🗺️';
  if (lower.includes('new clip')) return '🆕';
  if (lower.includes('new luxury') || lower.includes('new-luxury')) return '💫';
  if (lower.includes('misc')) return '📂';
  return '🎬';
}
