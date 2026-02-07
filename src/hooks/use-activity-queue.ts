import { useState, useCallback } from 'react';

export interface ActivityJob {
  id: string;
  type: 'image' | 'video' | 'edit';
  status: 'pending' | 'active' | 'completed' | 'failed';
  startedAt: number;
  prompt: string;
  error?: string;
}

export interface ActivityLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  jobId?: string;
}

export const useActivityQueue = () => {
  const [jobs, setJobs] = useState<ActivityJob[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  const addJob = useCallback((job: Omit<ActivityJob, 'id' | 'startedAt'>) => {
    const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newJob: ActivityJob = { ...job, id, startedAt: Date.now() };
    setJobs(prev => [...prev, newJob]);
    return id;
  }, []);

  const updateJob = useCallback((id: string, updates: Partial<ActivityJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...updates } : j));
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
  }, []);

  const addLog = useCallback((log: Omit<ActivityLog, 'timestamp'>) => {
    const newLog: ActivityLog = { ...log, timestamp: Date.now() };
    setLogs(prev => [...prev.slice(-99), newLog]); // Keep last 100 logs
  }, []);

  const clearCompletedJobs = useCallback(() => {
    setJobs(prev => prev.filter(j => j.status !== 'completed' && j.status !== 'failed'));
  }, []);

  const activeJobs = jobs.filter(j => j.status === 'active' || j.status === 'pending');
  const hasActiveJobs = activeJobs.length > 0;

  return { jobs, logs, activeJobs, hasActiveJobs, addJob, updateJob, removeJob, addLog, clearCompletedJobs };
};
