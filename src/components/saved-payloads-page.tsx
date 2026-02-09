import { useState, useEffect } from 'react';

interface SavedPayload {
  id?: number;
  payloadId: string;
  name?: string;
  provider: string;
  params: any;
  savedAt: number;
  failureReason?: string;
  originalError?: string;
  retryCount: number;
  lastRetryAt?: number;
  status: 'pending' | 'retrying' | 'succeeded' | 'permanently-failed';
  resultVideoId?: string;
}

interface SavedPayloadsPageProps {
  payloads: SavedPayload[];
  onRetry: (payloadId: string) => void;
  onDelete: (payloadId: string) => void;
  onClose: () => void;
  onRefresh: () => void;
}

export function SavedPayloadsPage({ payloads, onRetry, onDelete, onClose, onRefresh }: SavedPayloadsPageProps) {
  useEffect(() => {
    onRefresh();
  }, []);

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Saved Payloads</h1>
          <p className="text-gray-600 dark:text-gray-400">{payloads.length} saved requests</p>
        </div>
        <button onClick={onClose} className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded hover:bg-gray-400">
          Close
        </button>
      </div>

      {payloads.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No saved payloads</p>
          <p className="text-sm mt-2">Failed requests will be saved here for retry</p>
        </div>
      ) : (
        <div className="space-y-4">
          {payloads.map(payload => (
            <div key={payload.payloadId} className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-0.5 rounded">
                      {payload.provider.toUpperCase()}
                    </span>

                    <span className={`text-xs px-2 py-0.5 rounded ${
                      payload.status === 'succeeded' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      payload.status === 'permanently-failed' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                      payload.status === 'retrying' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                    }`}>
                      {payload.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-800 dark:text-gray-200 mb-1">
                    {payload.params.prompt || 'No prompt'}
                  </p>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Saved {formatDate(payload.savedAt)}
                  </p>

                  {payload.failureReason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      ❌ {payload.failureReason}
                    </p>
                  )}

                  {payload.retryCount > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Retried {payload.retryCount} time{payload.retryCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  {payload.status === 'pending' && (
                    <button
                      onClick={() => onRetry(payload.payloadId)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      🔄 Retry
                    </button>
                  )}

                  <button
                    onClick={() => onDelete(payload.payloadId)}
                    className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Show params preview */}
              <details className="text-xs text-gray-600 dark:text-gray-400">
                <summary className="cursor-pointer">View Parameters</summary>
                <pre className="mt-2 bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-auto text-gray-900 dark:text-gray-100">
                  {JSON.stringify(payload.params, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
