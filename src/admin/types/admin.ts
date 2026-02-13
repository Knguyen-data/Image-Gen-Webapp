/**
 * Admin Dashboard Types
 */

export type AdminRole = 'superadmin' | 'admin' | 'moderator' | 'support';

export type Permission =
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'content:moderate'
  | 'analytics:read'
  | 'system:read'
  | 'system:write'
  | 'settings:read'
  | 'settings:write';

export interface AdminUser {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: AdminRole;
  permissions: Permission[];
  createdAt: string;
  lastLogin: string | null;
}

export interface DashboardStats {
  // User stats
  totalUsers: number;
  activeUsersToday: number;
  newUsersToday: number;
  
  // Generation stats
  imagesGeneratedToday: number;
  imagesGeneratedThisWeek: number;
  imagesGeneratedThisMonth: number;
  videosGeneratedToday: number;
  videosGeneratedThisWeek: number;
  videosGeneratedThisMonth: number;
  
  // API usage
  apiCallsToday: number;
  apiUsageByProvider: Record<string, number>;
  
  // Storage
  storageUsed: number;
  storageQuota: number;
}

export interface UserActivity {
  id: string;
  userId: string;
  email: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SystemLog {
  id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  context: string;
  message: string;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  createdAt: string;
}

export interface UserDetails {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastActive: string | null;
  status: 'active' | 'banned' | 'pending';
  role: 'user' | 'admin' | 'moderator';
  
  // Usage stats
  totalGenerations: number;
  storageUsed: number;
  apiCallsThisMonth: number;
  
  // Settings
  settings: Record<string, unknown>;
}

export interface ModerationItem {
  id: string;
  contentType: 'image' | 'video';
  contentId: string;
  userId: string;
  userEmail: string;
  previewUrl: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  autoFlagged: boolean;
  confidenceScore: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  latency: number;
  lastChecked: string;
  message: string | null;
}

export interface AlertConfig {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  enabled: boolean;
  notifyEmail: string[];
  notifySlack: string | null;
}

export interface AnalyticsData {
  date: string;
  activeUsers: number;
  newUsers: number;
  imagesGenerated: number;
  videosGenerated: number;
  apiCalls: number;
  errors: number;
}

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  superadmin: ['users:read', 'users:write', 'users:delete', 'content:moderate', 'analytics:read', 'system:read', 'system:write', 'settings:read', 'settings:write'],
  admin: ['users:read', 'users:write', 'analytics:read', 'system:read', 'settings:read'],
  moderator: ['users:read', 'content:moderate'],
  support: ['users:read'],
};

export function hasPermission(user: AdminUser | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return user.permissions.includes(permission);
}
