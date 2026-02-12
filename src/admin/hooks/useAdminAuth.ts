/**
 * Admin Authentication Hook
 * Manages admin user state and permissions
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabase';
import { logger } from '../../services/logger';
import type { AdminUser } from '../types/admin';

interface UseAdminAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  adminUser: AdminUser | null;
  error: Error | null;
  checkAdminStatus: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAdminAuth(): UseAdminAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const checkAdminStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setIsAuthenticated(false);
        setAdminUser(null);
        return;
      }

      // Check if user is an admin
      const { data: adminData, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (adminError || !adminData) {
        setIsAuthenticated(false);
        setAdminUser(null);
        return;
      }

      // Get user profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', session.user.id)
        .single();

      const admin: AdminUser = {
        id: adminData.id,
        userId: session.user.id,
        email: session.user.email || '',
        displayName: profile?.display_name || session.user.email || 'Admin',
        role: adminData.role,
        permissions: adminData.permissions || [],
        createdAt: adminData.created_at,
        lastLogin: adminData.last_login,
      };

      setAdminUser(admin);
      setIsAuthenticated(true);

      // Update last login
      await supabase
        .from('admin_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', adminData.id);

    } catch (err) {
      logger.error('useAdminAuth', 'Failed to check admin status', err);
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setIsAuthenticated(false);
      setAdminUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw new Error(signInError.message);
      }

      await checkAdminStatus();

      if (!isAuthenticated) {
        throw new Error('You do not have admin privileges');
      }

      logger.info('useAdminAuth', 'Admin logged in', { email });
    } catch (err) {
      logger.error('useAdminAuth', 'Login failed', err);
      setError(err instanceof Error ? err : new Error('Login failed'));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [checkAdminStatus, isAuthenticated]);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await supabase.auth.signOut();
      setIsAuthenticated(false);
      setAdminUser(null);
      logger.info('useAdminAuth', 'Admin logged out');
    } catch (err) {
      logger.error('useAdminAuth', 'Logout failed', err);
      setError(err instanceof Error ? err : new Error('Logout failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAdminStatus();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkAdminStatus]);

  return {
    isAuthenticated,
    isLoading,
    adminUser,
    error,
    checkAdminStatus,
    login,
    logout,
  };
}

export default useAdminAuth;
