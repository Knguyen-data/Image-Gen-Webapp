import React, { useState } from 'react';
import { ActivityJob, ActivityLog } from '../hooks/use-activity-queue';

interface ActivityPanelProps {
  jobs: ActivityJob[];
  logs: ActivityLog[];
  onClearCompleted: () => void;
}

const getStatusIcon = (status: ActivityJob['status']) => {
  switch (status) {
    case 'pending': return '⏳';
    case 'active': return '🔄';
    case 'completed': return '✅';
    case 'failed': return '❌';
  }
};

const getTypeIcon = (type: ActivityJob['type']) => {
  switch (type) {
    case 'image': return '🖼️';
    case 'video': return '🎬';
    case 'edit': return '✏️';
  }
};

const getLogLevelColor = (level: ActivityLog['level']) => {
  switch (level) {
    case 'info': return 'text-gray-400';
    case 'warn': return 'text-yellow-400';
    case 'error': return 'text-red-400';
  }
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', { hour12: false });
};

const ActivityPanel: React.FC<ActivityPanelProps> = ({ jobs, logs, onClearCompleted }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  const activeJobs = jobs.filter(j => j.status === 'active' || j.status === 'pending');
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed');
  const hasCompletedJobs = completedJobs.length > 0;

  // Don't show panel if no jobs
  if (jobs.length === 0 && logs.length === 0) return null;

  // Minimized badge
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="fixed bottom-4 right-4 z-[60] px-4 py-2 bg-gray-900 border border-gray-700 rounded-full shadow-lg hover:bg-gray-800 transition-all flex items-center gap-2 text-sm text-gray-200"
      >
        <span className="text-yellow-400">⚡</span>
        <span>{activeJobs.length > 0 ? `${activeJobs.length} job${activeJobs.length > 1 ? 's' : ''} running` : 'Activity'}</span>
        {hasCompletedJobs && (
          <span className="ml-1 text-xs text-gray-500">+{completedJobs.length}</span>
        )}
      </button>
    );
  }

  // Expanded panel
  return (
    <div className="fixed bottom-4 right-4 z-[60] w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800/50">
        <h3 className="font-semibold text-gray-200">Activity</h3>
        <div className="flex items-center gap-2">
          {hasCompletedJobs && (
            <button
              onClick={onClearCompleted}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              title="Clear completed jobs"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setIsExpanded(false)}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-gray-200 transition-colors"
            title="Minimize"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Jobs list */}
      <div className="max-h-48 overflow-y-auto">
        {jobs.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-500 text-sm">
            No active jobs
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {jobs.map(job => (
              <div key={job.id} className="px-4 py-2 flex items-center gap-3">
                <span>{getTypeIcon(job.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">
                    {job.prompt.slice(0, 40)}{job.prompt.length > 40 ? '...' : ''}
                  </p>
                  {job.error && (
                    <p className="text-xs text-red-400 truncate">{job.error}</p>
                  )}
                </div>
                <span className="text-lg" title={job.status}>{getStatusIcon(job.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logs section */}
      <div className="border-t border-gray-700">
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-400 hover:bg-gray-800/50 transition-colors"
        >
          <span>📋 Logs</span>
          <svg
            className={`w-4 h-4 transition-transform ${showLogs ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showLogs && (
          <div className="max-h-32 overflow-y-auto bg-gray-950 px-3 py-2 text-xs font-mono">
            {logs.length === 0 ? (
              <p className="text-gray-600 text-center py-2">No logs yet</p>
            ) : (
              logs.slice().reverse().map((log, idx) => (
                <div key={idx} className="py-0.5">
                  <span className="text-gray-600">{formatTime(log.timestamp)}</span>
                  <span className={`ml-2 ${getLogLevelColor(log.level)}`}>
                    [{log.level.toUpperCase()}]
                  </span>
                  <span className="ml-2 text-gray-300">{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPanel;
