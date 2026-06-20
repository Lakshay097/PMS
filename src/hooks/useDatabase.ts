import { useState, useEffect } from 'react';
import { User, Task, Team, TaskTemplate, AuditLog, AppSetting, TaskReport, FollowUp, Subtask, Comment } from '../types';
import { dbService } from '../lib/dbService';

export function useDatabase() {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
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

      const { forceClearAllCaches } = await import('../lib/dbService');
      forceClearAllCaches();

      const { initializeDatabase } = await import('../lib/dbService');
      await initializeDatabase();

      const [loadedUsers, loadedTasks, loadedTeams, loadedTemplates, loadedAudits, loadedSettings, loadedReports, loadedFollowUps, loadedSubtasks, loadedComments] = await Promise.all([
        dbService.getUsers(),
        dbService.getTasks(),
        dbService.getTeams(),
        dbService.getTemplates(),
        dbService.getAuditLogs(),
        dbService.getSettings(),
        dbService.getReports(),
        dbService.getFollowups(),
        dbService.getSubtasks(),
        dbService.getComments(),
      ]);

      setUsers(loadedUsers);
      setTasks(loadedTasks);
      setTeams(loadedTeams);
      setTemplates(loadedTemplates);
      setAudits(loadedAudits);
      setSettings(loadedSettings);
      setReports(loadedReports);
      setFollowUps(loadedFollowUps);
      setSubtasks(loadedSubtasks);
      setComments(loadedComments);
      setLastSyncTime(new Date().toISOString());
    } catch (error) {
      console.error('Error loading database:', error);
      setDbConnectionStatus('error');
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  const syncDatabase = async () => {
    await loadDatabase();
  };

  useEffect(() => {
    loadDatabase();
  }, []);

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
  };
}
