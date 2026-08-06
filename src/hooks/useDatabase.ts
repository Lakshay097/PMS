import { useState, useEffect, useRef } from 'react';
import { User, Task, Team, SubTeam, TaskTemplate, AppSetting, TaskReport, FollowUp, Subtask, Comment, EmailTemplate, TeamSubmission, AuditLog } from '../types';
import { dbService, initializeDatabaseWithRace, getPrimaryDatabase, forceClearAllCaches, getSyncStatus, subscribeToSyncStatus, setDatabaseSwitchCallback, switchToFirestoreBackup, registerOptimisticCallback } from '../lib/dbService';
import { api } from '../lib/apiClient';
import { logger } from '../utils/logger';

// Collections that can be refreshed individually.
// Paths are relative to API_BASE — do NOT include /api here because
// apiClient.ts already prepends VITE_API_BASE (/api) to every request.
const COLLECTION_ROUTES: Record<string, string> = {
  users:            '/users',
  tasks:            '/tasks',
  teams:            '/teams',
  sub_teams:        '/sub-teams',
  templates:        '/templates',
  settings:         '/settings',
  email_templates:  '/email-templates',
  reports:          '/reports',
  followups:        '/followups',
  subtasks:         '/subtasks',
  comments:         '/comments',
  team_submissions: '/team-submissions',
  auditlogs:        '/auditlogs',
};

// Synchronously determine whether a valid auth token exists in localStorage.
// Mirrors the same check in AuthContext so useDatabase can set the correct
// initial isLoading state without waiting for a useEffect cycle.
function hasValidStoredToken(): boolean {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return false;
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;
    return !!localStorage.getItem('PMS_user');
  } catch {
    return false;
  }
}

export function useDatabase(isAuthInitialized: boolean = false, authIsLoading: boolean = true) {
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
  // Start loading only if there is a valid token — unauthenticated users should
  // never be gated behind a spinner waiting for data that will never arrive.
  const [isLoading, setIsLoading] = useState(() => hasValidStoredToken());
  // Guard against double-loading when isAuthInitialized flips more than once
  // (e.g. React StrictMode double-invoke or a token refresh triggering a re-render).
  const loadedRef = useRef(false);
  const [dbConnectionStatus, setDbConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('connected');
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | undefined>(undefined);
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
      // A 401 means the token expired mid-load; apiClient already redirects to
      // /login, so don't show a generic error banner — just stay quiet.
      const is401 = error instanceof Error && error.message.includes('401');
      if (!is401) {
        setDbConnectionStatus('error');
        setDatabaseSwitchMessage('Unable to connect. Please check your connection and refresh.');
        setTimeout(() => setDatabaseSwitchMessage(null), 10000);
      }
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
      setDbConnectionStatus('error');
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Refresh a single collection from the server without touching the other 12.
   * Use this instead of silentSync() after any mutation — it costs exactly
   * 1 API call (which may be served from the server-side TTL cache) instead of 13.
   *
   * Supported keys: 'users' | 'tasks' | 'teams' | 'sub_teams' | 'templates' |
   *   'settings' | 'email_templates' | 'reports' | 'followups' | 'subtasks' |
   *   'comments' | 'team_submissions' | 'auditlogs'
   */
  const silentSyncCollection = async (collection: keyof typeof COLLECTION_ROUTES) => {
    const route = COLLECTION_ROUTES[collection];
    if (!route) {
      logger.warn(`[silentSyncCollection] Unknown collection: ${collection}`);
      return;
    }
    try {
      const data = await api.get<any[]>(route);
      switch (collection) {
        case 'users':            setUsers(data as User[]); break;
        case 'tasks':            setTasks(data as Task[]); break;
        case 'teams':            setTeams(data as Team[]); break;
        case 'sub_teams':        setSubTeams(data as SubTeam[]); break;
        case 'templates':        setTemplates(data as TaskTemplate[]); break;
        case 'settings':         setSettings(data as AppSetting[]); break;
        case 'email_templates':  setEmailTemplates(data as EmailTemplate[]); break;
        case 'reports':          setReports(data as TaskReport[]); break;
        case 'followups':        setFollowUps(data as FollowUp[]); break;
        case 'subtasks':         setSubtasks(data as Subtask[]); break;
        case 'comments':         setComments(data as Comment[]); break;
        case 'team_submissions':  setTeamSubmissions(data as TeamSubmission[]); break;
        case 'auditlogs':        setAudits(data as AuditLog[]); break;
      }
    } catch (error) {
      logger.error(`[silentSyncCollection] Failed to refresh ${collection}:`, error);
    }
  };

  useEffect(() => {
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
  }, []);

  // Load database when auth initializes
  useEffect(() => {
    if (isAuthInitialized) {
      // Auth resolved AND user is authenticated — load data.
      // Use the ref guard so that a token-refresh re-render doesn't trigger
      // a redundant full reload (silentSync handles background refreshes).
      // Reset the guard when isAuthInitialized goes false→true (fresh login).
      loadDatabase();
      loadedRef.current = true;
      // Server-side Sheets sync is now handled by the server
    } else if (!authIsLoading) {
      // Auth has finished resolving but the user is NOT authenticated
      // (token missing, expired, or invalid). Release the loading gate so
      // App.tsx stops showing DashboardSkeleton and ProtectedRoute can
      // redirect to /login.
      loadedRef.current = false; // reset so a subsequent login triggers a fresh load
      setIsLoading(false);
    }
    // When authIsLoading is still true we do nothing — isLoading stays true
    // and the skeleton keeps showing until auth settles.
  }, [isAuthInitialized, authIsLoading]);

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
    silentSyncCollection,
  };
}
