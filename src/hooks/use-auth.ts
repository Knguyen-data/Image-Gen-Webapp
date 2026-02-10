import { useState, useEffect, useCallback } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';

export interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState(prev => ({
        ...prev,
        user: session?.user ?? null,
        session,
        loading: false,
      }));
    });

    // Listen for auth changes
    const { data: { subscription } = {} } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState(prev => ({
          ...prev,
          user: session?.user ?? null,
          session,
          loading: false,
          error: null,
        }));
      }
    );

    return () => {
        if (subscription) {
            subscription.unsubscribe();
        }
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message }));
      return false;
    }
    return true;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message }));
      return false;
    }
    // For sign-up, if no error but user is null (e.g., email confirmation required)
    // we should still consider it a success for the UI, but user isn't logged in yet.
    // The onAuthStateChange will handle logging in once confirmed.
    if (!data.user) {
        // This case might mean email confirmation is needed.
        // We can show a message to the user.
        setState(prev => ({ ...prev, loading: false, error: 'Please check your email to confirm your account.' }));
        return true; // Still a successful sign-up initiation
    }
    return true;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setState(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, []);

  const signOut = useCallback(async () => {
    setState(prev => ({ ...prev, loading: true }));
    await supabase.auth.signOut();
    setState({ user: null, session: null, loading: false, error: null });
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    isAuthenticated: !!state.user,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    signOut,
    clearError,
  };
}
