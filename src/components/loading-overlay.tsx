import React from 'react';

interface LoadingOverlayProps {
  message?: string;
  fullScreen?: boolean;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message = 'Loading...',
  fullScreen = false,
}) => {
  const containerClass = fullScreen
    ? 'fixed inset-0 bg-gray-950 z-[100] flex items-center justify-center'
    : 'flex items-center justify-center py-8';

  return (
    <div className={containerClass}>
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-dash-300 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gray-400 font-mono text-sm">{message}</p>
      </div>
    </div>
  );
};

export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border',
    md: 'w-8 h-8 border-2',
    lg: 'w-12 h-12 border-2',
  };

  return (
    <div className={`${sizeClasses[size]} border-dash-300 border-t-transparent rounded-full animate-spin`} />
  );
};

export default LoadingOverlay;
