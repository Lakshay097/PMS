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
  AuditLog,
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
  INITIAL_AUDITS,
  INITIAL_SETTINGS,
  INITIAL_SUBTASKS,
  INITIAL_COMMENTS
} from '../initialData';
import { sheetsApi, getAccessToken, HEADERS } from './sheetsService';
import { logger } from '../utils/logger';
import { notifyChange } from '../api/client';

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
  const token = getAccessToken();
  if (!token) {
    throw new Error('Google Sheets authentication failed. Cannot initialize database.');
  }

  try {
    logger.log("Initializing Google Sheets database...");

    // Ensure the spreadsheet exists or create it
    const spreadId = await sheetsApi.getOrCreateSpreadsheet();
    if (!spreadId) {
      throw new Error('Failed to create or access Google Sheets spreadsheet.');
    }

    // Check if database is empty by checking users
    const users = await sheetsApi.getCollection<User>('users');
    setCache('users', users); // Cache for batchLoadAll
    const tasks = await sheetsApi.getCollection<Task>('tasks');
    setCache('tasks', tasks); // Cache for batchLoadAll

    const isNewSpreadsheet = users.length === 0 && tasks.length === 0;

    if (isNewSpreadsheet) {
      logger.log("Google Sheets database is empty. Seeding initial data...");
      
      // Seed initial data sequentially to avoid rate limiting
      const collections = [
        { name: 'users', data: INITIAL_USERS },
        { name: 'teams', data: INITIAL_TEAMS },
        { name: 'templates', data: INITIAL_TEMPLATES },
        { name: 'tasks', data: INITIAL_TASKS },
        { name: 'reports', data: INITIAL_REPORTS },
        { name: 'followups', data: INITIAL_FOLLOWUPS },
        { name: 'auditlogs', data: INITIAL_AUDITS },
        { name: 'settings', data: INITIAL_SETTINGS },
        { name: 'subtasks', data: INITIAL_SUBTASKS },
        { name: 'comments', data: INITIAL_COMMENTS }
      ];

      for (const collection of collections) {
        await sheetsApi.saveCollection(collection.name as 'users' | 'teams' | 'templates' | 'tasks' | 'reports' | 'followups' | 'auditlogs' | 'settings' | 'subtasks' | 'comments', collection.data);
        // Add a small delay between saves to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.log("Initial data seeded successfully.");
    } else {
      logger.log("Database already initialized with existing data.");
    }
  } catch (error) {
    console.error("Failed to initialize database:", error);
    throw new Error(`Failed to initialize Google Sheets database: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Google Sheets Primary Database Service
// All operations go directly to Google Sheets with in-memory caching for performance
export const dbService = {
  // Users Service
  async getUsers(): Promise<User[]> {
    // Check cache first
    const cached = getFromCache<User>('users');
    if (cached) return cached;

    try {
      const rawUsers = await sheetsApi.getCollection<any>('users');
      const users: User[] = (rawUsers || []).map(u => ({
        ...u,
        TeamIDs: u.TeamIDs ? (Array.isArray(u.TeamIDs) ? u.TeamIDs : [u.TeamIDs]) : (u.TeamID ? [u.TeamID] : []),
        TeamNames: u.TeamNames ? (Array.isArray(u.TeamNames) ? u.TeamNames : [u.TeamNames]) : (u.TeamName ? [u.TeamName] : []),
        TeamID: u.TeamID || (u.TeamIDs && u.TeamIDs.length > 0 ? (Array.isArray(u.TeamIDs) ? u.TeamIDs[0] : u.TeamIDs) : ''),
        TeamName: u.TeamName || (u.TeamNames && u.TeamNames.length > 0 ? (Array.isArray(u.TeamNames) ? u.TeamNames[0] : u.TeamNames) : '')
      }));
      setCache('users', users);
      return users;
    } catch (error) {
      throw new Error(`Failed to load users from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      } else {
        users.push({ ...userToSave, CreatedAt: now, UpdatedAt: now });
      }

      await sheetsApi.saveCollection('users', users);
      clearCache('users'); // Invalidate cache after write
      clearCache('teams'); // Also clear teams cache since team names might be referenced
      
      // Notify other clients immediately (fire and forget)
      notifyChange('users', 'updated', user.UserID).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to save user to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Teams Service
  async getTeams(): Promise<Team[]> {
    const cached = getFromCache<Team>('teams');
    if (cached) return cached;

    try {
      const teams = await sheetsApi.getCollection<Team>('teams');
      setCache('teams', teams);
      return teams;
    } catch (error) {
      throw new Error(`Failed to load teams from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      notifyChange('teams', 'updated', team.TeamID).catch(() => {});
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
        notifyChange('teams', 'updated', teamId).catch(() => {});
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
      notifyChange('teams', 'deleted', teamId).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to delete team: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Task Templates
  async getTemplates(): Promise<TaskTemplate[]> {
    const cached = getFromCache<TaskTemplate>('templates');
    if (cached) return cached;

    try {
      const templates = await sheetsApi.getCollection<TaskTemplate>('templates');
      setCache('templates', templates);
      return templates;
    } catch (error) {
      throw new Error(`Failed to load templates from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      notifyChange('templates', 'updated', template.TemplateID).catch(() => {});
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
      notifyChange('templates', 'deleted', templateId).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to delete template from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Live Tasks
  async getTasks(): Promise<Task[]> {
    const cached = getFromCache<Task>('tasks');
    if (cached) return cached;

    try {
      const rawTasks = await sheetsApi.getCollection<any>('tasks');
      const tasks: Task[] = (rawTasks || []).map(t => ({
        ...t,
        AssignedToTeamIDs: t.AssignedToTeamIDs ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs : [t.AssignedToTeamIDs]) : (t.TeamID ? [t.TeamID] : []),
        TeamID: t.TeamID || (t.AssignedToTeamIDs && t.AssignedToTeamIDs.length > 0 ? (Array.isArray(t.AssignedToTeamIDs) ? t.AssignedToTeamIDs[0] : t.AssignedToTeamIDs) : '')
      }));
      setCache('tasks', tasks);
      return tasks;
    } catch (error) {
      throw new Error(`Failed to load tasks from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveTask(task: Task): Promise<void> {
    try {
      const tasks = await this.getTasks();
      const idx = tasks.findIndex(t => t.TaskID === task.TaskID);
      const now = new Date().toISOString();

      const taskToSave = {
        ...task,
        TeamID: task.TeamID || (task.AssignedToTeamIDs && task.AssignedToTeamIDs.length > 0 ? task.AssignedToTeamIDs[0] : '')
      };

      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...taskToSave, UpdatedAt: now };
      } else {
        tasks.push({ ...taskToSave, CreatedAt: now, UpdatedAt: now });
      }
      
      await sheetsApi.saveCollection('tasks', tasks);
      clearCache('tasks');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('tasks', 'updated', task.TaskID).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to save task to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Reports
  async getReports(): Promise<TaskReport[]> {
    const cached = getFromCache<TaskReport>('reports');
    if (cached) return cached;

    try {
      const reports = await sheetsApi.getCollection<TaskReport>('reports');
      setCache('reports', reports);
      return reports;
    } catch (error) {
      throw new Error(`Failed to load reports from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveReport(report: TaskReport): Promise<void> {
    try {
      const reports = await this.getReports();
      reports.push(report);
      await sheetsApi.saveCollection('reports', reports);
      clearCache('reports');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('reports', 'created', report.ReportID).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to save report to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Follow-ups
  async getFollowups(): Promise<FollowUp[]> {
    const cached = getFromCache<FollowUp>('followups');
    if (cached) return cached;

    try {
      const followups = await sheetsApi.getCollection<FollowUp>('followups');
      setCache('followups', followups);
      return followups;
    } catch (error) {
      throw new Error(`Failed to load followups from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveFollowup(follow: FollowUp): Promise<void> {
    try {
      const followups = await this.getFollowups();
      followups.push(follow);
      await sheetsApi.saveCollection('followups', followups);
      clearCache('followups');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('followups', 'created', follow.FollowUpID).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to save followup to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    const cached = getFromCache<AuditLog>('auditlogs');
    if (cached) return cached;

    try {
      const audits = await sheetsApi.getCollection<AuditLog>('auditlogs');
      setCache('auditlogs', audits);
      return audits;
    } catch (error) {
      throw new Error(`Failed to load audit logs from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async logAction(
    entityType: AuditLog['EntityType'],
    entityId: string,
    action: string,
    actorEmail: string,
    oldValue: any = null,
    newValue: any = null
  ): Promise<void> {
    try {
      const newLog: AuditLog = {
        LogID: `LOG-${Math.floor(Date.now() + Math.random() * 1000)}`,
        EntityType: entityType,
        EntityID: entityId,
        Action: action,
        OldValueJSON: oldValue ? JSON.stringify(oldValue) : "",
        NewValueJSON: newValue ? JSON.stringify(newValue) : "",
        ActionByEmail: actorEmail,
        ActionDateTime: new Date().toISOString()
      };

      const audits = await this.getAuditLogs();
      audits.unshift(newLog); // Put recent log on top
      await sheetsApi.saveCollection('auditlogs', audits);
      clearCache('auditlogs');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('auditlogs', 'created', newLog.LogID).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to log action to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Settings
  async getSettings(): Promise<AppSetting[]> {
    const cached = getFromCache<AppSetting>('settings');
    if (cached) return cached;

    try {
      const settings = await sheetsApi.getCollection<AppSetting>('settings');
      setCache('settings', settings);
      return settings;
    } catch (error) {
      throw new Error(`Failed to load settings from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveSettings(settingsList: AppSetting[]): Promise<void> {
    try {
      await sheetsApi.saveCollection('settings', settingsList);
      clearCache('settings');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('settings', 'updated', 'settings').catch(() => {});
    } catch (error) {
      throw new Error(`Failed to save settings to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Subtasks Service
  async getSubtasks(): Promise<Subtask[]> {
    const cached = getFromCache<Subtask>('subtasks');
    if (cached) return cached;

    try {
      const subtasks = await sheetsApi.getCollection<Subtask>('subtasks');
      setCache('subtasks', subtasks);
      return subtasks;
    } catch (error) {
      throw new Error(`Failed to load subtasks from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      notifyChange('subtasks', 'updated', subtask.SubtaskID).catch(() => {});
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
      notifyChange('subtasks', 'updated', taskId).catch(() => {});
    } catch (error) {
      throw new Error(`Failed to save subtasks batch to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Comments Service
  async getComments(): Promise<Comment[]> {
    const cached = getFromCache<Comment>('comments');
    if (cached) return cached;

    try {
      const comments = await sheetsApi.getCollection<Comment>('comments');
      setCache('comments', comments);
      return comments;
    } catch (error) {
      throw new Error(`Failed to load comments from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async saveComment(comment: Comment): Promise<void> {
    try {
      const comments = await this.getComments();
      comments.push(comment);
      await sheetsApi.saveCollection('comments', comments);
      clearCache('comments');
      
      // Notify other clients immediately (fire and forget)
      notifyChange('comments', 'created', comment.CommentID).catch(() => {});
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
    auditlogs: AuditLog[];
    settings: AppSetting[];
    reports: TaskReport[];
    followups: FollowUp[];
    subtasks: Subtask[];
    comments: Comment[];
  }> {
    const collections = [
      'users', 'tasks', 'teams', 'templates', 
      'auditlogs', 'settings', 'reports', 
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
    setCache('auditlogs', raw.auditlogs || []);
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
      auditlogs: raw.auditlogs || [],
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
            case 'auditlogs':
              result = await this.getAuditLogs();
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
  }
};
