interface SavePayloadDialogProps {
  payload: {
    payloadId: string;
    provider: string;
    params: any;
    failureReason?: string;
  };
  onClose: () => void;
  onRetryNow: () => void;
  onViewSaved: () => void;
}

export function SavePayloadDialog({ payload, onClose, onRetryNow, onViewSaved }: SavePayloadDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">❌ Generation Failed</h2>

        <div className="space-y-3 mb-6">
          <p className="text-gray-700 dark:text-gray-300">
            {payload.failureReason || 'An error occurred during generation'}
          </p>

          <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 text-sm">
            <p className="text-gray-900 dark:text-white"><strong>Provider:</strong> {payload.provider.toUpperCase()}</p>
            <p className="text-gray-900 dark:text-white"><strong>Prompt:</strong> {payload.params.prompt?.slice(0, 60) || 'N/A'}...</p>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your request has been saved. You can retry it later when the service is available.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onRetryNow}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            🔄 Retry Now
          </button>

          <button
            onClick={onViewSaved}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            📋 View Saved Requests
          </button>

          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-white rounded hover:bg-gray-400"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
