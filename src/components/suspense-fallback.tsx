/**
 * Suspense Fallback Components
 * Loading states for lazy-loaded components
 */

import React from 'react';

interface SuspenseFallbackProps {
  message?: string;
  minHeight?: string;
}

export const SuspenseFallback: React.FC<SuspenseFallbackProps> = ({ 
  message = 'Loading...', 
  minHeight = '200px' 
}) => (
  <div 
    className="flex items-center justify-center w-full"
    style={{ minHeight }}
  >
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      <span className="text-sm text-white/60">{message}</span>
    </div>
  </div>
);

export const ModalSuspenseFallback: React.FC = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50">
    <div className="flex flex-col items-center gap-3 p-8 bg-[#1a1a1a] rounded-xl border border-white/10">
      <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      <span className="text-sm text-white/60">Loading...</span>
    </div>
  </div>
);

export const PanelSuspenseFallback: React.FC = () => (
  <div className="w-full h-full flex items-center justify-center p-8">
    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
);
