import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../hooks/use-auth';

interface UserMenuProps {
  onOpenAuthModal: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ onOpenAuthModal }) => {
  const { user, signOut, isAuthenticated, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const getInitials = (name: string | undefined | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (
      menuRef.current &&
      !menuRef.current.contains(event.target as Node) &&
      buttonRef.current &&
      !buttonRef.current.contains(event.target as Node)
    ) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white text-sm animate-pulse">
        ...
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <button
        onClick={onOpenAuthModal}
        className="px-3 py-1.5 rounded-md bg-dash-300 text-dash-900 text-sm font-medium hover:bg-dash-200 transition-colors"
      >
        Sign In
      </button>
    );
  }

  const userEmail = user?.email || 'N/A';
  const userAvatar = user?.user_metadata?.avatar_url;
  const userName = user?.user_metadata?.full_name || user?.email;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 focus:outline-none"
      >
        {userAvatar ? (
          <img
            src={userAvatar}
            alt="User Avatar"
            className="w-8 h-8 rounded-full border border-gray-700 object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-semibold border border-gray-600">
            {getInitials(userName)}
          </div>
        )}
        <span className="hidden md:block text-white text-sm font-medium">
          {userName?.split(' ')[0] || 'User'}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 transform transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-md shadow-lg py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="block px-4 py-2 text-xs text-gray-400 border-b border-gray-700">
            {userEmail}
          </div>
          <button
            onClick={() => {
              // Handle settings logic here
              setIsOpen(false);
            }}
            className="block w-full text-left px-4 py-2 text-sm text-white hover:bg-gray-700 transition-colors"
          >
            Settings
          </button>
          <button
            onClick={handleSignOut}
            className="block w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
