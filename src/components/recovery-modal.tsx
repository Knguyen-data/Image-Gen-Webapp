import { useState } from 'react';
import { requestManager } from '../services/request-manager';
import type { PendingRequest } from '../services/db';

interface RecoveryModalProps {
  requests: PendingRequest[];
  onClose: () => void;
  onResumeAll: () => void;
  onCancelAll: () => void;
}

export function RecoveryModal({ requests, onClose, onResumeAll, onCancelAll }: RecoveryModalProps) {
  const [resuming, setResuming] = useState<Set<string>>(new Set());

  async function resumeRequest(requestId: string) {
    setResuming(prev => new Set(prev).add(requestId));

    const request = await requestManager.getRequest(requestId);
    if (!request) return;

    // Emit event to resume polling
    window.dispatchEvent(new CustomEvent('resume-request', { detail: { request } }));

    setResuming(prev => {
      const next = new Set(prev);
      next.delete(requestId);
      return next;
    });
  }

  async function cancelRequest(requestId: string) {
    await requestManager.failRequest(requestId, 'User cancelled');
    onClose();
  }

  function formatAge(timestamp: number): string {
    const mins = Math.floor((Date.now() - timestamp) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4">
        <h2 className="text-2xl font-bold mb-4">Pending Requests Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Your previous session was interrupted. Would you like to recover these requests?
        </p>

        <div className="space-y-3 max-h-96 overflow-y-auto mb-6">
          {requests.map(req => (
            <div key={req.requestId} className="border dark:border-gray-700 rounded p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-sm bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded">
                    {req.type.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">{formatAge(req.createdAt)}</span>
                </div>
                <p className="text-gray-800 dark:text-gray-200 text-sm">{req.prompt.slice(0, 80)}...</p>
                {req.progress && (
                  <p className="text-xs text-gray-500 mt-1">{req.progress}</p>
                )}
              </div>

              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => resumeRequest(req.requestId)}
                  disabled={resuming.has(req.requestId)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {resuming.has(req.requestId) ? 'Resuming...' : 'Resume'}
                </button>
                <button
                  onClick={() => cancelRequest(req.requestId)}
                  className="px-4 py-2 bg-gray-300 dark:bg-gray-600 rounded hover:bg-gray-400 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onResumeAll}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Resume All ({requests.length})
          </button>
          <button
            onClick={onCancelAll}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Cancel All
          </button>
        </div>
      </div>
    </div>
  );
}
