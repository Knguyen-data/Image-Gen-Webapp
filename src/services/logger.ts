/**
 * Centralized Logging Service
 * Provides consistent logging across the application with context and timestamps
 * Includes Supabase integration for error tracking and analytics
 */

import { supabase } from './supabase';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

export type LogListener = (entry: LogEntry) => void;
const listeners: LogListener[] = [];

// Log level priority for filtering
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

// Current log level (can be changed at runtime)
let currentLogLevel: LogLevel = 'debug';

// Supabase logging configuration
let supabaseLoggingEnabled = true;
let supabaseLogLevel: LogLevel = 'warn'; // Only warn and error go to Supabase

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

/**
 * Send log entry to Supabase for analytics and error tracking
 * Only sends warn/error logs to avoid overwhelming the database
 */
const logToSupabase = async (entry: LogEntry): Promise<void> => {
  if (!supabaseLoggingEnabled) return;
  if (LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[supabaseLogLevel]) return;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Prepare metadata (must be valid Json type)
    const metadata: { context: string; message: string; userAgent: string; url: string; timestamp: string; data?: unknown } = {
      context: entry.context,
      message: entry.message,
      userAgent: navigator.userAgent,
      url: window.location.href,
      timestamp: entry.timestamp,
    };

    // Add data if present and serializable
    if (entry.data) {
      try {
        // Limit data size to prevent huge payloads
        const dataStr = JSON.stringify(entry.data);
        if (dataStr.length < 10000) {
          metadata.data = entry.data;
        } else {
          metadata.data = '[Data too large]';
        }
      } catch {
        metadata.data = '[Non-serializable data]';
      }
    }

    // Insert into usage_logs table
    const { error } = await supabase
      .from('usage_logs')
      .insert({
        user_id: user?.id || 'anonymous',
        provider: 'app',
        action: `log:${entry.level}`,
        credits_consumed: 0,
        metadata: metadata as any,
      });

    if (error) {
      // Silent fail - don't break the app if logging fails
      console.warn('[Logger] Failed to send log to Supabase:', error);
    }
  } catch (err) {
    // Silent fail
    console.warn('[Logger] Exception sending log to Supabase:', err);
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

  // Notify subscribers
  for (const listener of listeners) {
    try { listener(entry); } catch { /* swallow listener errors */ }
  }

  // Send to Supabase (fire and forget)
  logToSupabase(entry).catch(() => { /* silent fail */ });

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

  // Supabase logging configuration
  setSupabaseLogging: (enabled: boolean, minLevel?: LogLevel) => {
    supabaseLoggingEnabled = enabled;
    if (minLevel) supabaseLogLevel = minLevel;
    logger.info('Logger', `Supabase logging ${enabled ? 'enabled' : 'disabled'} (min: ${supabaseLogLevel})`);
  },

  isSupabaseLoggingEnabled: () => supabaseLoggingEnabled,

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
  },

  // Subscribe to log entries
  subscribe: (fn: LogListener): (() => void) => {
    listeners.push(fn);
    return () => {
      const idx = listeners.indexOf(fn);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  },

  // Log API call for analytics
  logApiCall: async (
    provider: string,
    action: string,
    creditsConsumed: number,
    metadata?: Record<string, unknown>
  ): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('usage_logs')
        .insert({
          user_id: user?.id || 'anonymous',
          provider,
          action,
          credits_consumed: creditsConsumed,
          metadata: {
            ...metadata,
            userAgent: navigator.userAgent,
            url: window.location.href,
          },
        });

      if (error) {
        logger.warn('Logger', 'Failed to log API call', error);
      }
    } catch (err) {
      logger.warn('Logger', 'Exception logging API call', err);
    }
  },
};

// Make logger available globally for debugging (dev only)
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__logger = logger;
}

export default logger;
