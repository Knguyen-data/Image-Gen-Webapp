# Admin Dashboard Implementation Plan

## Overview

A comprehensive admin dashboard for monitoring, managing, and maintaining the Raw Studio application post-launch.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     ADMIN DASHBOARD                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Overview  │  │   Users     │  │  Analytics  │         │
│  │   Dashboard │  │ Management  │  │   & Metrics │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │System Health│  │   Content   │  │   Settings  │         │
│  │  Monitoring │  │  Moderation │  │  & Config   │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Admin API    │
                    │   Services    │
                    └───────────────┘
```

## Features

### 1. Overview Dashboard
- **Real-time Statistics**
  - Active users (online now)
  - Images generated today/this week/this month
  - Videos generated today/this week/this month
  - API usage by provider (Gemini, Seedream, ComfyUI, etc.)
  - Storage usage (IndexedDB + Supabase)
  
- **Quick Actions**
  - Broadcast message to all users
  - Emergency maintenance mode toggle
  - Clear cache/reset quotas
  - Export system logs

- **Recent Activity Feed**
  - Latest user registrations
  - Recent generations (with preview)
  - Error alerts and warnings
  - System events

### 2. User Management
- **User List**
  - Search/filter by email, name, status
  - Sort by registration date, last active, usage
  - Pagination (50/100/200 per page)
  - Export to CSV

- **User Details Panel**
  - Profile information
  - Generation history
  - Storage usage
  - API key status
  - Account status (active/banned/pending)

- **User Actions**
  - Ban/unban user
  - Reset password
  - Delete account (GDPR compliance)
  - Impersonate user (for support)
  - Adjust quotas/limits

### 3. Analytics & Metrics
- **Usage Analytics**
  - Daily/weekly/monthly active users (DAU/WAU/MAU)
  - Generation volume trends
  - Peak usage times
  - Geographic distribution
  
- **Performance Metrics**
  - Average generation time by model
  - Success/failure rates
  - API latency by provider
  - Error rate trends

- **Cost Analytics**
  - Estimated API costs by provider
  - Cost per user
  - Cost per generation
  - Budget alerts

- **Charts & Visualizations**
  - Line charts for trends
  - Bar charts for comparisons
  - Pie charts for distributions
  - Heatmaps for usage patterns

### 4. System Health Monitoring
- **Service Status**
  - Supabase connection status
  - Firebase connection status
  - External API health (Gemini, Seedream, etc.)
  - Storage quota status

- **Performance Metrics**
  - Database query performance
  - API response times
  - Client-side error rates
  - Memory usage trends

- **Alerts & Notifications**
  - Configurable alert thresholds
  - Email/Slack notifications
  - Alert history
  - Incident management

### 5. Content Moderation
- **Generated Content Queue**
  - Images pending review
  - Videos pending review
  - Auto-flagged content (NSFW detection)
  - User reports

- **Moderation Actions**
  - Approve/reject content
  - Bulk actions
  - Ban users for violations
  - Update moderation rules

- **Safety Settings**
  - NSFW detection sensitivity
  - Banned keywords list
  - Auto-moderation rules
  - Content retention policies

### 6. Settings & Configuration
- **System Settings**
  - Feature flags (enable/disable features)
  - Rate limiting configuration
  - Storage quotas
  - API timeout settings

- **Provider Configuration**
  - API key management
  - Provider enable/disable
  - Fallback provider settings
  - Cost optimization settings

- **Maintenance Tools**
  - Database cleanup
  - Cache invalidation
  - Log rotation
  - Backup/restore

## Technical Implementation

### Database Schema (Supabase)

```sql
-- Admin users table
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  role admin_role NOT NULL DEFAULT 'moderator',
  permissions JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- System logs table
CREATE TABLE system_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level log_level NOT NULL,
  context TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User activity analytics
CREATE TABLE user_activity_daily (
  date DATE PRIMARY KEY,
  active_users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  images_generated INTEGER DEFAULT 0,
  videos_generated INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  storage_used BIGINT DEFAULT 0
);

-- Content moderation queue
CREATE TABLE moderation_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  user_id UUID,
  status moderation_status DEFAULT 'pending',
  reason TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### File Structure

```
src/
├── admin/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AdminLayout.tsx
│   │   │   ├── AdminSidebar.tsx
│   │   │   └── AdminHeader.tsx
│   │   ├── dashboard/
│   │   │   ├── StatCard.tsx
│   │   │   ├── ActivityFeed.tsx
│   │   │   └── QuickActions.tsx
│   │   ├── users/
│   │   │   ├── UserTable.tsx
│   │   │   ├── UserFilters.tsx
│   │   │   └── UserDetailModal.tsx
│   │   ├── analytics/
│   │   │   ├── ChartCard.tsx
│   │   │   ├── DateRangePicker.tsx
│   │   │   └── MetricSelector.tsx
│   │   ├── moderation/
│   │   │   ├── ContentQueue.tsx
│   │   │   ├── ModerationCard.tsx
│   │   │   └── SafetySettings.tsx
│   │   └── system/
│   │       ├── ServiceStatus.tsx
│   │       ├── AlertConfig.tsx
│   │       └── MaintenanceTools.tsx
│   ├── hooks/
│   │   ├── useAdminAuth.ts
│   │   ├── useUserManagement.ts
│   │   ├── useAnalytics.ts
│   │   ├── useSystemHealth.ts
│   │   └── useModeration.ts
│   ├── services/
│   │   ├── admin-api.ts
│   │   ├── analytics-api.ts
│   │   └── moderation-api.ts
│   ├── types/
│   │   └── admin.ts
│   ├── utils/
│   │   ├── permissions.ts
│   │   └── formatters.ts
│   └── pages/
│       ├── AdminDashboard.tsx
│       ├── UserManagement.tsx
│       ├── Analytics.tsx
│       ├── SystemHealth.tsx
│       ├── Moderation.tsx
│       └── Settings.tsx
├── components/
│   └── guards/
│       └── AdminGuard.tsx
└── services/
    └── admin-service.ts
```

### Routes

```typescript
// Admin routes (protected)
/admin                 → AdminDashboard
/admin/users           → UserManagement
/admin/analytics       → Analytics
/admin/system          → SystemHealth
/admin/moderation      → Moderation
/admin/settings        → Settings
```

### Permissions System

```typescript
type AdminRole = 'superadmin' | 'admin' | 'moderator' | 'support';

type Permission =
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'content:moderate'
  | 'analytics:read'
  | 'system:read'
  | 'system:write'
  | 'settings:read'
  | 'settings:write';

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  superadmin: ['*'], // All permissions
  admin: ['users:read', 'users:write', 'analytics:read', 'system:read', 'settings:read'],
  moderator: ['users:read', 'content:moderate'],
  support: ['users:read'],
};
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [ ] Set up admin routes and navigation
- [ ] Create AdminGuard component
- [ ] Implement admin authentication
- [ ] Create database tables and RLS policies
- [ ] Build admin layout (sidebar, header)

### Phase 2: Dashboard & Users (Week 2)
- [ ] Overview dashboard with real-time stats
- [ ] User management list and filters
- [ ] User detail view
- [ ] Basic user actions (ban/unban)

### Phase 3: Analytics (Week 3)
- [ ] Usage analytics charts
- [ ] Performance metrics
- [ ] Cost tracking
- [ ] Export functionality

### Phase 4: System & Moderation (Week 4)
- [ ] System health monitoring
- [ ] Alert configuration
- [ ] Content moderation queue
- [ ] Safety settings

## Security Considerations

1. **Authentication**
   - Require 2FA for admin accounts
   - Session timeout after 30 minutes
   - IP whitelist option
   - Audit log for all admin actions

2. **Authorization**
   - Role-based access control (RBAC)
   - Principle of least privilege
   - Regular permission audits

3. **Data Protection**
   - Encrypt sensitive data at rest
   - Secure API endpoints
   - Rate limiting on admin APIs
   - Input validation and sanitization

## Launch Checklist

- [ ] Admin dashboard fully functional
- [ ] All admin users have 2FA enabled
- [ ] Audit logging is active
- [ ] Alert system configured
- [ ] Documentation complete
- [ ] Training materials prepared
- [ ] Backup and recovery tested
- [ ] Performance monitoring active
