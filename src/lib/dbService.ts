// Firestore-First, Sheets-Deferred Database Layer
// All writes go to Firestore immediately for instant UI updates
// Google Sheets sync runs in background every 5 minutes as a batch flush

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
  TeamSubmission
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
import { db } from './firestoreConfig';
import { doc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, getDoc, query, where } from 'firebase/firestore';

// Operation Types for Audit & Error Hooks
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// In-memory cache for performance (not persistence)
// This cache is cleared on page refresh and is only for performance optimization
const memoryCache = new Map<string, any[]>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Pending Sheets write queue for deferred sync
// Structure: Map<collectionName, Array<{operation: 'save'|'delete', data: any}>>
const pendingSheetsWrites = new Map<string, Array<{operation: 'save' | 'delete', data: any}>>();

// Sync status for UI indicator
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

// Exponential backoff wrapper for Sheets API calls
async function writeWithBackoff(fn: () => Promise<any>, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (err?.status === 429 && i < retries - 1) {
        const delay = Math.pow(2, i) * 1000;
        console.log(`Rate limited (429), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error('Max retries exceeded');
}

// Enqueue a Sheets write operation
function enqueueSheetsWrite(collection: string, operation: 'save' | 'delete', data: any): void {
  if (!pendingSheetsWrites.has(collection)) {
    pendingSheetsWrites.set(collection, []);
  }
  pendingSheetsWrites.get(collection)!.push({ operation, data });
  setSyncStatus('syncing');
}

// Background sync interval - flushes pending Sheets writes every 5 minutes
let syncIntervalId: NodeJS.Timeout | null = null;

export function startSheetsSyncInterval(): void {
  if (syncIntervalId) {
    console.log('Sheets sync interval already running');
    return;
  }

  console.log('Starting Sheets sync interval (5 minutes)');
  syncIntervalId = setInterval(async () => {
    if (pendingSheetsWrites.size === 0) {
      return; // No pending writes
    }

    console.log(`Flushing ${pendingSheetsWrites.size} collections to Sheets...`);
    setSyncStatus('syncing');

    const collections = Array.from(pendingSheetsWrites.entries());
    pendingSheetsWrites.clear();

    for (const [collectionName, operations] of collections) {
      try {
        // Get current data from Firestore for this collection
        let currentData: any[] = [];
        switch (collectionName) {
          case 'users':
            currentData = await dbService.getUsers();
            break;
          case 'teams':
            currentData = await dbService.getTeams();
            break;
          case 'sub_teams':
            currentData = await dbService.getSubTeams();
            break;
          case 'templates':
            currentData = await dbService.getTemplates();
            break;
          case 'tasks':
            currentData = await dbService.getTasks();
            break;
          case 'reports':
            currentData = await dbService.getReports();
            break;
          case 'followups':
            currentData = await dbService.getFollowups();
            break;
          case 'settings':
            currentData = await dbService.getSettings();
            break;
          case 'subtasks':
            currentData = await dbService.getSubtasks();
            break;
          case 'comments':
            currentData = await dbService.getComments();
            break;
          case 'team_submissions':
            currentData = await dbService.getTeamSubmissions();
            break;
          default:
            console.warn(`Unknown collection: ${collectionName}`);
            continue;
        }

        // Apply pending operations to current data
        for (const op of operations) {
          if (op.operation === 'delete') {
            const idField = getIdFieldForCollection(collectionName);
            currentData = currentData.filter((item: any) => item[idField] !== op.data);
          }
          // 'save' operations are already reflected in currentData from Firestore
        }

        // Write entire collection to Sheets with backoff
        await writeWithBackoff(() => sheetsApi.saveCollection(collectionName as any, currentData));
        console.log(`Successfully synced ${collectionName} to Sheets`);

      } catch (err) {
        console.error(`Sheets sync failed for ${collectionName}:`, err);
        // Re-enqueue failed operations
        const existingOps = pendingSheetsWrites.get(collectionName) || [];
        pendingSheetsWrites.set(collectionName, [...existingOps, ...operations]);
        setSyncStatus('error');
      }
    }

    if (pendingSheetsWrites.size === 0) {
      setSyncStatus('synced');
    }
  }, 5 * 60 * 1000); // 5 minutes
}

export function stopSheetsSyncInterval(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
    console.log('Stopped Sheets sync interval');
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
    team_submissions: 'SubmissionID'
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
    console.error("Failed to initialize database:", error);
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
  const FIRESTORE_TIMEOUT_MS = 15000; // 15 second timeout for Firestore (was working before)
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
      const snapshot = await getDocs(collection(db, 'users'));
      const users: User[] = snapshot.docs.map(doc => {
        const u = doc.data() as any;
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
      throw new Error(`Failed to load users from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveUser(user: User): Promise<void> {
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

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        // Strip undefined fields — Firestore setDoc() rejects undefined values.
        // This matters for optional fields like SubTeamID/SubTeamName which may
        // be explicitly set to undefined when removing a user from a sub-team.
        const persistableUser = Object.fromEntries(
          Object.entries(finalUser).filter(([, v]) => v !== undefined)
        ) as unknown as User;
        await setDoc(doc(db, 'users', user.Email), persistableUser);
        enqueueSheetsWrite('users', 'save', persistableUser);
        notifyChange('users', 'updated', user.UserID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveUser:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'users'));
        const rollbackData: User[] = rollback.docs.map(d => {
          const u = d.data() as any;
          return {
            ...u,
            TeamIDs: u.TeamIDs ? (Array.isArray(u.TeamIDs) ? u.TeamIDs : [u.TeamIDs]) : (u.TeamID ? [u.TeamID] : []),
            TeamNames: u.TeamNames ? (Array.isArray(u.TeamNames) ? u.TeamNames : [u.TeamNames]) : (u.TeamName ? [u.TeamName] : []),
            TeamID: u.TeamID || (u.TeamIDs && u.TeamIDs.length > 0 ? (Array.isArray(u.TeamIDs) ? u.TeamIDs[0] : u.TeamIDs) : ''),
            TeamName: u.TeamName || (u.TeamNames && u.TeamNames.length > 0 ? (Array.isArray(u.TeamNames) ? u.TeamNames[0] : u.TeamNames) : '')
          };
        });
        setCache('users', rollbackData);
        notifyOptimisticUpdate('users', rollbackData);
        throw new Error(`Failed to save user: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Teams Service
  async getTeams(): Promise<Team[]> {
    const cached = getFromCache<Team>('teams');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'teams'));
      const teams = snapshot.docs.map(doc => doc.data() as Team);

      // Load team leader emails from settings and attach to teams
      const settingsSnapshot = await getDocs(collection(db, 'settings'));
      const settings = settingsSnapshot.docs.map(doc => doc.data() as AppSetting);

      const teamsWithLeaders = teams.map(team => {
        const leaderSetting = settings.find(s => s.Key === `team_${team.TeamID}_leaders`);
        const leaderEmails = leaderSetting?.Value ? leaderSetting.Value.split(',').map(e => e.trim()).filter(Boolean) : [];
        return {
          ...team,
          TeamLeaderEmails: leaderEmails
        };
      });

      setCache('teams', teamsWithLeaders);
      return teamsWithLeaders;
    } catch (error) {
      throw new Error(`Failed to load teams from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        await setDoc(doc(db, 'teams', team.TeamID), teamToSave);
        enqueueSheetsWrite('teams', 'save', teamToSave);
        notifyChange('teams', 'updated', team.TeamID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTeam:', err);
        const rollback = await getDocs(collection(db, 'teams'));
        const rollbackData = rollback.docs.map(d => d.data() as Team);
        setCache('teams', rollbackData);
        notifyOptimisticUpdate('teams', rollbackData);
        throw new Error(`Failed to save team: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
      try {
        await updateDoc(doc(db, 'teams', teamId), { Active: team.Active, UpdatedAt: now });
        enqueueSheetsWrite('teams', 'save', team);
        notifyChange('teams', 'updated', teamId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — toggleTeamStatus:', err);
        const rollback = await getDocs(collection(db, 'teams'));
        const rollbackData = rollback.docs.map(d => d.data() as Team);
        setCache('teams', rollbackData);
        notifyOptimisticUpdate('teams', rollbackData);
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
      try {
        await deleteDoc(doc(db, 'teams', teamId));
        enqueueSheetsWrite('teams', 'delete', teamId);
        notifyChange('teams', 'deleted', teamId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteTeam:', err);
        const rollback = await getDocs(collection(db, 'teams'));
        const rollbackData = rollback.docs.map(d => d.data() as Team);
        setCache('teams', rollbackData);
        notifyOptimisticUpdate('teams', rollbackData);
        throw new Error(`Failed to delete team: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Task Templates
  async getTemplates(): Promise<TaskTemplate[]> {
    const cached = getFromCache<TaskTemplate>('templates');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'templates'));
      const templates = snapshot.docs.map(doc => doc.data() as TaskTemplate);
      setCache('templates', templates);
      return templates;
    } catch (error) {
      throw new Error(`Failed to load templates from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      try {
        await setDoc(doc(db, 'templates', template.TemplateID), templateToSave);
        enqueueSheetsWrite('templates', 'save', templateToSave);
        notifyChange('templates', 'updated', template.TemplateID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTemplate:', err);
        const rollback = await getDocs(collection(db, 'templates'));
        const rollbackData = rollback.docs.map(d => d.data() as TaskTemplate);
        setCache('templates', rollbackData);
        notifyOptimisticUpdate('templates', rollbackData);
        throw new Error(`Failed to save template: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
      try {
        await deleteDoc(doc(db, 'templates', templateId));
        enqueueSheetsWrite('templates', 'delete', templateId);
        notifyChange('templates', 'deleted', templateId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteTemplate:', err);
        const rollback = await getDocs(collection(db, 'templates'));
        const rollbackData = rollback.docs.map(d => d.data() as TaskTemplate);
        setCache('templates', rollbackData);
        notifyOptimisticUpdate('templates', rollbackData);
        throw new Error(`Failed to delete template: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Live Tasks
  async getTasks(): Promise<Task[]> {
    const cached = getFromCache<Task>('tasks');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'tasks'));
      const tasks: Task[] = snapshot.docs.map(doc => {
        const t = doc.data() as any;
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
      throw new Error(`Failed to load tasks from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      try {
        await setDoc(doc(db, 'tasks', task.TaskID), finalTask);
        enqueueSheetsWrite('tasks', 'save', finalTask);
        notifyChange('tasks', 'updated', task.TaskID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTask:', err);
        const rollback = await getDocs(collection(db, 'tasks'));
        const rollbackData: Task[] = rollback.docs.map(d => {
          const t = d.data() as any;
          return { ...t, AssignedToTeamIDs: t.AssignedToTeamIDs ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs : [t.AssignedToTeamIDs]) : (t.TeamID ? [t.TeamID] : []) };
        });
        setCache('tasks', rollbackData);
        notifyOptimisticUpdate('tasks', rollbackData);
        throw new Error(`Failed to save task: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
        enqueueSheetsWrite('tasks', 'delete', taskId);
        notifyChange('tasks', 'deleted', taskId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteTask:', err);
        const rollback = await getDocs(collection(db, 'tasks'));
        const rollbackData: Task[] = rollback.docs.map(d => {
          const t = d.data() as any;
          return { ...t, AssignedToTeamIDs: t.AssignedToTeamIDs ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs : [t.AssignedToTeamIDs]) : (t.TeamID ? [t.TeamID] : []) };
        });
        setCache('tasks', rollbackData);
        notifyOptimisticUpdate('tasks', rollbackData);
        throw new Error(`Failed to delete task: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Reports
  async getReports(): Promise<TaskReport[]> {
    const cached = getFromCache<TaskReport>('reports');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'reports'));
      const reports = snapshot.docs.map(doc => doc.data() as TaskReport);
      setCache('reports', reports);
      return reports;
    } catch (error) {
      throw new Error(`Failed to load reports from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveReport(report: TaskReport): Promise<void> {
    const reports = await this.getReports();
    reports.push(report);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('reports', reports);
    notifyOptimisticUpdate('reports', reports);

    (async () => {
      try {
        await setDoc(doc(db, 'reports', report.ReportID), report);
        enqueueSheetsWrite('reports', 'save', report);
        notifyChange('reports', 'created', report.ReportID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveReport:', err);
        const rollback = await getDocs(collection(db, 'reports'));
        const rollbackData = rollback.docs.map(d => d.data() as TaskReport);
        setCache('reports', rollbackData);
        notifyOptimisticUpdate('reports', rollbackData);
        throw new Error(`Failed to save report: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Follow-ups
  async getFollowups(): Promise<FollowUp[]> {
    const cached = getFromCache<FollowUp>('followups');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'followups'));
      const followups = snapshot.docs.map(doc => doc.data() as FollowUp);
      setCache('followups', followups);
      return followups;
    } catch (error) {
      throw new Error(`Failed to load followups from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveFollowup(follow: FollowUp): Promise<void> {
    const followups = await this.getFollowups();
    followups.push(follow);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('followups', followups);
    notifyOptimisticUpdate('followups', followups);

    (async () => {
      try {
        await setDoc(doc(db, 'followups', follow.FollowUpID), follow);
        enqueueSheetsWrite('followups', 'save', follow);
        notifyChange('followups', 'created', follow.FollowUpID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveFollowup:', err);
        const rollback = await getDocs(collection(db, 'followups'));
        const rollbackData = rollback.docs.map(d => d.data() as FollowUp);
        setCache('followups', rollbackData);
        notifyOptimisticUpdate('followups', rollbackData);
        throw new Error(`Failed to save followup: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Settings
  async getSettings(): Promise<AppSetting[]> {
    const cached = getFromCache<AppSetting>('settings');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'settings'));
      const settings = snapshot.docs.map(doc => doc.data() as AppSetting);
      setCache('settings', settings);
      return settings;
    } catch (error) {
      throw new Error(`Failed to load settings from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        for (const setting of settingsList) {
          await setDoc(doc(db, 'settings', setting.Key), setting);
        }
        enqueueSheetsWrite('settings', 'save', settingsList);
        notifyChange('settings', 'updated', 'settings').catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSettings:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'settings'));
        const rollbackData = rollback.docs.map(d => d.data() as AppSetting);
        setCache('settings', rollbackData);
        notifyOptimisticUpdate('settings', rollbackData);
        throw new Error(`Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Email Templates
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    const cached = getFromCache<EmailTemplate>('email_templates');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'email_templates'));
      const emailTemplates = snapshot.docs.map(doc => doc.data() as EmailTemplate);
      setCache('email_templates', emailTemplates);
      return emailTemplates;
    } catch (error) {
      throw new Error(`Failed to load email templates from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveEmailTemplates(emailTemplatesList: EmailTemplate[]): Promise<void> {
    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('email_templates', emailTemplatesList);
    notifyOptimisticUpdate('email_templates', emailTemplatesList);

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        for (const template of emailTemplatesList) {
          await setDoc(doc(db, 'email_templates', template.Key), template);
        }
        enqueueSheetsWrite('email_templates', 'save', emailTemplatesList);
        notifyChange('email_templates', 'updated', 'email_templates').catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveEmailTemplates:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'email_templates'));
        const rollbackData = rollback.docs.map(d => d.data() as EmailTemplate);
        setCache('email_templates', rollbackData);
        notifyOptimisticUpdate('email_templates', rollbackData);
        throw new Error(`Failed to save email templates: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Subtasks Service
  async getSubtasks(): Promise<Subtask[]> {
    const cached = getFromCache<Subtask>('subtasks');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'subtasks'));
      const subtasks = snapshot.docs.map(doc => doc.data() as Subtask);
      setCache('subtasks', subtasks);
      return subtasks;
    } catch (error) {
      throw new Error(`Failed to load subtasks from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        await setDoc(doc(db, 'subtasks', subtask.SubtaskID), subtaskToSave);
        enqueueSheetsWrite('subtasks', 'save', subtaskToSave);
        notifyChange('subtasks', 'updated', subtask.SubtaskID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSubtask:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'subtasks'));
        const rollbackData = rollback.docs.map(d => d.data() as Subtask);
        setCache('subtasks', rollbackData);
        notifyOptimisticUpdate('subtasks', rollbackData);
        throw new Error(`Failed to save subtask: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

    // Background async: Write to Firestore (batch), then queue Sheets sync
    (async () => {
      try {
        const { writeBatch } = await import('firebase/firestore');
        const wb = writeBatch(db);
        for (const s of newSubtasks) {
          wb.set(doc(db, 'subtasks', s.SubtaskID), s);
        }
        await wb.commit();
        enqueueSheetsWrite('subtasks', 'save', updated);
        notifyChange('subtasks', 'updated', taskId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSubtasksBatch:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'subtasks'));
        const rollbackData = rollback.docs.map(d => d.data() as Subtask);
        setCache('subtasks', rollbackData);
        notifyOptimisticUpdate('subtasks', rollbackData);
        throw new Error(`Failed to save subtasks batch: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Comments Service
  async getComments(): Promise<Comment[]> {
    const cached = getFromCache<Comment>('comments');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'comments'));
      const comments = snapshot.docs.map(doc => doc.data() as Comment);
      setCache('comments', comments);
      return comments;
    } catch (error) {
      throw new Error(`Failed to load comments from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveComment(comment: Comment): Promise<void> {
    const comments = await this.getComments();
    comments.push(comment);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('comments', comments);
    notifyOptimisticUpdate('comments', comments);

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        await setDoc(doc(db, 'comments', comment.CommentID), comment);
        enqueueSheetsWrite('comments', 'save', comment);
        notifyChange('comments', 'created', comment.CommentID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveComment:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'comments'));
        const rollbackData = rollback.docs.map(d => d.data() as Comment);
        setCache('comments', rollbackData);
        notifyOptimisticUpdate('comments', rollbackData);
        throw new Error(`Failed to save comment: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  async getTeamSubmissions(): Promise<TeamSubmission[]> {
    const cached = getFromCache<TeamSubmission>('teamSubmissions');
    if (cached) return cached;
 
    try {
      const snapshot = await getDocs(collection(db, 'team_submissions'));
      const submissions = snapshot.docs.map(doc => doc.data() as TeamSubmission);
      setCache('teamSubmissions', submissions);
      return submissions;
    } catch (error) {
      throw new Error(`Failed to load team submissions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
 
async saveTeamSubmission(submission: TeamSubmission): Promise<void> {
    // Strip undefined fields — Firestore setDoc() rejects undefined values
    const sanitizedSubmission = Object.fromEntries(
      Object.entries(submission).filter(([, v]) => v !== undefined)
    ) as TeamSubmission;

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    const cached = getFromCache('teamSubmissions') as TeamSubmission[] || [];
    setCache('teamSubmissions', [...cached, sanitizedSubmission]);
    notifyOptimisticUpdate('teamSubmissions', [...cached, sanitizedSubmission]);

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        await setDoc(doc(db, 'team_submissions', submission.SubmissionID), sanitizedSubmission);
        enqueueSheetsWrite('team_submissions', 'save', submission);
        notifyChange('team_submissions', 'created', submission.SubmissionID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTeamSubmission:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'team_submissions'));
        const rollbackData = rollback.docs.map(d => d.data() as TeamSubmission);
        setCache('teamSubmissions', rollbackData);
        notifyOptimisticUpdate('teamSubmissions', rollbackData);
        throw new Error(`Failed to save team submission: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
      const snapshot = await getDocs(collection(db, 'sub_teams'));
      const subTeams = snapshot.docs.map(doc => doc.data() as SubTeam);

      // Attach sub-team leader emails from settings (same pattern as TeamLeaderEmails)
      const settingsSnapshot = await getDocs(collection(db, 'settings'));
      const settings = settingsSnapshot.docs.map(doc => doc.data() as AppSetting);

      const subTeamsWithLeaders = subTeams.map(st => {
        const key = `team_${st.TeamID}_subteam_${st.SubTeamID}_leaders`;
        const leaderSetting = settings.find(s => s.Key === key);
        const leaderEmails = leaderSetting?.Value
          ? leaderSetting.Value.split(',').map(e => e.trim()).filter(Boolean)
          : [];
        return { ...st, SubTeamLeaderEmails: leaderEmails };
      });

      setCache('sub_teams', subTeamsWithLeaders);
      return subTeamsWithLeaders;
    } catch (error) {
      throw new Error(`Failed to load sub-teams from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveSubTeam(subTeam: SubTeam): Promise<void> {
    const subTeams = await this.getSubTeams();
    const idx = subTeams.findIndex(st => st.SubTeamID === subTeam.SubTeamID);
    const now = new Date().toISOString();

    const subTeamToSave = idx >= 0
      ? { ...subTeams[idx], ...subTeam, UpdatedAt: now }
      : { ...subTeam, CreatedAt: now, UpdatedAt: now, SubTeamLeaderEmails: subTeam.SubTeamLeaderEmails ?? [] };

    // Strip derived field before persisting
    const { SubTeamLeaderEmails: _derived, ...persistable } = subTeamToSave;

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    if (idx >= 0) {
      subTeams[idx] = subTeamToSave;
    } else {
      subTeams.push(subTeamToSave);
    }
    setCache('sub_teams', subTeams);
    notifyOptimisticUpdate('sub_teams', subTeams);

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        // Strip undefined fields — Firestore setDoc() rejects undefined values.
        const sanitized = Object.fromEntries(
          Object.entries(persistable).filter(([, v]) => v !== undefined)
        );
        await setDoc(doc(db, 'sub_teams', subTeam.SubTeamID), sanitized);
        enqueueSheetsWrite('sub_teams', 'save', sanitized);
        notifyChange('sub_teams', 'updated', subTeam.SubTeamID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSubTeam:', err);
        // Rollback optimistic update
        clearCache('sub_teams');
        const rollback = await this.getSubTeams();
        notifyOptimisticUpdate('sub_teams', rollback);
        throw new Error(`Failed to save sub-team: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  async deleteSubTeam(subTeamId: string): Promise<void> {
    const subTeams = await this.getSubTeams();
    const filtered = subTeams.filter(st => st.SubTeamID !== subTeamId);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    setCache('sub_teams', filtered);
    notifyOptimisticUpdate('sub_teams', filtered);

    // Background async: Delete from Firestore, then queue Sheets sync
    (async () => {
      try {
        await deleteDoc(doc(db, 'sub_teams', subTeamId));
        enqueueSheetsWrite('sub_teams', 'delete', subTeamId);
        notifyChange('sub_teams', 'deleted', subTeamId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteSubTeam:', err);
        // Rollback optimistic update
        clearCache('sub_teams');
        const rollback = await this.getSubTeams();
        notifyOptimisticUpdate('sub_teams', rollback);
        throw new Error(`Failed to delete sub-team: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    })();
  },

  // Batch load all collections from Firestore (fast initial load)
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
  }> {
    // Read all collections from Firestore in parallel
    const [
      usersSnapshot,
      tasksSnapshot,
      teamsSnapshot,
      subTeamsSnapshot,
      templatesSnapshot,
      settingsSnapshot,
      emailTemplatesSnapshot,
      reportsSnapshot,
      followupsSnapshot,
      subtasksSnapshot,
      commentsSnapshot,
      teamSubmissionsSnapshot
    ] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'tasks')),
      getDocs(collection(db, 'teams')),
      getDocs(collection(db, 'sub_teams')),
      getDocs(collection(db, 'templates')),
      getDocs(collection(db, 'settings')),
      getDocs(collection(db, 'email_templates')),
      getDocs(collection(db, 'reports')),
      getDocs(collection(db, 'followups')),
      getDocs(collection(db, 'subtasks')),
      getDocs(collection(db, 'comments')),
      getDocs(collection(db, 'team_submissions'))
    ]);

    // Apply the same data transformations as individual getters
    const users: User[] = usersSnapshot.docs.map(doc => {
      const u = doc.data() as any;
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

    const tasks: Task[] = tasksSnapshot.docs.map(doc => {
      const t = doc.data() as any;
      return {
        ...t,
        AssignedToTeamIDs: t.AssignedToTeamIDs 
          ? (Array.isArray(t.AssignedToTeamIDs) 
              ? t.AssignedToTeamIDs 
              : [t.AssignedToTeamIDs]) 
          : (t.TeamID ? [t.TeamID] : []),
      };
    });

    const teams: Team[] = teamsSnapshot.docs.map(doc => doc.data() as Team);
    const templates: TaskTemplate[] = templatesSnapshot.docs.map(doc => doc.data() as TaskTemplate);
    const settings: AppSetting[] = settingsSnapshot.docs.map(doc => doc.data() as AppSetting);

    // Attach team leader emails to teams from settings
    const teamsWithLeaders = teams.map(team => {
      const leaderSetting = settings.find(s => s.Key === `team_${team.TeamID}_leaders`);
      const leaderEmails = leaderSetting?.Value ? leaderSetting.Value.split(',').map(e => e.trim()).filter(Boolean) : [];
      return {
        ...team,
        TeamLeaderEmails: leaderEmails
      };
    });

    // Attach sub-team leader emails from settings (mirrors TeamLeaderEmails pattern)
    const rawSubTeams: SubTeam[] = subTeamsSnapshot.docs.map(doc => doc.data() as SubTeam);
    const subTeams: SubTeam[] = rawSubTeams.map(st => {
      const key = `team_${st.TeamID}_subteam_${st.SubTeamID}_leaders`;
      const leaderSetting = settings.find(s => s.Key === key);
      const leaderEmails = leaderSetting?.Value
        ? leaderSetting.Value.split(',').map(e => e.trim()).filter(Boolean)
        : [];
      return { ...st, SubTeamLeaderEmails: leaderEmails };
    });

    const emailTemplates: EmailTemplate[] = emailTemplatesSnapshot.docs.map(doc => doc.data() as EmailTemplate);
    const reports: TaskReport[] = reportsSnapshot.docs.map(doc => doc.data() as TaskReport);
    const followups: FollowUp[] = followupsSnapshot.docs.map(doc => doc.data() as FollowUp);
    const subtasks: Subtask[] = subtasksSnapshot.docs.map(doc => doc.data() as Subtask);
    const comments: Comment[] = commentsSnapshot.docs.map(doc => doc.data() as Comment);
    const teamSubmissions: TeamSubmission[] = teamSubmissionsSnapshot.docs.map(doc => doc.data() as TeamSubmission);

    // Populate cache for each collection so subsequent
    // individual reads hit cache, not Firestore
    setCache('users', users);
    setCache('tasks', tasks);
    setCache('teams', teamsWithLeaders);
    setCache('sub_teams', subTeams);
    setCache('templates', templates);
    setCache('settings', settings);
    setCache('emailTemplates', emailTemplates);
    setCache('reports', reports);
    setCache('followups', followups);
    setCache('subtasks', subtasks);
    setCache('comments', comments);
    setCache('teamSubmissions', teamSubmissions);

    return {
      users,
      tasks,
      teams: teamsWithLeaders,
      subTeams,
      templates,
      settings,
      emailTemplates,
      reports,
      followups,
      subtasks,
      comments,
      teamSubmissions
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
            default:
              console.warn(`Unknown collection: ${collection}`);
              result = null;
          }
          results.push({ status: 'fulfilled', value: result });
          
          // Add a small delay between collections to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          console.error(`Failed to sync ${collection}:`, error);
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
      
      // Firestore write
      try {
        await addDoc(collection(db, 'auditlogs'), logRecord);
      } catch (err) {
        console.error('Firestore write failed — logAction:', err);
      }
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
};
