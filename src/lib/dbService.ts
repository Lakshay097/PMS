// Google Sheets Primary Database Layer
// All data persistence goes directly to Google Sheets - no LocalStorage fallback

// TECH-DEBT: All writes happen client-side via dbService directly to Google Sheets.
// Ideal architecture would have server-side controllers handling writes and broadcasting SSE events.
// Deferred — requires full API layer refactor.

// TECH-DEBT: syncQueue.ts is implemented but not integrated.
// Wire into dbService.ts write failures for retry on network errors.

import {
  User,
  Team,
  Task,
  TaskTemplate,
  TaskReport,
  FollowUp,
  AppSetting,
  Subtask,
  Comment
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

function clearCache(key?: string): void {
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
          { name: 'comments', data: INITIAL_COMMENTS }
        ];

        // Process in batches of 3-4 to avoid rate limits
        const batchSize = 3;
        for (let i = 0; i < collections.length; i += batchSize) {
          const batch = collections.slice(i, i + batchSize);
          await Promise.all(batch.map(collection => 
            sheetsApi.saveCollection(collection.name as 'users' | 'teams' | 'templates' | 'tasks' | 'reports' | 'followups' | 'settings' | 'subtasks' | 'comments', collection.data)
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
    logger.error("Failed to initialize database:", error);
    throw new Error(`Failed to initialize Google Sheets database: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    try {
      const users = await this.getUsers();
      const idx = users.findIndex(u => u.UserID === user.UserID || u.Email === user.Email);
      const now = new Date().toISOString();

      const userToSave = {
        ...user,
        TeamID: user.TeamID || (user.TeamIDs && user.TeamIDs.length > 0 ? user.TeamIDs[0] : ''),
        TeamName: user.TeamName || (user.TeamNames && user.TeamNames.length > 0 ? user.TeamNames[0] : '')
      };

      if (idx >= 0) {
        users[idx] = { ...users[idx], ...userToSave, UpdatedAt: now };
        await sheetsApi.saveCollection('users', users);
      } else {
        const newUser = { ...userToSave, CreatedAt: now, UpdatedAt: now };
        users.push(newUser);
        await sheetsApi.appendRecord('users', newUser);
      }

      clearCache('users'); // Invalidate cache after write
      clearCache('teams'); // Also clear teams cache since team names might be referenced
      
      // Notify other clients immediately (fire and forget)
      notifyChange('users', 'updated', user.UserID).catch((err) => logger.warn('[dbService] notifyChange failed for users', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'users', user.Email), userToSave);
      } catch (err) {
        logger.error('Firestore write failed — saveUser:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save user to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Teams Service
  async getTeams(): Promise<Team[]> {
    const cached = getFromCache<Team>('teams');
    if (cached) return cached;

    try {
      const snapshot = await getDocs(collection(db, 'teams'));
      const teams = snapshot.docs.map(doc => doc.data() as Team);
      setCache('teams', teams);
      return teams;
    } catch (error) {
      throw new Error(`Failed to load teams from Firestore: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveTeam(team: Team): Promise<void> {
    try {
      const teams = await this.getTeams();
      const idx = teams.findIndex(t => t.TeamID === team.TeamID);
      const now = new Date().toISOString();

      if (idx >= 0) {
        teams[idx] = { ...teams[idx], ...team, UpdatedAt: now };
      } else {
        teams.push({ ...team, CreatedAt: now, UpdatedAt: now });
      }

      await sheetsApi.saveCollection('teams', teams);
      clearCache('teams');
      clearCache('users'); // Also clear users cache since team relationships might change
      
      // Notify other clients immediately (fire and forget)
      notifyChange('teams', 'updated', team.TeamID).catch((err) => logger.warn('[dbService] notifyChange failed for teams', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'teams', team.TeamID), team);
      } catch (err) {
        logger.error('Firestore write failed — saveTeam:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save team to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async toggleTeamStatus(teamId: string): Promise<void> {
    try {
      const teams = await this.getTeams();
      const team = teams.find(t => t.TeamID === teamId);
      if (team) {
        team.Active = !team.Active;
        team.UpdatedAt = new Date().toISOString();
        await sheetsApi.saveCollection('teams', teams);
        clearCache('teams');
        
        // Notify other clients immediately (fire and forget)
        notifyChange('teams', 'updated', teamId).catch((err) => logger.warn('[dbService] notifyChange failed for teams', err));
        
        // Firestore write
        try {
          await updateDoc(doc(db, 'teams', teamId), { Active: team.Active, UpdatedAt: team.UpdatedAt });
        } catch (err) {
          logger.error('Firestore write failed — toggleTeamStatus:', err);
        }
      }
    } catch (error) {
      throw new Error(`Failed to toggle team status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async deleteTeam(teamId: string): Promise<void> {
    try {
      const teams = await this.getTeams();
      const filtered = teams.filter(t => t.TeamID !== teamId);
      await sheetsApi.saveCollection('teams', filtered);
      clearCache('teams');
      clearCache('users');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('teams', 'deleted', teamId).catch((err) => logger.warn('[dbService] notifyChange failed for teams', err));
      
      // Firestore write
      try {
        await deleteDoc(doc(db, 'teams', teamId));
      } catch (err) {
        logger.error('Firestore write failed — deleteTeam:', err);
      }
    } catch (error) {
      throw new Error(`Failed to delete team: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    try {
      const templates = await this.getTemplates();
      const idx = templates.findIndex(t => t.TemplateID === template.TemplateID);
      const now = new Date().toISOString();

      if (idx >= 0) {
        templates[idx] = { ...templates[idx], ...template, UpdatedAt: now };
      } else {
        templates.push({ ...template, CreatedAt: now, UpdatedAt: now });
      }
      
      await sheetsApi.saveCollection('templates', templates);
      clearCache('templates');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('templates', 'updated', template.TemplateID).catch((err) => logger.warn('[dbService] notifyChange failed for templates', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'templates', template.TemplateID), template);
      } catch (err) {
        logger.error('Firestore write failed — saveTemplate:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save template to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async deleteTemplate(templateId: string): Promise<void> {
    try {
      const templates = await this.getTemplates();
      const filtered = templates.filter(t => t.TemplateID !== templateId);
      await sheetsApi.saveCollection('templates', filtered);
      clearCache('templates');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('templates', 'deleted', templateId).catch((err) => logger.warn('[dbService] notifyChange failed for templates', err));
      
      // Firestore write
      try {
        await deleteDoc(doc(db, 'templates', templateId));
      } catch (err) {
        logger.error('Firestore write failed — deleteTemplate:', err);
      }
    } catch (error) {
      throw new Error(`Failed to delete template from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    try {
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

      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...taskToSave, UpdatedAt: now };
        await sheetsApi.saveCollection('tasks', tasks);
      } else {
        const newTask = { ...taskToSave, CreatedAt: now, UpdatedAt: now };
        tasks.push(newTask);
        await sheetsApi.appendRecord('tasks', newTask);
      }
      
      clearCache('tasks');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('tasks', 'updated', task.TaskID).catch((err) => logger.warn('[dbService] notifyChange failed for tasks', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'tasks', task.TaskID), taskToSave);
      } catch (err) {
        logger.error('Firestore write failed — saveTask:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save task to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async deleteTask(taskId: string): Promise<void> {
    try {
      const tasks = await this.getTasks();
      const filtered = tasks.filter(t => t.TaskID !== taskId);
      await sheetsApi.saveCollection('tasks', filtered);
      clearCache('tasks');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('tasks', 'deleted', taskId).catch((err) => logger.warn('[dbService] notifyChange failed for tasks', err));
      
      // Firestore write
      try {
        await deleteDoc(doc(db, 'tasks', taskId));
      } catch (err) {
        logger.error('Firestore write failed — deleteTask:', err);
      }
    } catch (error) {
      throw new Error(`Failed to delete task from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    try {
      const reports = await this.getReports();
      reports.push(report);
      await sheetsApi.appendRecord('reports', report);
      clearCache('reports');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('reports', 'created', report.ReportID).catch((err) => logger.warn('[dbService] notifyChange failed for reports', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'reports', report.ReportID), report);
      } catch (err) {
        logger.error('Firestore write failed — saveReport:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save report to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    try {
      const followups = await this.getFollowups();
      followups.push(follow);
      await sheetsApi.saveCollection('followups', followups);
      clearCache('followups');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('followups', 'created', follow.FollowUpID).catch((err) => logger.warn('[dbService] notifyChange failed for followups', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'followups', follow.FollowUpID), follow);
      } catch (err) {
        logger.error('Firestore write failed — saveFollowup:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save followup to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    try {
      await sheetsApi.saveCollection('settings', settingsList);
      clearCache('settings');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('settings', 'updated', 'settings').catch((err) => logger.warn('[dbService] notifyChange failed for settings', err));
      
      // Firestore write
      try {
        for (const setting of settingsList) {
          await setDoc(doc(db, 'settings', setting.Key), setting);
        }
      } catch (err) {
        logger.error('Firestore write failed — saveSettings:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save settings to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    try {
      const subtasks = await this.getSubtasks();
      const idx = subtasks.findIndex(s => s.SubtaskID === subtask.SubtaskID);
      const now = new Date().toISOString();

      if (idx >= 0) {
        subtasks[idx] = { ...subtasks[idx], ...subtask, UpdatedAt: now };
      } else {
        subtasks.push({ ...subtask, CreatedAt: now, UpdatedAt: now });
      }
      
      await sheetsApi.saveCollection('subtasks', subtasks);
      clearCache('subtasks');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('subtasks', 'updated', subtask.SubtaskID).catch((err) => logger.warn('[dbService] notifyChange failed for subtasks', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'subtasks', subtask.SubtaskID), subtask);
      } catch (err) {
        logger.error('Firestore write failed — saveSubtask:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save subtask to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveSubtasksBatch(taskId: string, subtasks: Subtask[]): Promise<void> {
    try {
      const allSubtasks = await this.getSubtasks();
      // Remove existing subtasks for this task
      const filtered = allSubtasks.filter(s => s.TaskID !== taskId);
      // Add new subtasks
      const now = new Date().toISOString();
      const newSubtasks = subtasks.map(s => ({
        ...s,
        CreatedAt: s.CreatedAt || now,
        UpdatedAt: now
      }));
      const updated = [...filtered, ...newSubtasks];
      await sheetsApi.saveCollection('subtasks', updated);
      clearCache('subtasks');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('subtasks', 'updated', taskId).catch((err) => logger.warn('[dbService] notifyChange failed for subtasks', err));
      
      // Firestore write
      try {
        const { writeBatch } = await import('firebase/firestore');
        const wb = writeBatch(db);
        for (const s of newSubtasks) {
          wb.set(doc(db, 'subtasks', s.SubtaskID), s);
        }
        await wb.commit();
      } catch (err) {
        logger.error('Firestore write failed — saveSubtasksBatch:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save subtasks batch to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
    try {
      const comments = await this.getComments();
      comments.push(comment);
      await sheetsApi.saveCollection('comments', comments);
      clearCache('comments');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('comments', 'created', comment.CommentID).catch((err) => logger.warn('[dbService] notifyChange failed for comments', err));
      
      // Firestore write
      try {
        await setDoc(doc(db, 'comments', comment.CommentID), comment);
      } catch (err) {
        logger.error('Firestore write failed — saveComment:', err);
      }
    } catch (error) {
      throw new Error(`Failed to save comment to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Batch load all collections in a single API call
  async batchLoadAll(): Promise<{
    users: User[];
    tasks: Task[];
    teams: Team[];
    templates: TaskTemplate[];
    settings: AppSetting[];
    reports: TaskReport[];
    followups: FollowUp[];
    subtasks: Subtask[];
    comments: Comment[];
  }> {
    const collections = [
      'users', 'tasks', 'teams', 'templates', 
      'settings', 'reports', 
      'followups', 'subtasks', 'comments'
    ];

    const raw = await sheetsApi.batchGetCollections(collections);

    // Apply the same data transformations as individual getters
    const users: User[] = (raw.users || []).map((u: any) => ({
      ...u,
      TeamIDs: u.TeamIDs 
        ? (Array.isArray(u.TeamIDs) ? u.TeamIDs : [u.TeamIDs]) 
        : (u.TeamID ? [u.TeamID] : []),
      TeamNames: u.TeamNames 
        ? (Array.isArray(u.TeamNames) ? u.TeamNames : [u.TeamNames]) 
        : (u.TeamName ? [u.TeamName] : []),
    }));

    const tasks: Task[] = (raw.tasks || []).map((t: any) => ({
      ...t,
      AssignedToTeamIDs: t.AssignedToTeamIDs 
        ? (Array.isArray(t.AssignedToTeamIDs) 
            ? t.AssignedToTeamIDs 
            : [t.AssignedToTeamIDs]) 
        : (t.TeamID ? [t.TeamID] : []),
    }));

    // Populate cache for each collection so subsequent 
    // individual reads hit cache, not Google Sheets
    setCache('users', users);
    setCache('tasks', tasks);
    setCache('teams', raw.teams || []);
    setCache('templates', raw.templates || []);
    setCache('settings', raw.settings || []);
    setCache('reports', raw.reports || []);
    setCache('followups', raw.followups || []);
    setCache('subtasks', raw.subtasks || []);
    setCache('comments', raw.comments || []);

    return {
      users,
      tasks,
      teams: raw.teams || [],
      templates: raw.templates || [],
      settings: raw.settings || [],
      reports: raw.reports || [],
      followups: raw.followups || [],
      subtasks: raw.subtasks || [],
      comments: raw.comments || [],
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
              logger.warn(`Unknown collection: ${collection}`);
              result = null;
          }
          results.push({ status: 'fulfilled', value: result });
          
          // Add a small delay between collections to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          logger.error(`Failed to sync ${collection}:`, error);
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
        logger.error('Firestore write failed — logAction:', err);
      }
    } catch (error) {
      logger.error('Failed to write audit log:', error);
    }
  }
};
