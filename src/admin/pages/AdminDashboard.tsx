/**
 * Admin Dashboard Page
 * Overview and quick actions for administrators
 */

import React, { useEffect, useState } from 'react';
import AdminLayout from '../components/layout/AdminLayout';
import { adminApi } from '../services/admin-api';
import { logger } from '../../services/logger';
import type { DashboardStats, SystemLog } from '../types/admin';

// Stat Card Component
interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, change, changeType = 'neutral', icon }) => (
  <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-gray-400 text-sm">{title}</p>
        <p className="text-2xl font-bold text-white mt-1">{value}</p>
        {change && (
          <p className={`text-sm mt-1 ${
            changeType === 'positive' ? 'text-green-400' :
            changeType === 'negative' ? 'text-red-400' :
            'text-gray-400'
          }`}>
            {change}
          </p>
        )}
      </div>
      <div className="p-3 bg-gray-800 rounded-lg text-gray-400">
        {icon}
      </div>
    </div>
  </div>
);

// Activity Item Component
interface ActivityItemProps {
  action: string;
  user: string;
  time: string;
  metadata?: Record<string, unknown>;
}

const ActivityItem: React.FC<ActivityItemProps> = ({ action, user, time, metadata }) => (
  <div className="flex items-start gap-3 py-3 border-b border-gray-800 last:border-0">
    <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
      <span className="text-gray-400 text-xs">{user.charAt(0).toUpperCase()}</span>
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-white text-sm">
        <span className="font-medium">{user}</span>
        {' '}{action}
      </p>
      {metadata && Object.keys(metadata).length > 0 && (
        <p className="text-gray-500 text-xs mt-0.5 truncate">
          {JSON.stringify(metadata).slice(0, 100)}...
        </p>
      )}
      <p className="text-gray-600 text-xs mt-1">{time}</p>
    </div>
  </div>
);

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        const [statsData, logsData] = await Promise.all([
          adminApi.getDashboardStats(),
          adminApi.getSystemLogs({ limit: 10 }),
        ]);
        setStats(statsData);
        setLogs(logsData.logs);
      } catch (err) {
        logger.error('AdminDashboard', 'Failed to load dashboard data', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-10 h-10 border-2 border-dash-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of your application</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers || 0}
          change={`+${stats?.newUsersToday || 0} today`}
          changeType="positive"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard
          title="Active Today"
          value={stats?.activeUsersToday || 0}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          title="Images Today"
          value={stats?.imagesGeneratedToday || 0}
          change={`${stats?.imagesGeneratedThisWeek || 0} this week`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          title="Videos Today"
          value={stats?.videosGeneratedToday || 0}
          change={`${stats?.videosGeneratedThisWeek || 0} this week`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          }
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-semibold mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <button className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
              </svg>
              Broadcast Message
            </button>
            <button className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Maintenance Mode
            </button>
            <button className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              Clear Cache
            </button>
            <button className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export Logs
            </button>
          </div>
        </div>

        {/* API Usage */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <h3 className="text-white font-semibold mb-4">API Usage Today</h3>
          <div className="space-y-4">
            {Object.entries(stats?.apiUsageByProvider || {}).map(([provider, count]) => (
              <div key={provider} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-dash-400" />
                  <span className="text-gray-300 text-sm capitalize">{provider}</span>
                </div>
                <span className="text-white font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(stats?.apiUsageByProvider || {}).length === 0 && (
              <p className="text-gray-500 text-sm">No API calls today</p>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Recent Activity</h3>
            <button className="text-dash-400 text-sm hover:text-dash-300 transition-colors">
              View all
            </button>
          </div>
          <div className="space-y-1">
            {logs.slice(0, 5).map(log => (
              <ActivityItem
                key={log.id}
                action={log.message}
                user={log.userId || 'System'}
                time={new Date(log.createdAt).toLocaleTimeString()}
                metadata={log.metadata || undefined}
              />
            ))}
            {logs.length === 0 && (
              <p className="text-gray-500 text-sm py-4">No recent activity</p>
            )}
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="mt-8 bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h3 className="text-white font-semibold mb-4">System Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div>
              <p className="text-white text-sm font-medium">Supabase</p>
              <p className="text-gray-500 text-xs">Operational</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div>
              <p className="text-white text-sm font-medium">Firebase</p>
              <p className="text-gray-500 text-xs">Operational</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-800/50 rounded-lg">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <div>
              <p className="text-white text-sm font-medium">Gemini API</p>
              <p className="text-gray-500 text-xs">Operational</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
