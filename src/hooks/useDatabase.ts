import { useState, useEffect } from 'react';
import { User, Task, Team, TaskTemplate, AppSetting, TaskReport, FollowUp, Subtask, Comment } from '../types';
import { dbService, initializeDatabase, forceClearAllCaches } from '../lib/dbService';

export function useDatabase(isAuthInitialized: boolean = false) {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [audits, setAudits] = useState<AppSetting[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [reports, setReports] = useState<TaskReport[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dbConnectionStatus, setDbConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('connected');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  const loadDatabase = async () => {
    try {
      setIsLoading(true);
      setIsSyncing(true);
      setDbConnectionStatus('connected');

      await initializeDatabase();

      // ONE request fetches everything
      const data = await dbService.batchLoadAll();

      setUsers(data.users);
      setTasks(data.tasks);
      setTeams(data.teams);
      setTemplates(data.templates);
      setAudits(data.settings);
      setSettings(data.settings);
      setReports(data.reports);
      setFollowUps(data.followups);
      setSubtasks(data.subtasks);
      setComments(data.comments);
      setLastSyncTime(new Date().toISOString());
    } catch (error) {
      console.error('Error loading database:', error);
      setDbConnectionStatus('error');
      // Note: Can't use toast here as it's outside React component context
      // The UI will show the error status via dbConnectionStatus
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  const syncDatabase = async () => {
    await loadDatabase();
  };

  const silentSync = async () => {
    try {
      setIsSyncing(true);
      setDbConnectionStatus('connected');

      await initializeDatabase();

      // ONE request fetches everything
      const data = await dbService.batchLoadAll();

      setUsers(data.users);
      setTasks(data.tasks);
      setTeams(data.teams);
      setTemplates(data.templates);
      setAudits(data.settings);
      setSettings(data.settings);
      setReports(data.reports);
      setFollowUps(data.followups);
      setSubtasks(data.subtasks);
      setComments(data.comments);
      setLastSyncTime(new Date().toISOString());
    } catch (error) {
      console.error('Error during silent sync:', error);
      setDbConnectionStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (isAuthInitialized) {
      loadDatabase();
    }
  }, [isAuthInitialized]);

  return {
    users,
    setUsers,
    tasks,
    setTasks,
    teams,
    setTeams,
    templates,
    setTemplates,
    audits,
    setAudits,
    settings,
    setSettings,
    reports,
    setReports,
    followUps,
    setFollowUps,
    subtasks,
    setSubtasks,
    comments,
    setComments,
    isLoading,
    dbConnectionStatus,
    isSyncing,
    lastSyncTime,
    loadDatabase,
    syncDatabase,
    silentSync,
  };
}
