import { useState, useEffect } from 'react';
import { User, Task, Team, TaskTemplate, AppSetting } from '../types';

export function useSSE(
  setUsers: (users: User[]) => void,
  setTasks: (tasks: Task[]) => void,
  setTeams: (teams: Team[]) => void,
  setTemplates: (templates: TaskTemplate[]) => void,
  setSettings: (settings: AppSetting[]) => void
) {
  const [sseConnectionStatus, setSseConnectionStatus] = useState<'connected' | 'connecting' | 'error' | 'offline'>('offline');
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | undefined>(undefined);
  const [dbConnectionStatus, setDbConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('connected');

  useEffect(() => {
    setSseConnectionStatus('connecting');
    
    const eventSource = new EventSource('/api/sse');
    
    eventSource.onopen = () => {
      setSseConnectionStatus('connected');
      setDbConnectionStatus('connected');
    };

    eventSource.onerror = () => {
      setSseConnectionStatus('error');
      setDbConnectionStatus('error');
    };

    eventSource.addEventListener('users', (e) => {
      const data = JSON.parse(e.data);
      setUsers(data);
      setIsSyncingSheets(true);
      setTimeout(() => setIsSyncingSheets(false), 500);
      setLastSyncTime(new Date().toISOString());
    });

    eventSource.addEventListener('tasks', (e) => {
      const data = JSON.parse(e.data);
      setTasks(data);
      setIsSyncingSheets(true);
      setTimeout(() => setIsSyncingSheets(false), 500);
      setLastSyncTime(new Date().toISOString());
    });

    eventSource.addEventListener('teams', (e) => {
      const data = JSON.parse(e.data);
      setTeams(data);
      setIsSyncingSheets(true);
      setTimeout(() => setIsSyncingSheets(false), 500);
      setLastSyncTime(new Date().toISOString());
    });

    eventSource.addEventListener('templates', (e) => {
      const data = JSON.parse(e.data);
      setTemplates(data);
      setIsSyncingSheets(true);
      setTimeout(() => setIsSyncingSheets(false), 500);
      setLastSyncTime(new Date().toISOString());
    });

    eventSource.addEventListener('settings', (e) => {
      const data = JSON.parse(e.data);
      setSettings(data);
      setIsSyncingSheets(true);
      setTimeout(() => setIsSyncingSheets(false), 500);
      setLastSyncTime(new Date().toISOString());
    });

    return () => {
      eventSource.close();
    };
  }, [setUsers, setTasks, setTeams, setTemplates, setSettings]);

  return {
    sseConnectionStatus,
    isSyncingSheets,
    lastSyncTime,
    dbConnectionStatus,
  };
}
