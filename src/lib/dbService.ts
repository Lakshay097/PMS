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
import { notifyChange, api } from '../api/client';
import { db } from './firestoreConfig';
import { doc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, getDoc, query, where, orderBy, limit } from 'firebase/firestore';
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

/**
 * Strip undefined-valued keys from an object before Firestore write.
 * Firestore setDoc() rejects undefined values, so we sanitize to prevent
 * write failures. Preserves null and other falsy-but-valid values (0, '', false).
 */
function sanitizeForFirestore<T>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj as Record<string, unknown>).filter(([, v]) => v !== undefined)
  ) as T;
}

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
        console.log(`Rate limited (429), retrying in ${delay}ms...`);
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
    console.error('Failed to enqueue Sheets write to server:', error);
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
        const persistableUser = sanitizeForFirestore(finalUser) as unknown as User;
        await setDoc(doc(db, 'users', user.Email), persistableUser);
        await enqueueSheetsWrite('users', 'save', persistableUser);
        notifyChange('users', 'updated', user.UserID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveUser, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        // Enqueue to syncQueue for retry with user notification
        syncQueue.enqueue(
          'users',
          user.UserID,
          async () => {
            const persistableUser = sanitizeForFirestore(finalUser) as unknown as User;
            await setDoc(doc(db, 'users', user.Email), persistableUser);
            await enqueueSheetsWrite('users', 'save', persistableUser);
            notifyChange('users', 'updated', user.UserID).catch(() => {});
          },
          () => {
            // onRetry: show toast notification
            console.log(`Retrying saveUser for ${user.UserID}`);
          },
          () => {
            // onFail: show error toast and rollback
            console.error(`Failed to save user ${user.UserID} after retries`);
            // Rollback optimistic update
            const rollback = async () => {
              const rollbackSnapshot = await getDocs(collection(db, 'users'));
              const rollbackData: User[] = rollbackSnapshot.docs.map(d => {
                const u = d.data() as any;
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
            rollback().catch(console.error);
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
        const sanitizedTeam = sanitizeForFirestore(teamToSave);
        await setDoc(doc(db, 'teams', team.TeamID), sanitizedTeam);
        await enqueueSheetsWrite('teams', 'save', sanitizedTeam);
        notifyChange('teams', 'updated', team.TeamID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTeam, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'teams',
          team.TeamID,
          async () => {
            const sanitizedTeam = sanitizeForFirestore(teamToSave);
            await setDoc(doc(db, 'teams', team.TeamID), sanitizedTeam);
            await enqueueSheetsWrite('teams', 'save', sanitizedTeam);
            notifyChange('teams', 'updated', team.TeamID).catch(() => {});
          },
          () => console.log(`Retrying saveTeam for ${team.TeamID}`),
          async () => {
            console.error(`Failed to save team ${team.TeamID} after retries`);
            const rollback = await getDocs(collection(db, 'teams'));
            const rollbackData = rollback.docs.map(d => d.data() as Team);
            setCache('teams', rollbackData);
            notifyOptimisticUpdate('teams', rollbackData);
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
      try {
        const sanitizedUpdate = sanitizeForFirestore({ Active: team.Active, UpdatedAt: now });
        await updateDoc(doc(db, 'teams', teamId), sanitizedUpdate);
        await enqueueSheetsWrite('teams', 'save', team);
        notifyChange('teams', 'updated', teamId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — toggleTeamStatus, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'teams',
          teamId,
          async () => {
            const sanitizedUpdate = sanitizeForFirestore({ Active: team.Active, UpdatedAt: now });
            await updateDoc(doc(db, 'teams', teamId), sanitizedUpdate);
            await enqueueSheetsWrite('teams', 'save', team);
            notifyChange('teams', 'updated', teamId).catch(() => {});
          },
          () => console.log(`Retrying toggleTeamStatus for ${teamId}`),
          async () => {
            console.error(`Failed to toggle team status ${teamId} after retries`);
            const rollback = await getDocs(collection(db, 'teams'));
            const rollbackData = rollback.docs.map(d => d.data() as Team);
            setCache('teams', rollbackData);
            notifyOptimisticUpdate('teams', rollbackData);
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
      try {
        await deleteDoc(doc(db, 'teams', teamId));
        await enqueueSheetsWrite('teams', 'delete', teamId);
        notifyChange('teams', 'deleted', teamId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteTeam, enqueuing for retry:', err);
        syncQueue.enqueue(
          'teams',
          teamId,
          async () => {
            await deleteDoc(doc(db, 'teams', teamId));
            await enqueueSheetsWrite('teams', 'delete', teamId);
            notifyChange('teams', 'deleted', teamId).catch(() => {});
          },
          () => console.log(`Retrying deleteTeam for ${teamId}`),
          async () => {
            console.error(`Failed to delete team ${teamId} after retries`);
            const rollback = await getDocs(collection(db, 'teams'));
            const rollbackData = rollback.docs.map(d => d.data() as Team);
            setCache('teams', rollbackData);
            notifyOptimisticUpdate('teams', rollbackData);
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
        const sanitizedTemplate = sanitizeForFirestore(templateToSave);
        await setDoc(doc(db, 'templates', template.TemplateID), sanitizedTemplate);
        await enqueueSheetsWrite('templates', 'save', sanitizedTemplate);
        notifyChange('templates', 'updated', template.TemplateID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTemplate, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'templates',
          template.TemplateID,
          async () => {
            const sanitizedTemplate = sanitizeForFirestore(templateToSave);
            await setDoc(doc(db, 'templates', template.TemplateID), sanitizedTemplate);
            await enqueueSheetsWrite('templates', 'save', sanitizedTemplate);
            notifyChange('templates', 'updated', template.TemplateID).catch(() => {});
          },
          () => console.log(`Retrying saveTemplate for ${template.TemplateID}`),
          async () => {
            console.error(`Failed to save template ${template.TemplateID} after retries`);
            const rollback = await getDocs(collection(db, 'templates'));
            const rollbackData = rollback.docs.map(d => d.data() as TaskTemplate);
            setCache('templates', rollbackData);
            notifyOptimisticUpdate('templates', rollbackData);
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
      try {
        await deleteDoc(doc(db, 'templates', templateId));
        await enqueueSheetsWrite('templates', 'delete', templateId);
        notifyChange('templates', 'deleted', templateId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteTemplate, enqueuing for retry:', err);
        syncQueue.enqueue(
          'templates',
          templateId,
          async () => {
            await deleteDoc(doc(db, 'templates', templateId));
            await enqueueSheetsWrite('templates', 'delete', templateId);
            notifyChange('templates', 'deleted', templateId).catch(() => {});
          },
          () => console.log(`Retrying deleteTemplate for ${templateId}`),
          async () => {
            console.error(`Failed to delete template ${templateId} after retries`);
            const rollback = await getDocs(collection(db, 'templates'));
            const rollbackData = rollback.docs.map(d => d.data() as TaskTemplate);
            setCache('templates', rollbackData);
            notifyOptimisticUpdate('templates', rollbackData);
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
        const sanitizedTask = sanitizeForFirestore(finalTask);
        await setDoc(doc(db, 'tasks', task.TaskID), sanitizedTask);
        await enqueueSheetsWrite('tasks', 'save', sanitizedTask);
        notifyChange('tasks', 'updated', task.TaskID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTask, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'tasks',
          task.TaskID,
          async () => {
            const sanitizedTask = sanitizeForFirestore(finalTask);
            await setDoc(doc(db, 'tasks', task.TaskID), sanitizedTask);
            await enqueueSheetsWrite('tasks', 'save', sanitizedTask);
            notifyChange('tasks', 'updated', task.TaskID).catch(() => {});
          },
          () => console.log(`Retrying saveTask for ${task.TaskID}`),
          async () => {
            console.error(`Failed to save task ${task.TaskID} after retries`);
            const rollback = await getDocs(collection(db, 'tasks'));
            const rollbackData: Task[] = rollback.docs.map(d => {
              const t = d.data() as any;
              return { ...t, AssignedToTeamIDs: t.AssignedToTeamIDs ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs : [t.AssignedToTeamIDs]) : (t.TeamID ? [t.TeamID] : []) };
            });
            setCache('tasks', rollbackData);
            notifyOptimisticUpdate('tasks', rollbackData);
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
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
        await enqueueSheetsWrite('tasks', 'delete', taskId);
        notifyChange('tasks', 'deleted', taskId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteTask, enqueuing for retry:', err);
        syncQueue.enqueue(
          'tasks',
          taskId,
          async () => {
            await deleteDoc(doc(db, 'tasks', taskId));
            await enqueueSheetsWrite('tasks', 'delete', taskId);
            notifyChange('tasks', 'deleted', taskId).catch(() => {});
          },
          () => console.log(`Retrying deleteTask for ${taskId}`),
          async () => {
            console.error(`Failed to delete task ${taskId} after retries`);
            const rollback = await getDocs(collection(db, 'tasks'));
            const rollbackData: Task[] = rollback.docs.map(d => {
              const t = d.data() as any;
              return { ...t, AssignedToTeamIDs: t.AssignedToTeamIDs ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs : [t.AssignedToTeamIDs]) : (t.TeamID ? [t.TeamID] : []) };
            });
            setCache('tasks', rollbackData);
            notifyOptimisticUpdate('tasks', rollbackData);
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
        const sanitizedReport = sanitizeForFirestore(report);
        await setDoc(doc(db, 'reports', report.ReportID), sanitizedReport);
        await enqueueSheetsWrite('reports', 'save', sanitizedReport);
        notifyChange('reports', 'created', report.ReportID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveReport, enqueuing for retry:', err);
        syncQueue.enqueue(
          'reports',
          report.ReportID,
          async () => {
            const sanitizedReport = sanitizeForFirestore(report);
            await setDoc(doc(db, 'reports', report.ReportID), sanitizedReport);
            await enqueueSheetsWrite('reports', 'save', sanitizedReport);
            notifyChange('reports', 'created', report.ReportID).catch(() => {});
          },
          () => console.log(`Retrying saveReport for ${report.ReportID}`),
          async () => {
            console.error(`Failed to save report ${report.ReportID} after retries`);
            const rollback = await getDocs(collection(db, 'reports'));
            const rollbackData = rollback.docs.map(d => d.data() as TaskReport);
            setCache('reports', rollbackData);
            notifyOptimisticUpdate('reports', rollbackData);
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
        const sanitizedFollowup = sanitizeForFirestore(follow);
        await setDoc(doc(db, 'followups', follow.FollowUpID), sanitizedFollowup);
        await enqueueSheetsWrite('followups', 'save', sanitizedFollowup);
        notifyChange('followups', 'created', follow.FollowUpID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveFollowup, enqueuing for retry:', err);
        syncQueue.enqueue(
          'followups',
          follow.FollowUpID,
          async () => {
            const sanitizedFollowup = sanitizeForFirestore(follow);
            await setDoc(doc(db, 'followups', follow.FollowUpID), sanitizedFollowup);
            await enqueueSheetsWrite('followups', 'save', sanitizedFollowup);
            notifyChange('followups', 'created', follow.FollowUpID).catch(() => {});
          },
          () => console.log(`Retrying saveFollowup for ${follow.FollowUpID}`),
          async () => {
            console.error(`Failed to save followup ${follow.FollowUpID} after retries`);
            const rollback = await getDocs(collection(db, 'followups'));
            const rollbackData = rollback.docs.map(d => d.data() as FollowUp);
            setCache('followups', rollbackData);
            notifyOptimisticUpdate('followups', rollbackData);
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
          await setDoc(doc(db, 'settings', setting.Key), sanitizeForFirestore(setting));
        }
        await enqueueSheetsWrite('settings', 'save', settingsList);
        notifyChange('settings', 'updated', 'settings').catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSettings, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'settings',
          'settings',
          async () => {
            for (const setting of settingsList) {
              await setDoc(doc(db, 'settings', setting.Key), sanitizeForFirestore(setting));
            }
            await enqueueSheetsWrite('settings', 'save', settingsList);
            notifyChange('settings', 'updated', 'settings').catch(() => {});
          },
          () => console.log('Retrying saveSettings'),
          async () => {
            console.error('Failed to save settings after retries');
            const rollback = await getDocs(collection(db, 'settings'));
            const rollbackData = rollback.docs.map(d => d.data() as AppSetting);
            setCache('settings', rollbackData);
            notifyOptimisticUpdate('settings', rollbackData);
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
      // Cap to the most recent 200 entries — auditlogs is append-only and
      // unbounded, unlike the other collections, so we avoid pulling the
      // full history on every load.
      const auditQuery = query(
        collection(db, 'auditlogs'),
        orderBy('ActionDateTime', 'desc'),
        limit(200)
      );
      const snapshot = await getDocs(auditQuery);
      const audits = snapshot.docs.map(doc => doc.data() as AuditLog);
      setCache('auditlogs', audits);
      return audits;
    } catch (error) {
      throw new Error(`Failed to load audit logs from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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

    // Background async: Write to Firestore, then sync to Sheets via API
    (async () => {
      try {
        const sanitizedTemplate = sanitizeForFirestore(finalTemplate);
        await setDoc(doc(db, 'email_templates', template.templateName), sanitizedTemplate);
        
        // Synchronous Sheets write for email templates (bypass queue for send-time correctness)
        await api.post('/email/templates', {
          templateName: template.templateName,
          subject: template.subject,
          body: template.body,
        });
        
        notifyChange('email_templates', 'updated', template.templateName).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveEmailTemplate:', err);
        // Rollback optimistic update
        const rollback = await getDocs(collection(db, 'email_templates'));
        const rollbackData = rollback.docs.map(d => d.data() as EmailTemplate);
        setCache('email_templates', rollbackData);
        notifyOptimisticUpdate('email_templates', rollbackData);
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
      try {
        await deleteDoc(doc(db, 'email_templates', templateName));
        notifyChange('email_templates', 'deleted', templateName).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteEmailTemplate:', err);
        const rollback = await getDocs(collection(db, 'email_templates'));
        const rollbackData = rollback.docs.map(d => d.data() as EmailTemplate);
        setCache('email_templates', rollbackData);
        notifyOptimisticUpdate('email_templates', rollbackData);
        throw new Error(`Failed to delete email template: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
        const sanitizedSubtask = sanitizeForFirestore(subtaskToSave);
        await setDoc(doc(db, 'subtasks', subtask.SubtaskID), sanitizedSubtask);
        await enqueueSheetsWrite('subtasks', 'save', sanitizedSubtask);
        notifyChange('subtasks', 'updated', subtask.SubtaskID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSubtask, enqueuing for retry:', err);
        syncQueue.enqueue(
          'subtasks',
          subtask.SubtaskID,
          async () => {
            const sanitizedSubtask = sanitizeForFirestore(subtaskToSave);
            await setDoc(doc(db, 'subtasks', subtask.SubtaskID), sanitizedSubtask);
            await enqueueSheetsWrite('subtasks', 'save', sanitizedSubtask);
            notifyChange('subtasks', 'updated', subtask.SubtaskID).catch(() => {});
          },
          () => console.log(`Retrying saveSubtask for ${subtask.SubtaskID}`),
          async () => {
            console.error(`Failed to save subtask ${subtask.SubtaskID} after retries`);
            const rollback = await getDocs(collection(db, 'subtasks'));
            const rollbackData = rollback.docs.map(d => d.data() as Subtask);
            setCache('subtasks', rollbackData);
            notifyOptimisticUpdate('subtasks', rollbackData);
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

    // Background async: Write to Firestore (batch), then queue Sheets sync
    (async () => {
      try {
        const { writeBatch } = await import('firebase/firestore');
        const wb = writeBatch(db);
        for (const s of newSubtasks) {
          wb.set(doc(db, 'subtasks', s.SubtaskID), s);
        }
        await wb.commit();
        await enqueueSheetsWrite('subtasks', 'save', updated);
        notifyChange('subtasks', 'updated', taskId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSubtasksBatch, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'subtasks',
          taskId,
          async () => {
            const { writeBatch } = await import('firebase/firestore');
            const wb = writeBatch(db);
            for (const s of newSubtasks) {
              wb.set(doc(db, 'subtasks', s.SubtaskID), s);
            }
            await wb.commit();
            await enqueueSheetsWrite('subtasks', 'save', updated);
            notifyChange('subtasks', 'updated', taskId).catch(() => {});
          },
          () => console.log(`Retrying saveSubtasksBatch for ${taskId}`),
          async () => {
            console.error(`Failed to save subtasks batch for ${taskId} after retries`);
            const rollback = await getDocs(collection(db, 'subtasks'));
            const rollbackData = rollback.docs.map(d => d.data() as Subtask);
            setCache('subtasks', rollbackData);
            notifyOptimisticUpdate('subtasks', rollbackData);
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
        const sanitizedComment = sanitizeForFirestore(comment);
        await setDoc(doc(db, 'comments', comment.CommentID), sanitizedComment);
        await enqueueSheetsWrite('comments', 'save', sanitizedComment);
        notifyChange('comments', 'created', comment.CommentID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveComment, enqueuing for retry:', err);
        syncQueue.enqueue(
          'comments',
          comment.CommentID,
          async () => {
            const sanitizedComment = sanitizeForFirestore(comment);
            await setDoc(doc(db, 'comments', comment.CommentID), sanitizedComment);
            await enqueueSheetsWrite('comments', 'save', sanitizedComment);
            notifyChange('comments', 'created', comment.CommentID).catch(() => {});
          },
          () => console.log(`Retrying saveComment for ${comment.CommentID}`),
          async () => {
            console.error(`Failed to save comment ${comment.CommentID} after retries`);
            const rollback = await getDocs(collection(db, 'comments'));
            const rollbackData = rollback.docs.map(d => d.data() as Comment);
            setCache('comments', rollbackData);
            notifyOptimisticUpdate('comments', rollbackData);
          }
        );
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
    const sanitizedSubmission = sanitizeForFirestore(submission);

    // OPTIMISTIC UPDATE: Update cache and notify UI immediately
    const cached = getFromCache('teamSubmissions') as TeamSubmission[] || [];
    setCache('teamSubmissions', [...cached, sanitizedSubmission]);
    notifyOptimisticUpdate('teamSubmissions', [...cached, sanitizedSubmission]);

    // Background async: Write to Firestore, then queue Sheets sync
    (async () => {
      try {
        await setDoc(doc(db, 'team_submissions', submission.SubmissionID), sanitizedSubmission);
        await enqueueSheetsWrite('team_submissions', 'save', sanitizedSubmission);
        notifyChange('team_submissions', 'created', submission.SubmissionID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveTeamSubmission, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'team_submissions',
          submission.SubmissionID,
          async () => {
            await setDoc(doc(db, 'team_submissions', submission.SubmissionID), sanitizedSubmission);
            await enqueueSheetsWrite('team_submissions', 'save', sanitizedSubmission);
            notifyChange('team_submissions', 'created', submission.SubmissionID).catch(() => {});
          },
          () => console.log(`Retrying saveTeamSubmission for ${submission.SubmissionID}`),
          async () => {
            console.error(`Failed to save team submission ${submission.SubmissionID} after retries`);
            const rollback = await getDocs(collection(db, 'team_submissions'));
            const rollbackData = rollback.docs.map(d => d.data() as TeamSubmission);
            setCache('teamSubmissions', rollbackData);
            notifyOptimisticUpdate('teamSubmissions', rollbackData);
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
        const sanitized = sanitizeForFirestore(persistable);
        await setDoc(doc(db, 'sub_teams', subTeam.SubTeamID), sanitized);
        await enqueueSheetsWrite('sub_teams', 'save', sanitized);
        notifyChange('sub_teams', 'updated', subTeam.SubTeamID).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — saveSubTeam, enqueuing for retry:', err);
        syncQueue.enqueue(
          'sub_teams',
          subTeam.SubTeamID,
          async () => {
            const sanitized = sanitizeForFirestore(persistable);
            await setDoc(doc(db, 'sub_teams', subTeam.SubTeamID), sanitized);
            await enqueueSheetsWrite('sub_teams', 'save', sanitized);
            notifyChange('sub_teams', 'updated', subTeam.SubTeamID).catch(() => {});
          },
          () => console.log(`Retrying saveSubTeam for ${subTeam.SubTeamID}`),
          async () => {
            console.error(`Failed to save sub-team ${subTeam.SubTeamID} after retries`);
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

    // Background async: Delete from Firestore, then queue Sheets sync
    (async () => {
      try {
        await deleteDoc(doc(db, 'sub_teams', subTeamId));
        await enqueueSheetsWrite('sub_teams', 'delete', subTeamId);
        notifyChange('sub_teams', 'deleted', subTeamId).catch(() => {});
      } catch (err) {
        console.error('Firestore write failed — deleteSubTeam, enqueuing for retry:', err);
        notifyOfflineSave('Saved offline — will sync when connection returns');
        syncQueue.enqueue(
          'sub_teams',
          subTeamId,
          async () => {
            await deleteDoc(doc(db, 'sub_teams', subTeamId));
            await enqueueSheetsWrite('sub_teams', 'delete', subTeamId);
            notifyChange('sub_teams', 'deleted', subTeamId).catch(() => {});
          },
          () => console.log(`Retrying deleteSubTeam for ${subTeamId}`),
          async () => {
            console.error(`Failed to delete sub-team ${subTeamId} after retries`);
            clearCache('sub_teams');
            const rollback = await this.getSubTeams();
            notifyOptimisticUpdate('sub_teams', rollback);
          }
        );
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
    audits: AuditLog[];  
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
      teamSubmissionsSnapshot,
      auditsSnapshot  
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
      getDocs(collection(db, 'team_submissions')),
      getDocs(query(collection(db, 'auditlogs'), orderBy('ActionDateTime', 'desc'), limit(200)))
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
    const audits: AuditLog[] = auditsSnapshot.docs.map(doc => doc.data() as AuditLog);

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
    setCache('auditlogs', audits);

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
