// @ts-nocheck
/**
 * Admin Guard Component
 * Protects admin routes and checks permissions
 */

import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../../admin/hooks/useAdminAuth';
import { hasPermission, type Permission } from '../../admin/types/admin';
import { logger } from '../../services/logger';

interface AdminGuardProps {
  children: React.ReactNode;
  requiredPermission?: Permission;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({
  children,
  requiredPermission,
}) => {
  const { isAuthenticated, isLoading, adminUser, checkAdminStatus } = useAdminAuth();
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const verifyAccess = async () => {
      try {
        await checkAdminStatus();
      } catch (err) {
        logger.error('AdminGuard', 'Failed to check admin status', err);
      } finally {
        setIsChecking(false);
      }
    };

    verifyAccess();
  }, [checkAdminStatus]);

  // Show loading state
  if (isLoading || isChecking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-dash-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    logger.warn('AdminGuard', 'Unauthorized access attempt', { path: location.pathname });
    return <Navigate to="/auth?redirect=/admin" replace />;
  }

  // Check specific permission if required
  if (requiredPermission && !hasPermission(adminUser, requiredPermission)) {
    logger.warn('AdminGuard', 'Insufficient permissions', {
      path: location.pathname,
      required: requiredPermission,
      user: adminUser?.role,
    });
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 rounded-xl p-8 max-w-md w-full border border-gray-800">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white text-center mb-2">Access Denied</h2>
          <p className="text-gray-400 text-center mb-6">
            You don't have permission to access this area. Contact your administrator if you believe this is an error.
          </p>
          <button
            onClick={() => window.history.back()}
            className="w-full py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // Authorized - render children
  return <>{children}</>;
};

export default AdminGuard;

