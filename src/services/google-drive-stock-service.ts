/**
 * Google Drive Stock Footage Service
 * Lists and streams videos directly from Google Drive — no download/upload required.
 * 
 * Uses the Drive API with either:
 * - OAuth2 (for private folders)  
 * - API key (for publicly shared folders)
 */

import { logger } from './logger';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Get credentials from env or localStorage
function getApiKey(): string {
  return localStorage.getItem('google_drive_api_key') || '';
}

function getAccessToken(): string {
  return localStorage.getItem('google_drive_token') || '';
}

function hasAuth(): boolean {
  return !!(getAccessToken() || getApiKey());
}

/**
 * List files in a shared Drive folder
 */
export async function listFolderContents(
  folderId: string,
  pageToken?: string
): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
  const token = getAccessToken();
  const apiKey = getApiKey();
  
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'nextPageToken, files(id, name, mimeType, size, thumbnailLink, webContentLink, webViewLink, createdTime, modifiedTime)',
    pageSize: '50',
    orderBy: 'name',
  });

  if (pageToken) params.set('pageToken', pageToken);

  const authParam = token ? `Bearer ${token}` : `key=${apiKey}`;
  
  const response = await fetch(
    `${DRIVE_API_BASE}/files?${params}`,
    { headers: { Authorization: authParam } }
  );

  if (!response.ok) {
    const status = response.status;
    if (status === 403) {
      // Permission denied - likely OAuth scope issue or folder not accessible
      console.warn('[GoogleDrive] 403 Forbidden - folder may require specific permissions or be restricted');
      return { files: [], nextPageToken: undefined };
    }
    throw new Error(`Drive API error: ${status}`);
  }

  const data = await response.json();
  
  return {
    files: data.files.map((f: any) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: parseInt(f.size || '0'),
      thumbnailUrl: f.thumbnailLink,
      webUrl: f.webViewLink,
      downloadUrl: f.webContentLink,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
    })),
    nextPageToken: data.nextPageToken,
  };
}

/**
 * Search for videos by name/query
 */
export async function searchVideos(
  query: string,
  folderId?: string
): Promise<DriveFile[]> {
  const token = getAccessToken();
  const apiKey = getApiKey();

  const searchParts = [
    `name contains '${query.replace(/'/g, "\\'")}'`,
    `(mimeType contains 'video' or mimeType contains 'mp4')`,
    'trashed = false',
  ];

  if (folderId) {
    searchParts.push(`'${folderId}' in parents`);
  }

  const params = new URLSearchParams({
    q: searchParts.join(' and '),
    fields: 'files(id, name, mimeType, size, thumbnailLink, webContentLink, webViewLink, createdTime)',
    pageSize: '30',
    orderBy: 'relevance',
  });

  const authParam = token ? `Bearer ${token}` : `key=${apiKey}`;

  const response = await fetch(
    `${DRIVE_API_BASE}/files?${params}`,
    { headers: { Authorization: authParam } }
  );

  if (!response.ok) {
    throw new Error(`Drive search error: ${response.status}`);
  }

  const data = await response.json();
  
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: parseInt(f.size || '0'),
    thumbnailUrl: f.thumbnailLink,
    webUrl: f.webViewLink,
    downloadUrl: f.webContentLink,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
  }));
}

/**
 * Get a direct streaming URL for a video file
 * Drive requires auth for streaming, so we return a signed approach
 */
export async function getStreamingUrl(fileId: string): Promise<string> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Authentication required to stream videos');
  }

  // Get a short-lived download URL
  const response = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}?fields=webContentLink&access_token=${token}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new Error(`Failed to get streaming URL: ${response.status}`);
  }

  const data = await response.json();
  return data.webContentLink;
}

/**
 * Get video metadata for timeline display
 */
export async function getVideoMetadata(fileId: string): Promise<DriveFile | null> {
  const token = getAccessToken();
  const apiKey = getApiKey();

  const params = new URLSearchParams({
    fields: 'id, name, mimeType, size, thumbnailLink, videoMediaMetadata',
  });

  const authParam = token ? `Bearer ${token}` : `key=${apiKey}`;

  const response = await fetch(
    `${DRIVE_API_BASE}/files/${fileId}?${params}`,
    { headers: { Authorization: authParam } }
  );

  if (!response.ok) return null;

  const f = await response.json();
  
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    size: parseInt(f.size || '0'),
    thumbnailUrl: f.thumbnailLink,
    webUrl: f.webViewLink,
    downloadUrl: f.webContentLink,
    createdTime: f.createdTime,
    modifiedTime: f.modifiedTime,
  };
}

/**
 * Create a blob from a Drive video (for local processing)
 */
export async function downloadAsBlob(fileId: string): Promise<Blob> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Authentication required to download');
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status}`);
  }

  return response.blob();
}

/**
 * Types
 */
export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  thumbnailUrl?: string;
  webUrl?: string;
  downloadUrl?: string;
  createdTime: string;
  modifiedTime?: string;
}

/**
 * Auth helpers
 */
export async function initGoogleAuth(): Promise<void> {
  // This would initialize Google OAuth flow
  // For now, credentials are set manually in Settings
  logger.info('GoogleDrive', 'Auth initialized');
}

export function isAuthenticated(): boolean {
  return hasAuth();
}

export function getAuthUrl(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/auth/google/callback`;
  
  return `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.readonly')}` +
    `&access_type=offline`;
}
