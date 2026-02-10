import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthTab = 'signIn' | 'signUp';

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const {
    loading,
    error,
    signInWithEmail,
    signUpWithEmail,
    signInWithGoogle,
    clearError,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      clearError();
      setEmail('');
      setPassword('');
      setActiveTab('signIn'); // Reset to sign in when opening
    }
  }, [isOpen, clearError]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    let success = false;
    if (activeTab === 'signIn') {
      success = await signInWithEmail(email, password);
    } else {
      success = await signUpWithEmail(email, password);
    }
    if (success) {
      onClose();
    }
  };

  const handleGoogleSignIn = async () => {
    clearError();
    await signInWithGoogle();
    // Google sign-in handles redirection, so modal will close automatically
    // or auth state will update and then modal might close
  };

  const currentError = error; // Use the error from useAuth hook

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="backdrop-blur-2xl bg-white/90 dark:bg-gray-900/90 rounded-2xl border border-dash-300/30 rounded-xl w-full max-w-md shadow-2xl relative">
        <div className="p-6 space-y-4">
          {/* Tab Bar */}
          <div className="flex border-b border-gray-800 -mt-2 mb-4">
            <button
              onClick={() => { setActiveTab('signIn'); clearError(); }}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'signIn'
                  ? 'text-dash-300 border-dash-300'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setActiveTab('signUp'); clearError(); }}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === 'signUp'
                  ? 'text-dash-300 border-dash-300'
                  : 'text-gray-500 hover:text-gray-300 border-transparent'
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-dash-900/50 rounded-full flex items-center justify-center mx-auto mb-3 text-dash-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.041 6.84-2.828 9.646M12 11c0 3.517 1.041 6.84 2.828 9.646m-5.656-9.646l-2.071 2.071m2.071-2.071c-.787-.788-.787-2.071 0-2.859m-5.656 9.646l2.071-2.071m2.071 2.071c.788.787 2.071.787 2.859 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            </div>
            <h3 className="text-xl font-bold text-white">
              {activeTab === 'signIn' ? 'Sign In' : 'Sign Up'}
            </h3>
            <p className="text-sm text-gray-400 mt-2">
              {activeTab === 'signIn'
                ? 'Sign in to access advanced features.'
                : 'Create an account to get started.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                className={`w-full bg-gray-950 border ${
                  currentError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-dash-300'
                } rounded-lg py-3 pl-4 pr-4 text-sm text-white focus:ring-2 focus:border-transparent outline-none font-mono disabled:opacity-50 transition-colors`}
                placeholder="Email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="relative">
              <input
                type={isPasswordVisible ? "text" : "password"}
                className={`w-full bg-gray-950 border ${
                  currentError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:ring-dash-300'
                } rounded-lg py-3 pl-4 pr-10 text-sm text-white focus:ring-2 focus:border-transparent outline-none font-mono disabled:opacity-50 transition-colors`}
                placeholder="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                className="absolute right-3 top-3 text-gray-500 hover:text-gray-300"
                disabled={loading}
              >
                {isPasswordVisible ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>

            {currentError && (
              <div className="text-xs text-red-400 font-medium animate-in slide-in-from-top-1 flex items-center gap-1">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="break-all">{currentError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className={`w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-dash-900 bg-dash-300 hover:bg-dash-200`}
            >
              {loading && <div className="w-4 h-4 border-2 border-dash-900 border-t-transparent rounded-full animate-spin"></div>}
              {activeTab === 'signIn' ? (loading ? 'Signing In...' : 'Sign In') : (loading ? 'Signing Up...' : 'Sign Up')}
            </button>
          </form>

          <div className="relative flex items-center py-4">
            <div className="flex-grow border-t border-gray-800"></div>
            <span className="flex-shrink mx-4 text-gray-500 text-sm">OR</span>
            <div className="flex-grow border-t border-gray-800"></div>
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
            <svg className="w-4 h-4" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M43.611 20.0833H42V20H24V28H36.4442C35.8373 30.5847 34.0531 32.6577 31.5645 34.0044L31.5833 34.225C34.9083 36.6215 39.06 38 43.611 38C45.3888 38 47.0583 37.74 48 37.2842V31.8483C47.0583 32.1087 45.3888 32.25 43.611 32.25C40.6625 32.25 38.0772 31.0667 36.4442 28H43.611V20.0833Z" fill="#4285F4"/>
              <path d="M6 24C6 26.9696 7.18524 29.8291 9.3934 32.0373C11.6016 34.2455 14.4611 35.4307 17.4307 35.4307C20.3993 35.4307 23.2598 34.2465 25.467 32.0373L31.5833 38.1537C28.3248 40.597 23.9575 42 17.4307 42C12.335 42 7.64547 39.9916 4.14844 36.4946L6 24Z" fill="#34A853"/>
              <path d="M6 24C6 21.0304 7.18524 18.1709 9.3934 15.9627C11.6016 13.7545 14.4611 12.5693 17.4307 12.5693C20.3993 12.5693 23.2598 13.7535 25.467 15.9627L31.5833 9.8463C28.3248 7.403 23.9575 6 17.4307 6C12.335 6 7.64547 8.00835 4.14844 11.5054L6 24Z" fill="#FBBC04"/>
              <path d="M43.611 20.0833H24V28H36.4442C35.3211 32.2137 31.5645 34.0044 31.5645 34.0044L31.5833 34.225L38.0772 39.9056C38.0772 39.9056 41.5238 39.9916 43.611 38V37.2842C47.0583 37.74 48 37.2842 48 37.2842L43.611 20.0833Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="text-center mt-4">
            <button
              onClick={onClose}
              disabled={loading}
              className="text-xs text-gray-400 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
