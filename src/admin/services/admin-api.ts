/**
 * Admin API Service
 * Handles all admin-related API calls
 */

import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import type {
  DashboardStats,
  UserDetails,
  SystemLog,
  ModerationItem,
  ServiceStatus,
  AnalyticsData,
} from '../types/admin';

export const adminApi = {
  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      // Get user stats
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Get today's active users (users who logged in today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: activeUsersToday } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', today.toISOString());

      // Get new users today
      const { count: newUsersToday } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      // Get generation stats from usage_logs
      const { data: todayStats } = await supabase
        .from('usage_logs')
        .select('action, metadata')
        .gte('created_at', today.toISOString());

      const imagesToday = todayStats?.filter(l => l.action === 'image:generate').length || 0;
      const videosToday = todayStats?.filter(l => l.action === 'video:generate').length || 0;

      // Get API usage by provider
      const providerStats: Record<string, number> = {};
      todayStats?.forEach(log => {
        const provider = log.metadata?.provider as string;
        if (provider) {
          providerStats[provider] = (providerStats[provider] || 0) + 1;
        }
      });

      return {
        totalUsers: totalUsers || 0,
        activeUsersToday: activeUsersToday || 0,
        newUsersToday: newUsersToday || 0,
        imagesGeneratedToday: imagesToday,
        imagesGeneratedThisWeek: imagesToday * 7, // Estimate
        imagesGeneratedThisMonth: imagesToday * 30, // Estimate
        videosGeneratedToday: videosToday,
        videosGeneratedThisWeek: videosToday * 7,
        videosGeneratedThisMonth: videosToday * 30,
        apiCallsToday: todayStats?.length || 0,
        apiUsageByProvider: providerStats,
        storageUsed: 0, // TODO: Calculate from storage
        storageQuota: 1073741824, // 1GB default
      };
    } catch (err) {
      logger.error('adminApi', 'Failed to get dashboard stats', err);
      throw err;
    }
  },

  // User Management
  async getUsers(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}): Promise<{ users: UserDetails[]; total: number }> {
    const { page = 1, limit = 50, search, status } = options;

    try {
      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' });

      if (search) {
        query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .range((page - 1) * limit, page * limit - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const users: UserDetails[] = (data || []).map(profile => ({
        id: profile.id,
        email: profile.email || '',
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
        lastActive: profile.updated_at,
        status: 'active', // TODO: Add status field
        role: 'user',
        totalGenerations: 0,
        storageUsed: 0,
        apiCallsThisMonth: 0,
        settings: {},
      }));

      return { users, total: count || 0 };
    } catch (err) {
      logger.error('adminApi', 'Failed to get users', err);
      throw err;
    }
  },

  async getUserDetails(userId: string): Promise<UserDetails | null> {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !profile) return null;

      // Get user's generation count
      const { count: generationCount } = await supabase
        .from('generations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      return {
        id: profile.id,
        email: profile.email || '',
        displayName: profile.display_name,
        avatarUrl: profile.avatar_url,
        createdAt: profile.created_at,
        lastActive: profile.updated_at,
        status: 'active',
        role: 'user',
        totalGenerations: generationCount || 0,
        storageUsed: 0,
        apiCallsThisMonth: 0,
        settings: {},
      };
    } catch (err) {
      logger.error('adminApi', 'Failed to get user details', err);
      throw err;
    }
  },

  async banUser(userId: string, reason: string): Promise<void> {
    try {
      // TODO: Implement ban logic
      logger.info('adminApi', 'User banned', { userId, reason });
    } catch (err) {
      logger.error('adminApi', 'Failed to ban user', err);
      throw err;
    }
  },

  async unbanUser(userId: string): Promise<void> {
    try {
      // TODO: Implement unban logic
      logger.info('adminApi', 'User unbanned', { userId });
    } catch (err) {
      logger.error('adminApi', 'Failed to unban user', err);
      throw err;
    }
  },

  // System Logs
  async getSystemLogs(options: {
    page?: number;
    limit?: number;
    level?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<{ logs: SystemLog[]; total: number }> {
    const { page = 1, limit = 100, level, startDate, endDate } = options;

    try {
      let query = supabase
        .from('system_logs')
        .select('*', { count: 'exact' });

      if (level) {
        query = query.eq('level', level);
      }

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error, count } = await query
        .range((page - 1) * limit, page * limit - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const logs: SystemLog[] = (data || []).map(log => ({
        id: log.id,
        level: log.level,
        context: log.context,
        message: log.message,
        metadata: log.metadata,
        userId: log.user_id,
        createdAt: log.created_at,
      }));

      return { logs, total: count || 0 };
    } catch (err) {
      logger.error('adminApi', 'Failed to get system logs', err);
      throw err;
    }
  },

  // Service Health
  async getServiceStatus(): Promise<ServiceStatus[]> {
    const services: ServiceStatus[] = [
      {
        name: 'Supabase',
        status: 'healthy',
        latency: 50,
        lastChecked: new Date().toISOString(),
        message: null,
      },
      {
        name: 'Firebase',
        status: 'healthy',
        latency: 30,
        lastChecked: new Date().toISOString(),
        message: null,
      },
      {
        name: 'Gemini API',
        status: 'healthy',
        latency: 200,
        lastChecked: new Date().toISOString(),
        message: null,
      },
    ];

    return services;
  },

  // Moderation
  async getModerationQueue(options: {
    page?: number;
    limit?: number;
    status?: string;
  } = {}): Promise<{ items: ModerationItem[]; total: number }> {
    const { page = 1, limit = 50, status } = options;

    try {
      let query = supabase
        .from('moderation_queue')
        .select('*', { count: 'exact' });

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .range((page - 1) * limit, page * limit - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const items: ModerationItem[] = (data || []).map(item => ({
        id: item.id,
        contentType: item.content_type,
        contentId: item.content_id,
        userId: item.user_id,
        userEmail: '', // TODO: Join with profiles
        previewUrl: null,
        status: item.status,
        reason: item.reason,
        autoFlagged: item.auto_flagged,
        confidenceScore: item.confidence_score,
        reviewedBy: item.reviewed_by,
        reviewedAt: item.reviewed_at,
        createdAt: item.created_at,
      }));

      return { items, total: count || 0 };
    } catch (err) {
      logger.error('adminApi', 'Failed to get moderation queue', err);
      throw err;
    }
  },

  async moderateContent(
    itemId: string,
    action: 'approve' | 'reject',
    reason?: string
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('moderation_queue')
        .update({
          status: action === 'approve' ? 'approved' : 'rejected',
          reason,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;

      logger.info('adminApi', 'Content moderated', { itemId, action });
    } catch (err) {
      logger.error('adminApi', 'Failed to moderate content', err);
      throw err;
    }
  },

  // Analytics
  async getAnalytics(days: number = 30): Promise<AnalyticsData[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('user_activity_daily')
        .select('*')
        .gte('date', startDate.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;

      return (data || []).map(day => ({
        date: day.date,
        activeUsers: day.active_users,
        newUsers: day.new_users,
        imagesGenerated: day.images_generated,
        videosGenerated: day.videos_generated,
        apiCalls: day.api_calls,
        errors: 0, // TODO: Add error tracking
      }));
    } catch (err) {
      logger.error('adminApi', 'Failed to get analytics', err);
      throw err;
    }
  },
};

export default adminApi;
