import { useState, useEffect } from 'react';
import { User, Task, Team, SubTeam, TaskTemplate, AppSetting, TaskReport, FollowUp, Subtask, Comment, EmailTemplate, TeamSubmission, AuditLog } from '../types';
import { dbService, initializeDatabaseWithRace, getPrimaryDatabase, forceClearAllCaches, getSyncStatus, subscribeToSyncStatus, setDatabaseSwitchCallback, switchToFirestoreBackup, registerOptimisticCallback } from '../lib/dbService';
import { logger } from '../utils/logger';

export function useDatabase(isAuthInitialized: boolean = false) {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [subTeams, setSubTeams] = useState<SubTeam[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [reports, setReports] = useState<TaskReport[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [teamSubmissions, setTeamSubmissions] = useState<TeamSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dbConnectionStatus, setDbConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('connected');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [databaseSwitchMessage, setDatabaseSwitchMessage] = useState<string | null>(null);

  // Set up callback for database switch notifications
  useEffect(() => {
    setDatabaseSwitchCallback((newDb) => {
      setDatabaseSwitchMessage(`Switched to ${newDb === 'firestore' ? 'backup' : 'primary'} database`);
      setTimeout(() => setDatabaseSwitchMessage(null), 5000);
    });
  }, []);

  const loadDatabase = async () => {
    try {
      setIsLoading(true);
      setIsSyncing(true);
      setDbConnectionStatus('connected');

      // Use race logic to load from whichever database responds first
      const { data } = await initializeDatabaseWithRace();

      setUsers(data.users);
      setTasks(data.tasks);
      setTeams(data.teams);
      setSubTeams(data.subTeams || []);
      setTemplates(data.templates);
      setAudits(data.audits);
      setSettings(data.settings);
      setEmailTemplates(data.emailTemplates || []);
      setReports(data.reports);
      setFollowUps(data.followups);
      setSubtasks(data.subtasks);
      setComments(data.comments);
      setTeamSubmissions(data.teamSubmissions || []);
      setLastSyncTime(new Date().toISOString());
    } catch (error) {
      console.error('Error loading database:', error);
      setDbConnectionStatus('error');
      // Show user-facing error message
      setDatabaseSwitchMessage('Unable to connect. Please check your connection and refresh.');
      setTimeout(() => setDatabaseSwitchMessage(null), 10000);
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

      // Use race logic to load from whichever database responds first
      const { data } = await initializeDatabaseWithRace();

      setUsers(data.users);
      setTasks(data.tasks);
      setTeams(data.teams);
      setSubTeams(data.subTeams || []);
      setTemplates(data.templates);
      setAudits(data.audits);
      setSettings(data.settings);
      setEmailTemplates(data.emailTemplates || []);
      setReports(data.reports);
      setFollowUps(data.followups);
      setSubtasks(data.subtasks);
      setComments(data.comments);
      setTeamSubmissions(data.teamSubmissions || []);
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
      // Server-side Sheets sync is now handled by the server
    }

    // Subscribe to sync status changes
    const unsubscribeSyncStatus = subscribeToSyncStatus((status) => {
      setSyncStatus(status);
    });

    // Subscribe to optimistic updates for instant UI feedback
    const unsubscribeUsers = registerOptimisticCallback<User>('users', (data) => {
      setUsers(data);
    });
    
    const unsubscribeTasks = registerOptimisticCallback<Task>('tasks', (data) => {
      setTasks(data);
    });
    
    const unsubscribeTeams = registerOptimisticCallback<Team>('teams', (data) => {
      setTeams(data);
    });
    
    const unsubscribeTemplates = registerOptimisticCallback<TaskTemplate>('templates', (data) => {
      setTemplates(data);
    });
    
    const unsubscribeReports = registerOptimisticCallback<TaskReport>('reports', (data) => {
      setReports(data);
    });
    
    const unsubscribeFollowups = registerOptimisticCallback<FollowUp>('followups', (data) => {
      setFollowUps(data);
    });

    const unsubscribeSubtasks = registerOptimisticCallback<Subtask>('subtasks', (data) => {
      setSubtasks(data);
    });

    const unsubscribeComments = registerOptimisticCallback<Comment>('comments', (data) => {
      setComments(data);
    });

    const unsubscribeSubTeams = registerOptimisticCallback<SubTeam>('sub_teams', (data) => {
      setSubTeams(data);
    });

    const unsubscribeSettings = registerOptimisticCallback<AppSetting>('settings', (data) => {
      setSettings(data);
    });

    const unsubscribeAudits = registerOptimisticCallback<AuditLog>('auditlogs', (data) => {
      setAudits(data);
    });

    const unsubscribeEmailTemplates = registerOptimisticCallback<EmailTemplate>('email_templates', (data) => {
      setEmailTemplates(data);
    });

    const unsubscribeTeamSubmissions = registerOptimisticCallback<TeamSubmission>('teamSubmissions', (data) => {
      setTeamSubmissions(data);
    });

    // Cleanup on unmount
    return () => {
      unsubscribeSyncStatus();
      unsubscribeUsers();
      unsubscribeTasks();
      unsubscribeTeams();
      unsubscribeSubTeams();
      unsubscribeTemplates();
      unsubscribeReports();
      unsubscribeFollowups();
      unsubscribeSubtasks();
      unsubscribeComments();
      unsubscribeSettings();
      unsubscribeEmailTemplates();
      unsubscribeTeamSubmissions();
      unsubscribeAudits();
    };
  }, [isAuthInitialized]);

  return {
    users,
    setUsers,
    tasks,
    setTasks,
    teams,
    setTeams,
    subTeams,
    setSubTeams,
    templates,
    setTemplates,
    audits,
    setAudits,
    settings,
    setSettings,
    emailTemplates,
    setEmailTemplates,
    reports,
    setReports,
    followUps,
    setFollowUps,
    subtasks,
    setSubtasks,
    comments,
    setComments,
    teamSubmissions,
    setTeamSubmissions,
    isLoading,
    dbConnectionStatus,
    isSyncing,
    lastSyncTime,
    syncStatus,
    databaseSwitchMessage,
    loadDatabase,
    syncDatabase,
    silentSync,
  };
}
