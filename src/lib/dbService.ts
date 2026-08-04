// Firestore-First, Sheets-Deferred Database Layer
// All writes go to Firestore immediately for instant UI updates
// Google Sheets sync is now handled server-side via API endpoints

// TECH-DEBT: All writes happen client-side via dbService directly to Google Sheets.
// Ideal architecture would have server-side controllers handling writes and broadcasting SSE events.
// Deferred — requires full API layer refactor.

// TECH-DEBT: syncQueue.ts is implemented but not integrated.
// Wire into dbService.ts write failures for retry on network errors.

import {
  User,
  Team,
  SubTeam,
  Task,
  TaskTemplate,
  TaskReport,
  FollowUp,
  AppSetting,
  Subtask,
  Comment,
  EmailTemplate,
  TeamSubmission,
  AuditLog          
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_TEAMS,
  INITIAL_TEMPLATES,
  INITIAL_TASKS,
  INITIAL_REPORTS,
  INITIAL_FOLLOWUPS,
  INITIAL_SETTINGS,
  INITIAL_SUBTASKS,
  INITIAL_COMMENTS
} from '../initialData';
import { sheetsApi, HEADERS } from './sheetsService';
import { logger } from '../utils/logger';
import { notifyChange } from '../api/client';
import { api } from './apiClient';
import syncQueue from './syncQueue';

// Operation Types for Audit & Error Hooks
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// sanitizeForFirestore moved to server/lib/firestoreUtils.ts

// In-memory cache for performance (not persistence)
// This cache is cleared on page refresh and is only for performance optimization
const memoryCache = new Map<string, any[]>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Sync status for UI indicator (now reflects server-side sync status)
type SyncStatus = 'synced' | 'syncing' | 'error';
let currentSyncStatus: SyncStatus = 'synced';
const syncStatusListeners = new Set<(status: SyncStatus) => void>();

function setSyncStatus(status: SyncStatus) {
  currentSyncStatus = status;
  syncStatusListeners.forEach(listener => listener(status));
}

export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

export function subscribeToSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncStatusListeners.add(listener);
  return () => syncStatusListeners.delete(listener);
}

// Offline save notification callback
let offlineSaveNotification: ((message: string) => void) | null = null;

export function setOfflineSaveNotification(callback: (message: string) => void): void {
  offlineSaveNotification = callback;
}

function notifyOfflineSave(message: string): void {
  if (offlineSaveNotification) {
    offlineSaveNotification(message);
  }
}

// Exponential backoff wrapper for Sheets API calls
async function writeWithBackoff(fn: () => Promise<any>, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.status === 429 && i < retries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// Enqueue a Sheets write operation - now calls server API instead of local queue
async function enqueueSheetsWrite(collection: string, operation: 'save' | 'delete', data: any): Promise<void> {
  try {
    // Call server API to enqueue the write operation
    await api.post('/sheets/enqueue-write', { collection, operation, data });
    setSyncStatus('syncing');
  } catch (error) {
    // Optionally implement local fallback or retry logic here
  }
}

// Helper to get the ID field for a collection
function getIdFieldForCollection(collection: string): string {
  const idFields: Record<string, string> = {
    users: 'UserID',
    teams: 'TeamID',
    sub_teams: 'SubTeamID',
    templates: 'TemplateID',
    tasks: 'TaskID',
    reports: 'ReportID',
    followups: 'FollowUpID',
    settings: 'Key',
    subtasks: 'SubtaskID',
    comments: 'CommentID',
    team_submissions: 'SubmissionID',
    auditlogs: 'LogID'      
  };
  return idFields[collection] || 'ID';
}

function getFromCache<T>(key: string): T[] | null {
  const cached = memoryCache.get(key);
  if (!cached) return null;
  return cached as T[];
}

function setCache<T>(key: string, data: T[]): void {
  memoryCache.set(key, data);
  // Auto-expire after TTL
  setTimeout(() => memoryCache.delete(key), CACHE_TTL);
}

// Force clear all caches to ensure fresh data from Google Sheets
export function forceClearAllCaches(): void {
  memoryCache.clear();
}

export function clearCache(key?: string): void {
  if (key) {
    memoryCache.delete(key);
  } else {
    memoryCache.clear();
  }
}

// Initialize Google Sheets database with seed data if empty
export async function initializeDatabase(): Promise<void> {
  try {
    logger.log("Initializing Google Sheets database...");

    // Ensure the spreadsheet exists or create it
    const spreadId = await sheetsApi.getOrCreateSpreadsheet();
    if (!spreadId) {
      throw new Error('Failed to create or access Google Sheets spreadsheet.');
    }

    // Run metadata check and retrieve db_initialized flag in parallel
    const [_, isInitialized] = await Promise.all([
      sheetsApi.getSpreadsheetMetadata(spreadId),
      Promise.resolve(localStorage.getItem('db_initialized') === 'true')
    ]);

    // Skip empty check if already initialized (unless we hit a 404 later)
    if (!isInitialized) {
      // Check if database is empty by checking users
      const users = await sheetsApi.getCollection<User>('users');
      setCache('users', users); // Cache for batchLoadAll
      const tasks = await sheetsApi.getCollection<Task>('tasks');
      setCache('tasks', tasks); // Cache for batchLoadAll

      const isNewSpreadsheet = users.length === 0 && tasks.length === 0;

      if (isNewSpreadsheet) {
        logger.log("Google Sheets database is empty. Seeding initial data...");

        // Seed initial data in batches of 3-4 to avoid rate limiting
        const collections = [
          { name: 'users', data: INITIAL_USERS },
          { name: 'teams', data: INITIAL_TEAMS },
          { name: 'templates', data: INITIAL_TEMPLATES },
          { name: 'tasks', data: INITIAL_TASKS },
          { name: 'reports', data: INITIAL_REPORTS },
          { name: 'followups', data: INITIAL_FOLLOWUPS },
          { name: 'settings', data: INITIAL_SETTINGS },
          { name: 'subtasks', data: INITIAL_SUBTASKS },
          { name: 'comments', data: INITIAL_COMMENTS },
          { name: 'team_submissions', data: [] }
        ];

        // Process in batches of 3-4 to avoid rate limits
        const batchSize = 3;
        for (let i = 0; i < collections.length; i += batchSize) {
          const batch = collections.slice(i, i + batchSize);
          await Promise.all(batch.map(collection =>
            sheetsApi.saveCollection(collection.name as 'users' | 'teams' | 'templates' | 'tasks' | 'reports' | 'followups' | 'settings' | 'subtasks' | 'comments' | 'team_submissions', collection.data)
          ));
          // Small delay between batches
          if (i + batchSize < collections.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        logger.log("Initial data seeded successfully.");
        localStorage.setItem('db_initialized', 'true');
      } else {
        logger.log("Database already initialized with existing data.");
        localStorage.setItem('db_initialized', 'true');
      }
    } else {
      logger.log("Database already initialized (flag set). Skipping empty check.");
    }
  } catch (error: any) {
    // Reset initialization flag on 404 errors (spreadsheet deleted)
    if (error?.statusCode === 404 || error?.message?.includes('404')) {
      logger.log('Spreadsheet not found (404). Resetting initialization flag.');
      localStorage.removeItem('db_initialized');
    }
    throw new Error(`Failed to initialize Google Sheets database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Race both Sheets and Firestore, use whichever responds first
type DatabaseType = 'sheets' | 'firestore';

// Global callback for database switch notifications
let databaseSwitchCallback: ((newDb: DatabaseType) => void) | null = null;

export function setDatabaseSwitchCallback(callback: (newDb: DatabaseType) => void) {
  databaseSwitchCallback = callback;
}

export async function initializeDatabaseWithRace(): Promise<{
  data: Awaited<ReturnType<typeof dbService.batchLoadAll>>;
  primary: DatabaseType;
}> {
  const FIRESTORE_TIMEOUT_MS = 60000; 
  const SHEETS_TIMEOUT_MS = 20000; // 20 second timeout for Sheets (slower fallback)

  // Create timeout promise
  const timeoutPromise = (ms: number, dbType: DatabaseType) =>
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${dbType} timeout after ${ms}ms`)), ms)
    );

  // Try Firestore first (primary, faster)
  try {
    logger.log("Loading from Firestore (primary)...");
    const data = await Promise.race([
      dbService.batchLoadAll(),
      timeoutPromise(FIRESTORE_TIMEOUT_MS, 'firestore')
    ]);
    logger.log("Firestore loaded successfully");
    localStorage.setItem('primary_database', 'firestore');
    return { data, primary: 'firestore' };
  } catch (firestoreError) {
    logger.error("Firestore failed:", firestoreError);
  }

  // Fallback to Sheets
  try {
    logger.log("Firestore failed, trying Sheets as fallback...");
    await initializeDatabase();
    const data = await Promise.race([
      dbService.batchLoadAll(),
      timeoutPromise(SHEETS_TIMEOUT_MS, 'sheets')
    ]);
    logger.log("Sheets loaded successfully");
    localStorage.setItem('primary_database', 'sheets');
    return { data, primary: 'sheets' };
  } catch (sheetsError) {
    logger.error("Sheets failed:", sheetsError);
    throw new Error("Unable to connect to any database. Please check your connection and refresh.");
  }
}

export function getPrimaryDatabase(): DatabaseType {
  return (localStorage.getItem('primary_database') as DatabaseType) || 'firestore';
}

// Switch to Firestore as backup database
export function switchToFirestoreBackup() {
  const currentPrimary = getPrimaryDatabase();
  if (currentPrimary !== 'firestore') {
    logger.warn('Switching to Firestore as backup database');
    localStorage.setItem('primary_database', 'firestore');
    if (databaseSwitchCallback) {
      databaseSwitchCallback('firestore');
    }
  }
}

// ---------------------------------------------------------------------------
// Optimistic Update Pub/Sub
// dbService methods call notifyOptimisticUpdate immediately after updating the
// in-memory cache so that React state (via useDatabase) reflects the change
// before the Firestore write even starts.
// ---------------------------------------------------------------------------
type OptimisticCallback<T> = (data: T[]) => void;
const optimisticCallbacks = new Map<string, Set<OptimisticCallback<any>>>();

export function registerOptimisticCallback<T>(
  collectionName: string,
  callback: OptimisticCallback<T>
): () => void {
  if (!optimisticCallbacks.has(collectionName)) {
    optimisticCallbacks.set(collectionName, new Set());
  }
  optimisticCallbacks.get(collectionName)!.add(callback);
  return () => {
    optimisticCallbacks.get(collectionName)?.delete(callback);
  };
}

function notifyOptimisticUpdate<T>(collectionName: string, data: T[]): void {
  const callbacks = optimisticCallbacks.get(collectionName);
  if (callbacks) {
    callbacks.forEach(cb => cb(data));
  }
}

// Firestore Primary Database Service
// All operations go directly to Firestore with in-memory caching for performance
export const dbService = {
  // Users Service
  async getUsers(): Promise<User[]> {
    // Check cache first
    const cached = getFromCache<User>('users');
    if (cached) return cached;

    try {
      const raw = await api.get<any[]>('/users');
      const users: User[] = raw.map(u => {
        return {
          ...u,
          TeamIDs: u.TeamIDs ? (Array.isArray(u.TeamIDs) ? u.TeamIDs : [u.TeamIDs]) : (u.TeamID ? [u.TeamID] : []),
          TeamNames: u.TeamNames ? (Array.isArray(u.TeamNames) ? u.TeamNames : [u.TeamNames]) : (u.TeamName ? [u.TeamName] : []),
          TeamID: u.TeamID || (u.TeamIDs && u.TeamIDs.length > 0 ? (Array.isArray(u.TeamIDs) ? u.TeamIDs[0] : u.TeamIDs) : ''),
          TeamName: u.TeamName || (u.TeamNames && u.TeamNames.length > 0 ? (Array.isArray(u.TeamNames) ? u.TeamNames[0] : u.TeamNames) : '')
        };
      });
      setCache('users', users);
      return users;
    } catch (error) {
      throw new Error(`Failed to load users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveUser(user: User): Promise<void> {
    // ⚠️ TRAP: this getUsers() now hits an admin/lead-only endpoint.
    // A regular user editing their own profile would get a 403 here.
    // For now, we'll proceed - the server endpoint allows self-edit.
    const users = await this.getUsers();
    const idx = users.findIndex(u => u.UserID === user.UserID || u.Email === user.Email);
    const now = new Date().toISOString();

    const userToSave = {
      ...user,
      TeamID: user.TeamID || (user.TeamIDs && user.TeamIDs.length > 0 ? user.TeamIDs[0] : ''),
      TeamName: user.TeamName || (user.TeamNames && user.TeamNames.length > 0 ? user.TeamNames[0] : '')
    };

    const finalUser = idx >= 0
      ? { ...users[idx], ...userToSave, UpdatedAt: now }
      : { ...userToSave, CreatedAt: now, UpdatedAt: now };

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) {
      users[idx] = finalUser;
    } else {
      users.push(finalUser);
    }
    setCache('users', users);
    clearCache('teams');
    notifyOptimisticUpdate('users', users);

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.put(`/users/${encodeURIComponent(user.Email)}`, finalUser);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('users', 'save', finalUser);
        notifyChange('users', 'updated', user.UserID).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        // Enqueue to syncQueue for retry with user notification
        syncQueue.enqueue(
          'users',
          user.UserID,
          persist,
          () => {
            // onRetry: show toast notification
          },
          () => {
            // onFail: show error toast and rollback
            // Rollback optimistic update
            const rollback = async () => {
              const raw = await api.get<any[]>('/users');
              const rollbackData: User[] = raw.map(u => {
                return {
                  ...u,
                  TeamIDs: u.TeamIDs ? (Array.isArray(u.TeamIDs) ? u.TeamIDs : [u.TeamIDs]) : (u.TeamID ? [u.TeamID] : []),
                  TeamNames: u.TeamNames ? (Array.isArray(u.TeamNames) ? u.TeamNames : [u.TeamNames]) : (u.TeamName ? [u.TeamName] : ''),
                  TeamID: u.TeamID || (u.TeamIDs && u.TeamIDs.length > 0 ? (Array.isArray(u.TeamIDs) ? u.TeamIDs[0] : u.TeamIDs) : ''),
                  TeamName: u.TeamName || (u.TeamNames && u.TeamNames.length > 0 ? (Array.isArray(u.TeamNames) ? u.TeamNames[0] : u.TeamNames) : '')
                };
              });
              setCache('users', rollbackData);
              notifyOptimisticUpdate('users', rollbackData);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Teams Service
  async getTeams(): Promise<Team[]> {
    const cached = getFromCache<Team>('teams');
    if (cached) return cached;

    try {
      const [teams, settings] = await Promise.all([
        api.get<Team[]>('/teams'),
        api.get<AppSetting[]>('/settings')
      ]);

      // Load team leader emails and stakeholder emails from settings and attach to teams
      const teamsWithLeaders = teams.map(team => {
        const leaderSetting = settings.find(s => s.Key === `team_${team.TeamID}_leaders`);
        const leaderEmails = leaderSetting?.Value ? leaderSetting.Value.split(',').map(e => e.trim()).filter(Boolean) : [];
        const stakeholderSetting = settings.find(s => s.Key === `team_${team.TeamID}_stakeholders`);
        const stakeholderEmails = stakeholderSetting?.Value ? stakeholderSetting.Value.split(',').map(e => e.trim()).filter(Boolean) : [];
        return {
          ...team,
          TeamLeaderEmails: leaderEmails,
          StakeholderEmails: stakeholderEmails
        };
      });

      setCache('teams', teamsWithLeaders);
      return teamsWithLeaders;
    } catch (error) {
      throw new Error(`Failed to load teams: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveTeam(team: Team): Promise<void> {
    const teams = await this.getTeams();
    const idx = teams.findIndex(t => t.TeamID === team.TeamID);
    const now = new Date().toISOString();

    const teamToSave = idx >= 0
      ? { ...teams[idx], ...team, UpdatedAt: now }
      : { ...team, CreatedAt: now, UpdatedAt: now };

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) {
      teams[idx] = teamToSave;
    } else {
      teams.push(teamToSave);
    }
    setCache('teams', teams);
    clearCache('users');
    notifyOptimisticUpdate('teams', teams);

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.put(`/teams/${team.TeamID}`, teamToSave);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('teams', 'save', teamToSave);
        notifyChange('teams', 'updated', team.TeamID).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'teams',
          team.TeamID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<Team[]>('/api/teams');
              setCache('teams', raw);
              notifyOptimisticUpdate('teams', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  async toggleTeamStatus(teamId: string): Promise<void> {
    const teams = await this.getTeams();
    const team = teams.find(t => t.TeamID === teamId);
    if (!team) return;

    const now = new Date().toISOString();
    team.Active = !team.Active;
    team.UpdatedAt = now;

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('teams', teams);
    notifyOptimisticUpdate('teams', teams);

    (async () => {
      const persist = async () => {
        await api.put(`/teams/${teamId}`, team);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('teams', 'save', team);
        notifyChange('teams', 'updated', teamId).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'teams',
          teamId,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<Team[]>('/api/teams');
              setCache('teams', raw);
              notifyOptimisticUpdate('teams', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  async deleteTeam(teamId: string): Promise<void> {
    const teams = await this.getTeams();
    const filtered = teams.filter(t => t.TeamID !== teamId);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('teams', filtered);
    clearCache('users');
    notifyOptimisticUpdate('teams', filtered);

    (async () => {
      const persist = async () => {
        await api.del(`/teams/${teamId}`);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('teams', 'delete', teamId);
        notifyChange('teams', 'deleted', teamId).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'teams',
          teamId,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<Team[]>('/api/teams');
              setCache('teams', raw);
              notifyOptimisticUpdate('teams', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Task Templates
  async getTemplates(): Promise<TaskTemplate[]> {
    const cached = getFromCache<TaskTemplate>('templates');
    if (cached) return cached;

    try {
      const templates = await api.get<TaskTemplate[]>('/templates');
      setCache('templates', templates);
      return templates;
    } catch (error) {
      throw new Error(`Failed to load templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveTemplate(template: TaskTemplate): Promise<void> {
    const templates = await this.getTemplates();
    const idx = templates.findIndex(t => t.TemplateID === template.TemplateID);
    const now = new Date().toISOString();

    const templateToSave = idx >= 0
      ? { ...templates[idx], ...template, UpdatedAt: now }
      : { ...template, CreatedAt: now, UpdatedAt: now };

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) {
      templates[idx] = templateToSave;
    } else {
      templates.push(templateToSave);
    }
    setCache('templates', templates);
    notifyOptimisticUpdate('templates', templates);

    (async () => {
      const persist = async () => {
        await api.put(`/templates/${template.TemplateID}`, templateToSave);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('templates', 'save', templateToSave);
        notifyChange('templates', 'updated', template.TemplateID).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'templates',
          template.TemplateID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<TaskTemplate[]>('/templates');
              setCache('templates', raw);
              notifyOptimisticUpdate('templates', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  async deleteTemplate(templateId: string): Promise<void> {
    const templates = await this.getTemplates();
    const filtered = templates.filter(t => t.TemplateID !== templateId);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('templates', filtered);
    notifyOptimisticUpdate('templates', filtered);

    (async () => {
      const persist = async () => {
        await api.del(`/templates/${templateId}`);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('templates', 'delete', templateId);
        notifyChange('templates', 'deleted', templateId).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'templates',
          templateId,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<TaskTemplate[]>('/templates');
              setCache('templates', raw);
              notifyOptimisticUpdate('templates', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Live Tasks
  async getTasks(): Promise<Task[]> {
    const cached = getFromCache<Task>('tasks');
    if (cached) return cached;

    try {
      const raw = await api.get<any[]>('/tasks');
      const tasks: Task[] = raw.map(t => {
        return {
          ...t,
          AssignedToTeamIDs: t.AssignedToTeamIDs 
            ? (Array.isArray(t.AssignedToTeamIDs) 
                ? t.AssignedToTeamIDs 
                : [t.AssignedToTeamIDs]) 
            : (t.TeamID ? [t.TeamID] : []),
        };
      });
      setCache('tasks', tasks);
      return tasks;
    } catch (error) {
      throw new Error(`Failed to load tasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveTask(task: Task): Promise<void> {
    // Validate that task has an assigned stakeholder
    if (!task.AssignedToEmail || task.AssignedToEmail.trim() === '') {
      throw new Error('Task must be assigned to at least one stakeholder');
    }

    const tasks = await this.getTasks();
    const idx = tasks.findIndex(t => t.TaskID === task.TaskID);
    const now = new Date().toISOString();

    const taskToSave = {
      ...task,
      TeamID: task.TeamID || (task.AssignedToTeamIDs && task.AssignedToTeamIDs.length > 0 ? task.AssignedToTeamIDs[0] : '')
    };
    const finalTask = idx >= 0
      ? { ...tasks[idx], ...taskToSave, UpdatedAt: now }
      : { ...taskToSave, CreatedAt: now, UpdatedAt: now };

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) { tasks[idx] = finalTask; } else { tasks.push(finalTask); }
    setCache('tasks', tasks);
    notifyOptimisticUpdate('tasks', tasks);

    (async () => {
      const persist = async () => {
        await api.put(`/tasks/${task.TaskID}`, finalTask);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('tasks', 'save', finalTask);
        notifyChange('tasks', 'updated', task.TaskID).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'tasks',
          task.TaskID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<any[]>('/tasks');
              const rollbackData: Task[] = raw.map(t => {
                return { ...t, AssignedToTeamIDs: t.AssignedToTeamIDs ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs : [t.AssignedToTeamIDs]) : (t.TeamID ? [t.TeamID] : []) };
              });
              setCache('tasks', rollbackData);
              notifyOptimisticUpdate('tasks', rollbackData);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  async deleteTask(taskId: string): Promise<void> {
    const tasks = await this.getTasks();
    const filtered = tasks.filter(t => t.TaskID !== taskId);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('tasks', filtered);
    notifyOptimisticUpdate('tasks', filtered);

    (async () => {
      const persist = async () => {
        await api.del(`/tasks/${taskId}`);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('tasks', 'delete', taskId);
        notifyChange('tasks', 'deleted', taskId).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'tasks',
          taskId,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<any[]>('/tasks');
              const rollbackData: Task[] = raw.map(t => {
                return { ...t, AssignedToTeamIDs: t.AssignedToTeamIDs ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs : [t.AssignedToTeamIDs]) : (t.TeamID ? [t.TeamID] : []) };
              });
              setCache('tasks', rollbackData);
              notifyOptimisticUpdate('tasks', rollbackData);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Reports
  async getReports(): Promise<TaskReport[]> {
    const cached = getFromCache<TaskReport>('reports');
    if (cached) return cached;

    try {
      const reports = await api.get<TaskReport[]>('/reports');
      setCache('reports', reports);
      return reports;
    } catch (error) {
      throw new Error(`Failed to load reports: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveReport(report: TaskReport): Promise<void> {
    const reports = await this.getReports();
    reports.push(report);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('reports', reports);
    notifyOptimisticUpdate('reports', reports);

    (async () => {
      const persist = async () => {
        await api.post('/reports', report);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('reports', 'save', report);
        notifyChange('reports', 'created', report.ReportID).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'reports',
          report.ReportID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<TaskReport[]>('/reports');
              setCache('reports', raw);
              notifyOptimisticUpdate('reports', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Follow-ups
  async getFollowups(): Promise<FollowUp[]> {
    const cached = getFromCache<FollowUp>('followups');
    if (cached) return cached;

    try {
      const followups = await api.get<FollowUp[]>('/followups');
      setCache('followups', followups);
      return followups;
    } catch (error) {
      throw new Error(`Failed to load followups: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveFollowup(follow: FollowUp): Promise<void> {
    const followups = await this.getFollowups();
    followups.push(follow);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('followups', followups);
    notifyOptimisticUpdate('followups', followups);

    (async () => {
      const persist = async () => {
        await api.post('/followups', follow);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('followups', 'save', follow);
        notifyChange('followups', 'created', follow.FollowUpID).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'followups',
          follow.FollowUpID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<FollowUp[]>('/followups');
              setCache('followups', raw);
              notifyOptimisticUpdate('followups', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Settings
  async getSettings(): Promise<AppSetting[]> {
    const cached = getFromCache<AppSetting>('settings');
    if (cached) return cached;

    try {
      const settings = await api.get<AppSetting[]>('/settings');
      setCache('settings', settings);
      return settings;
    } catch (error) {
      throw new Error(`Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveSettings(settingsList: AppSetting[]): Promise<void> {
    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('settings', settingsList);
    notifyOptimisticUpdate('settings', settingsList);

    // If any team leader/stakeholder settings were updated, clear teams cache
    const hasTeamSettings = settingsList.some(s => s.Key.startsWith('team_') && (s.Key.endsWith('_leaders') || s.Key.endsWith('_stakeholders')));
    if (hasTeamSettings) {
      clearCache('teams');
    }

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.put('/settings', settingsList);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('settings', 'save', settingsList);
        notifyChange('settings', 'updated', 'settings').catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'settings',
          'settings',
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<AppSetting[]>('/settings');
              setCache('settings', raw);
              notifyOptimisticUpdate('settings', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Audit Logs — read-only, append-only collection (writes happen via logAction())
  async getAudits(): Promise<AuditLog[]> {
    const cached = getFromCache<AuditLog>('auditlogs');
    if (cached) return cached;

    try {
      // Server caps to 200 entries
      const audits = await api.get<AuditLog[]>('/auditlogs');
      setCache('auditlogs', audits);
      return audits;
    } catch (error) {
      throw new Error(`Failed to load audit logs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Email Templates
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    const cached = getFromCache<EmailTemplate>('email_templates');
    if (cached) return cached;

    try {
      const emailTemplates = await api.get<EmailTemplate[]>('/email-templates');
      setCache('email_templates', emailTemplates);
      return emailTemplates;
    } catch (error) {
      throw new Error(`Failed to load email templates: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveEmailTemplate(template: EmailTemplate): Promise<void> {
    const templates = await this.getEmailTemplates();
    const idx = templates.findIndex(t => t.templateName === template.templateName);
    const now = new Date().toISOString();

    const templateToSave = {
      ...template,
      updatedAt: now,
    };

    const finalTemplate = idx >= 0
      ? { ...templates[idx], ...templateToSave }
      : { ...templateToSave };

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) {
      templates[idx] = finalTemplate;
    } else {
      templates.push(finalTemplate);
    }
    setCache('email_templates', templates);
    notifyOptimisticUpdate('email_templates', templates);

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.put(`/email-templates/${template.templateName}`, finalTemplate);
      };
      try {
        await persist();
        // Sync to email template API (commented out for now)
        // await api.post('/email/templates', {
        //   templateName: finalTemplate.templateName,
        //   subject: finalTemplate.subject,
        //   body: finalTemplate.body,
        // });
        notifyChange('email_templates', 'updated', template.templateName).catch(() => {});
      } catch (err) {
        // Rollback optimistic update
        const rollback = async () => {
          const raw = await api.get<EmailTemplate[]>('/email-templates');
          setCache('email_templates', raw);
          notifyOptimisticUpdate('email_templates', raw);
        };
        rollback().catch(() => {});
        throw new Error(`Failed to save email template: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  async deleteEmailTemplate(templateName: string): Promise<void> {
    const templates = await this.getEmailTemplates();
    const filtered = templates.filter(t => t.templateName !== templateName);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('email_templates', filtered);
    notifyOptimisticUpdate('email_templates', filtered);

    (async () => {
      const persist = async () => {
        await api.del(`/email-templates/${templateName}`);
      };
      try {
        await persist();
        notifyChange('email_templates', 'deleted', templateName).catch(() => {});
      } catch (err) {
        const rollback = async () => {
          const raw = await api.get<EmailTemplate[]>('/email-templates');
          setCache('email_templates', raw);
          notifyOptimisticUpdate('email_templates', raw);
        };
        rollback().catch(() => {});
        throw new Error(`Failed to delete email template: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Subtasks Service
  async getSubtasks(): Promise<Subtask[]> {
    const cached = getFromCache<Subtask>('subtasks');
    if (cached) return cached;

    try {
      const subtasks = await api.get<Subtask[]>('/subtasks');
      setCache('subtasks', subtasks);
      return subtasks;
    } catch (error) {
      throw new Error(`Failed to load subtasks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveSubtask(subtask: Subtask): Promise<void> {
    const subtasks = await this.getSubtasks();
    const idx = subtasks.findIndex(s => s.SubtaskID === subtask.SubtaskID);
    const now = new Date().toISOString();

    const subtaskToSave = idx >= 0
      ? { ...subtasks[idx], ...subtask, UpdatedAt: now }
      : { ...subtask, CreatedAt: now, UpdatedAt: now };

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) {
      subtasks[idx] = subtaskToSave;
    } else {
      subtasks.push(subtaskToSave);
    }
    setCache('subtasks', subtasks);
    notifyOptimisticUpdate('subtasks', subtasks);

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.put(`/subtasks/${subtask.SubtaskID}`, subtaskToSave);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('subtasks', 'save', subtaskToSave);
        notifyChange('subtasks', 'updated', subtask.SubtaskID).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'subtasks',
          subtask.SubtaskID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<Subtask[]>('/subtasks');
              setCache('subtasks', raw);
              notifyOptimisticUpdate('subtasks', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  async saveSubtasksBatch(taskId: string, subtasks: Subtask[]): Promise<void> {
    const allSubtasks = await this.getSubtasks();
    // Remove existing subtasks for this task
    const filtered = allSubtasks.filter(s => s.TaskID !== taskId);
    const now = new Date().toISOString();
    const newSubtasks = subtasks.map(s => ({
      ...s,
      CreatedAt: s.CreatedAt || now,
      UpdatedAt: now
    }));
    const updated = [...filtered, ...newSubtasks];

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('subtasks', updated);
    notifyOptimisticUpdate('subtasks', updated);

    // Background async: Write via API (individual calls for each subtask)
    (async () => {
      const persist = async () => {
        // Write each subtask individually via API
        await Promise.all(newSubtasks.map(s => api.put(`/api/subtasks/${s.SubtaskID}`, s)));
      };
      try {
        await persist();
        // await enqueueSheetsWrite('subtasks', 'save', updated);
        notifyChange('subtasks', 'updated', taskId).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'subtasks',
          taskId,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<Subtask[]>('/subtasks');
              setCache('subtasks', raw);
              notifyOptimisticUpdate('subtasks', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // Comments Service
  async getComments(): Promise<Comment[]> {
    const cached = getFromCache<Comment>('comments');
    if (cached) return cached;

    try {
      const comments = await api.get<Comment[]>('/comments');
      setCache('comments', comments);
      return comments;
    } catch (error) {
      throw new Error(`Failed to load comments: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveComment(comment: Comment): Promise<void> {
    const comments = await this.getComments();
    comments.push(comment);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('comments', comments);
    notifyOptimisticUpdate('comments', comments);

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.put(`/comments/${comment.CommentID}`, comment);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('comments', 'save', comment);
        notifyChange('comments', 'created', comment.CommentID).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'comments',
          comment.CommentID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<Comment[]>('/comments');
              setCache('comments', raw);
              notifyOptimisticUpdate('comments', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  async getTeamSubmissions(): Promise<TeamSubmission[]> {
    const cached = getFromCache<TeamSubmission>('teamSubmissions');
    if (cached) return cached;

    try {
      const submissions = await api.get<TeamSubmission[]>('/team-submissions');
      setCache('teamSubmissions', submissions);
      return submissions;
    } catch (error) {
      throw new Error(`Failed to load team submissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveTeamSubmission(submission: TeamSubmission): Promise<void> {
    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    const cached = getFromCache('teamSubmissions') as TeamSubmission[] || [];
    setCache('teamSubmissions', [...cached, submission]);
    notifyOptimisticUpdate('teamSubmissions', [...cached, submission]);

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.post('/team-submissions', submission);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('team_submissions', 'save', submission);
        notifyChange('team_submissions', 'created', submission.SubmissionID).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'team_submissions',
          submission.SubmissionID,
          persist,
          () => {},
          async () => {
            const rollback = async () => {
              const raw = await api.get<TeamSubmission[]>('/team-submissions');
              setCache('teamSubmissions', raw);
              notifyOptimisticUpdate('teamSubmissions', raw);
            };
            rollback().catch(() => {});
          }
        );
      }
    })();
  },

  // SubTeams Service
  // Sub-team leader emails are stored as settings keys:
  //   team_{TeamID}_subteam_{SubTeamID}_leaders  →  comma-separated emails
  // This mirrors the existing TeamLeaderEmails pattern exactly.
  async getSubTeams(): Promise<SubTeam[]> {
    const cached = getFromCache<SubTeam>('sub_teams');
    if (cached) return cached;

    try {
      // Server attaches sub-team leader emails from settings
      const subTeams = await api.get<SubTeam[]>('/sub-teams');
      setCache('sub_teams', subTeams);
      return subTeams;
    } catch (error) {
      throw new Error(`Failed to load sub-teams: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveSubTeam(subTeam: SubTeam): Promise<void> {
    const subTeams = await this.getSubTeams();
    const idx = subTeams.findIndex(st => st.SubTeamID === subTeam.SubTeamID);
    const now = new Date().toISOString();

    const subTeamToSave = idx >= 0
      ? { ...subTeams[idx], ...subTeam, UpdatedAt: now }
      : { ...subTeam, CreatedAt: now, UpdatedAt: now, SubTeamLeaderEmails: subTeam.SubTeamLeaderEmails ?? [] };

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) {
      subTeams[idx] = subTeamToSave;
    } else {
      subTeams.push(subTeamToSave);
    }
    setCache('sub_teams', subTeams);
    notifyOptimisticUpdate('sub_teams', subTeams);

    // Background async: Write via API
    (async () => {
      const persist = async () => {
        await api.put(`/sub-teams/${subTeam.SubTeamID}`, subTeamToSave);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('sub_teams', 'save', subTeamToSave);
        notifyChange('sub_teams', 'updated', subTeam.SubTeamID).catch(() => {});
      } catch (err) {
        syncQueue.enqueue(
          'sub_teams',
          subTeam.SubTeamID,
          persist,
          () => {},
          async () => {
            clearCache('sub_teams');
            const rollback = await this.getSubTeams();
            notifyOptimisticUpdate('sub_teams', rollback);
          }
        );
      }
    })();
  },

  async deleteSubTeam(subTeamId: string): Promise<void> {
    const subTeams = await this.getSubTeams();
    const filtered = subTeams.filter(st => st.SubTeamID !== subTeamId);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('sub_teams', filtered);
    notifyOptimisticUpdate('sub_teams', filtered);

    // Background async: Delete via API
    (async () => {
      const persist = async () => {
        await api.del(`/sub-teams/${subTeamId}`);
      };
      try {
        await persist();
        // await enqueueSheetsWrite('sub_teams', 'delete', subTeamId);
        notifyChange('sub_teams', 'deleted', subTeamId).catch(() => {});
      } catch (err) {
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'sub_teams',
          subTeamId,
          persist,
          () => {},
          async () => {
            clearCache('sub_teams');
            const rollback = await this.getSubTeams();
            notifyOptimisticUpdate('sub_teams', rollback);
          }
        );
      }
    })();
  },

  // Batch load all collections from API (fast initial load)
  async batchLoadAll(): Promise<{
    users: User[];
    tasks: Task[];
    teams: Team[];
    subTeams: SubTeam[];
    templates: TaskTemplate[];
    settings: AppSetting[];
    emailTemplates: EmailTemplate[];
    reports: TaskReport[];
    followups: FollowUp[];
    subtasks: Subtask[];
    comments: Comment[];
    teamSubmissions: TeamSubmission[];
    audits: AuditLog[];  
  }> {
    // Read all collections from API in parallel
    const [
      usersRaw,
      tasksRaw,
      teams,
      subTeams,
      templates,
      settings,
      emailTemplates,
      reports,
      followups,
      subtasks,
      comments,
      teamSubmissions,
      audits  
    ] = await Promise.all([
      api.get<any[]>('/users'),
      api.get<any[]>('/tasks'),
      api.get<Team[]>('/teams'),
      api.get<SubTeam[]>('/sub-teams'),
      api.get<TaskTemplate[]>('/templates'),
      api.get<AppSetting[]>('/settings'),
      api.get<EmailTemplate[]>('/email-templates'),
      api.get<TaskReport[]>('/reports'),
      api.get<FollowUp[]>('/followups'),
      api.get<Subtask[]>('/subtasks'),
      api.get<Comment[]>('/comments'),
      api.get<TeamSubmission[]>('/team-submissions'),
      api.get<AuditLog[]>('/auditlogs')
    ]);

    // Apply the same data transformations as individual getters
    const users: User[] = usersRaw.map(u => {
      return {
        ...u,
        TeamIDs: u.TeamIDs 
          ? (Array.isArray(u.TeamIDs) ? u.TeamIDs : [u.TeamIDs]) 
          : (u.TeamID ? [u.TeamID] : []),
        TeamNames: u.TeamNames 
          ? (Array.isArray(u.TeamNames) ? u.TeamNames : [u.TeamNames]) 
          : (u.TeamName ? [u.TeamName] : []),
        TeamID: u.TeamID || (u.TeamIDs && u.TeamIDs.length > 0 ? (Array.isArray(u.TeamIDs) ? u.TeamIDs[0] : u.TeamIDs) : ''),
        TeamName: u.TeamName || (u.TeamNames && u.TeamNames.length > 0 ? (Array.isArray(u.TeamNames) ? u.TeamNames[0] : u.TeamNames) : '')
      };
    });

    const tasks: Task[] = tasksRaw.map(t => {
      return {
        ...t,
        AssignedToTeamIDs: t.AssignedToTeamIDs 
          ? (Array.isArray(t.AssignedToTeamIDs) 
              ? t.AssignedToTeamIDs 
              : [t.AssignedToTeamIDs]) 
          : (t.TeamID ? [t.TeamID] : []),
      };
    });

    // Teams already have TeamLeaderEmails attached from server
    // Sub-teams already have SubTeamLeaderEmails attached from server

    // Populate cache for each collection so subsequent
    // individual reads hit cache, not API
    setCache('users', users);
    setCache('tasks', tasks);
    setCache('teams', teams);
    setCache('sub_teams', subTeams);
    setCache('templates', templates);
    setCache('settings', settings);
    setCache('email_templates', emailTemplates);
    setCache('reports', reports);
    setCache('followups', followups);
    setCache('subtasks', subtasks);
    setCache('comments', comments);
    setCache('teamSubmissions', teamSubmissions);
    setCache('auditlogs', audits);

    return {
      users,
      tasks,
      teams,
      subTeams,
      templates,
      settings,
      emailTemplates,
      reports,
      followups,
      subtasks,
      comments,
      teamSubmissions,
      audits
    };
  },

  // Targeted sync for specific collections (for SSE-based sync)
  async syncCollections(collections: string[]): Promise<void> {
    const syncInProgress = new Set<string>();
    
    // Guard against concurrent syncs for same collection
    for (const collection of collections) {
      if (syncInProgress.has(collection)) {
        logger.log(`Skipping ${collection} - sync already in progress`);
        continue;
      }
      syncInProgress.add(collection);
    }

    try {
      // Fetch collections sequentially to avoid rate limiting
      const results = [];
      for (const collection of collections) {
        try {
          // Clear cache for this collection
          clearCache(collection);

          // Fetch fresh data based on collection name
          let result;
          switch (collection) {
            case 'users':
              result = await this.getUsers();
              break;
            case 'teams':
              result = await this.getTeams();
              break;
            case 'sub_teams':
              result = await this.getSubTeams();
              break;
            case 'templates':
              result = await this.getTemplates();
              break;
            case 'tasks':
              result = await this.getTasks();
              break;
            case 'reports':
              result = await this.getReports();
              break;
            case 'followups':
              result = await this.getFollowups();
              break;
            case 'settings':
              result = await this.getSettings();
              break;
            case 'subtasks':
              result = await this.getSubtasks();
              break;
            case 'comments':
              result = await this.getComments();
              break;
            case 'auditlogs':
              result = await this.getAudits();
              break;
            default:
              result = null;
          }
          results.push({ status: 'fulfilled', value: result });
          
          // Add a small delay between collections to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          results.push({ status: 'rejected', reason: error });
        }
      }

      logger.log(`Synced collections: ${collections.join(', ')}`);
    } finally {
      collections.forEach(collection => syncInProgress.delete(collection));
    }
  },

  async logAction(
    entityType: string,
    entityId: string,
    action: string,
    actionByEmail: string,
    oldValue: any = null,
    newValue: any = null
  ): Promise<void> {
    try {
      const now = new Date().toISOString();
      const logId = `LOG-${Math.floor(100000 + Math.random() * 900000)}`;
      const logRecord = {
        LogID: logId,
        EntityType: entityType,
        EntityID: entityId,
        Action: action,
        OldValueJSON: oldValue ? JSON.stringify(oldValue) : '',
        NewValueJSON: newValue ? JSON.stringify(newValue) : '',
        ActionByEmail: actionByEmail || 'system',
        ActionDateTime: now
      };
      await sheetsApi.appendRecord('auditlogs', logRecord);
      
      // API write to Firestore
      try {
        await api.post('/auditlogs', logRecord);
      } catch (err) {
      }
    } catch (error) {
    }
  }
};
