import { useState, useEffect, useRef, useCallback } from 'react';
import { User, Task, Team, SubTeam, TaskTemplate, AppSetting, TaskReport, FollowUp, Subtask, Comment, EmailTemplate, TeamSubmission, AuditLog } from '../types';
import { initializeDatabaseWithRace, getSyncStatus, subscribeToSyncStatus, setDatabaseSwitchCallback, registerOptimisticCallback, forceClearAllCaches } from '../lib/dbService';
import { api } from '../lib/apiClient';
import { logger } from '../utils/logger';

// Collections that can be refreshed individually.
// Paths include /api prefix since apiClient.ts uses relative URLs
const COLLECTION_ROUTES: Record<string, string> = {
  users:            '/api/users',
  tasks:            '/api/tasks',
  teams:            '/api/teams',
  sub_teams:        '/api/sub-teams',
  templates:        '/api/templates',
  settings:         '/api/settings',
  email_templates:  '/api/email-templates',
  reports:          '/api/reports',
  followups:        '/api/followups',
  subtasks:         '/api/subtasks',
  comments:         '/api/comments',
  team_submissions: '/api/team-submissions',
  auditlogs:        '/api/auditlogs',
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
  // Start loading based on auth state and stored token
  const [isLoading, setIsLoading] = useState(() => {
    // If auth is still loading, we should show loading state
    if (authIsLoading) return true;
    // Otherwise, only load if we have a valid token
    return hasValidStoredToken();
  });
  // Guard against double-loading when isAuthInitialized flips more than once
  // (e.g. React StrictMode double-invoke or a token refresh triggering a re-render).
  const loadedRef = useRef(false);
  const loadingRef = useRef(false);
  const loadGenerationRef = useRef(0);
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

  const applyLoadedData = useCallback((data: Awaited<ReturnType<typeof initializeDatabaseWithRace>>['data']) => {
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
  }, []);

  const loadDatabase = useCallback(async (options?: { force?: boolean }) => {
    const force = options?.force === true;
    if (loadingRef.current && !force) {
      logger.log('[useDatabase] loadDatabase: skipped (already in flight)');
      return;
    }

    const generation = ++loadGenerationRef.current;
    loadingRef.current = true;

    try {
      logger.log('[useDatabase] loadDatabase: setting isLoading=true');
      setIsLoading(true);
      setIsSyncing(true);
      setDbConnectionStatus('connected');

      if (force) {
        forceClearAllCaches();
      }

      // Use race logic to load from whichever database responds first
      const { data } = await initializeDatabaseWithRace({ force });

      // Ignore stale results from an older load (logout/login race, StrictMode, etc.)
      if (generation !== loadGenerationRef.current) {
        logger.log('[useDatabase] loadDatabase: discarding stale result');
        return;
      }

      logger.log('[useDatabase] loadDatabase: data loaded, setting state');
      applyLoadedData(data);
    } catch (error) {
      if (generation !== loadGenerationRef.current) return;
      // A 401 means the token expired mid-load; apiClient already redirects to
      // /login, so don't show a generic error banner — just stay quiet.
      const is401 = error instanceof Error && error.message.includes('401');
      if (!is401) {
        setDbConnectionStatus('error');
        setDatabaseSwitchMessage('Unable to connect. Please check your connection and refresh.');
        setTimeout(() => setDatabaseSwitchMessage(null), 10000);
      }
    } finally {
      if (generation === loadGenerationRef.current) {
        logger.log('[useDatabase] loadDatabase: setting isLoading=false');
        setIsLoading(false);
        setIsSyncing(false);
        loadingRef.current = false;
      }
    }
  }, [applyLoadedData]);

  const syncDatabase = useCallback(async () => {
    await loadDatabase({ force: true });
  }, [loadDatabase]);

  const silentSync = useCallback(async () => {
    try {
      setIsSyncing(true);
      setDbConnectionStatus('connected');

      const { data } = await initializeDatabaseWithRace({ force: true });

      applyLoadedData(data);
    } catch (error) {
      setDbConnectionStatus('error');
    } finally {
      setIsSyncing(false);
    }
  }, [applyLoadedData]);

  /**
   * Refresh a single collection from the server without touching the other 12.
   * Use this instead of silentSync() after any mutation — it costs exactly
   * 1 API call (which may be served from the server-side TTL cache) instead of 13.
   *
   * Supported keys: 'users' | 'tasks' | 'teams' | 'sub_teams' | 'templates' |
   *   'settings' | 'email_templates' | 'reports' | 'followups' | 'subtasks' |
   *   'comments' | 'team_submissions' | 'auditlogs'
   */
  const silentSyncCollection = useCallback(async (collection: keyof typeof COLLECTION_ROUTES) => {
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
  }, []);

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

  // Load database once when auth becomes ready. Do NOT depend on loadDatabase
  // identity alone without a guard — that previously caused an infinite
  // load→skeleton→load loop because an unstable function reference re-fired
  // this effect on every render.
  useEffect(() => {
    if (isAuthInitialized) {
      if (loadedRef.current) return;
      loadedRef.current = true;
      void loadDatabase();
    } else if (!authIsLoading) {
      // Auth finished resolving but user is not authenticated.
      loadedRef.current = false;
      loadGenerationRef.current += 1; // invalidate any in-flight load
      loadingRef.current = false;
      setIsLoading(false);
      // Clear in-memory collections so the next login does not briefly show
      // the previous session's data, and so Firebase isn't hit for a logged-out user.
      setUsers([]);
      setTasks([]);
      setTeams([]);
      setSubTeams([]);
      setTemplates([]);
      setAudits([]);
      setSettings([]);
      setEmailTemplates([]);
      setReports([]);
      setFollowUps([]);
      setSubtasks([]);
      setComments([]);
      setTeamSubmissions([]);
    }
  }, [isAuthInitialized, authIsLoading, loadDatabase]);

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
    loadDatabase: () => loadDatabase({ force: true }),
    syncDatabase,
    silentSync,
    silentSyncCollection,
  };
}
