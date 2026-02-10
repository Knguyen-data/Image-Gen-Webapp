import React from "react";
import { VeoRecordInfoResponse } from "../../services/veo3-types";

interface VeoResultsViewProps {
  taskId: string;
  status: "generating" | "success" | "failed";
  result?: VeoRecordInfoResponse;
  error?: string;
  progress?: string;
  onDownload?: (url: string) => void;
  onExtend?: () => void;
  onGet1080p?: () => void;
  onGet4k?: () => void;
  onRetry?: () => void;
}

const VeoResultsView: React.FC<VeoResultsViewProps> = ({
  taskId,
  status,
  result,
  error,
  progress,
  onDownload,
  onExtend,
  onGet1080p,
  onGet4k,
  onRetry,
}) => {
  const videoUrl = result?.data?.response?.resultUrls?.[0];
  const resolution = result?.data?.response?.resolution || "720p";

  if (status === "generating") {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 border-4 border-dash-500/30 border-t-dash-500 rounded-full animate-spin mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            Generating Video
          </h3>
          <p className="text-sm text-gray-400 mb-1">Task ID: {taskId}</p>
          {progress && <p className="text-xs text-gray-500">{progress}</p>}
        </div>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-red-800">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-red-400 mb-2">
            Generation Failed
          </h3>
          {error && (
            <p className="text-sm text-red-300/70 mb-4 text-center max-w-md">
              {error}
            </p>
          )}
          <p className="text-xs text-gray-500 mb-4">Task ID: {taskId}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-dash-600 hover:bg-dash-700 text-white rounded-lg transition-colors"
            >
              ↻ Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status === "success" && videoUrl) {
    return (
      <div className="bg-gray-900 rounded-lg p-6 border border-emerald-800">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium text-emerald-400 flex items-center">
              <svg
                className="w-5 h-5 mr-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              Video Generated Successfully
            </h3>
            <p className="text-xs text-gray-500 mt-1">Task ID: {taskId}</p>
          </div>
          <div className="text-xs text-gray-400 bg-gray-800 px-3 py-1 rounded">
            {resolution}
          </div>
        </div>

        {/* Video Player */}
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden mb-4">
          <video
            src={videoUrl}
            controls
            className="w-full h-full"
            preload="metadata"
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {onDownload && (
            <button
              onClick={() => onDownload(videoUrl)}
              className="flex items-center justify-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download
            </button>
          )}

          {onExtend && (
            <button
              onClick={onExtend}
              className="flex items-center justify-center px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Extend Video
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {onGet1080p && (
            <button
              onClick={onGet1080p}
              className="flex items-center justify-center px-4 py-2 bg-dash-600/20 hover:bg-dash-600/30 text-dash-400 border border-dash-600/30 rounded-lg transition-colors text-sm"
            >
              Get 1080P
            </button>
          )}

          {onGet4k && (
            <button
              onClick={onGet4k}
              className="flex items-center justify-center px-4 py-2 bg-dash-600/20 hover:bg-dash-600/30 text-dash-400 border border-dash-600/30 rounded-lg transition-colors text-sm"
            >
              Request 4K
            </button>
          )}
        </div>

        {/* Copy URL */}
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={videoUrl}
              readOnly
              className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs text-gray-400 focus:outline-none"
            />
            <button
              onClick={() => navigator.clipboard.writeText(videoUrl)}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors text-xs"
            >
              Copy URL
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default VeoResultsView;
