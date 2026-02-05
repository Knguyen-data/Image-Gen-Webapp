/**
 * Centralized Logging Service
 * Provides consistent logging across the application with context and timestamps
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

// Log level priority for filtering
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Current log level (can be changed at runtime)
let currentLogLevel: LogLevel = 'debug';

// Format timestamp for logs
const formatTimestamp = (): string => {
  const now = new Date();
  return now.toISOString();
};

// Format log entry for console
const formatLogEntry = (entry: LogEntry): string => {
  const time = entry.timestamp.split('T')[1].split('.')[0]; // HH:MM:SS
  return `[${time}] [${entry.level.toUpperCase()}] [${entry.context}] ${entry.message}`;
};

// Log entry storage for debugging
const logHistory: LogEntry[] = [];
const MAX_LOG_HISTORY = 500;

const addToHistory = (entry: LogEntry): void => {
  logHistory.push(entry);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }
};

// Core logging function
const log = (level: LogLevel, context: string, message: string, data?: unknown): void => {
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[currentLogLevel]) {
    return;
  }

  const entry: LogEntry = {
    timestamp: formatTimestamp(),
    level,
    context,
    message,
    data
  };

  addToHistory(entry);

  const formattedMessage = formatLogEntry(entry);
  const style = getLogStyle(level);

  switch (level) {
    case 'debug':
      console.debug(`%c${formattedMessage}`, style, data !== undefined ? data : '');
      break;
    case 'info':
      console.info(`%c${formattedMessage}`, style, data !== undefined ? data : '');
      break;
    case 'warn':
      console.warn(`%c${formattedMessage}`, style, data !== undefined ? data : '');
      break;
    case 'error':
      console.error(`%c${formattedMessage}`, style, data !== undefined ? data : '');
      break;
  }
};

// Get console style based on log level
const getLogStyle = (level: LogLevel): string => {
  switch (level) {
    case 'debug':
      return 'color: #6b7280'; // gray
    case 'info':
      return 'color: #3b82f6'; // blue
    case 'warn':
      return 'color: #f59e0b'; // amber
    case 'error':
      return 'color: #ef4444; font-weight: bold'; // red
    default:
      return '';
  }
};

// Public API
export const logger = {
  debug: (context: string, message: string, data?: unknown) => log('debug', context, message, data),
  info: (context: string, message: string, data?: unknown) => log('info', context, message, data),
  warn: (context: string, message: string, data?: unknown) => log('warn', context, message, data),
  error: (context: string, message: string, data?: unknown) => log('error', context, message, data),

  // Set minimum log level
  setLevel: (level: LogLevel) => {
    currentLogLevel = level;
    logger.info('Logger', `Log level set to ${level}`);
  },

  // Get current log level
  getLevel: () => currentLogLevel,

  // Get log history for debugging
  getHistory: () => [...logHistory],

  // Clear log history
  clearHistory: () => {
    logHistory.length = 0;
    logger.info('Logger', 'Log history cleared');
  },

  // Export logs as JSON
  exportLogs: (): string => {
    return JSON.stringify(logHistory, null, 2);
  },

  // Group related logs
  group: (context: string, label: string) => {
    console.group(`[${context}] ${label}`);
  },

  groupEnd: () => {
    console.groupEnd();
  },

  // Time operations
  time: (context: string, label: string) => {
    console.time(`[${context}] ${label}`);
  },

  timeEnd: (context: string, label: string) => {
    console.timeEnd(`[${context}] ${label}`);
  }
};

// Make logger available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__logger = logger;
}

export default logger;
