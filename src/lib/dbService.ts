// Google Sheets Primary Database Layer
// All data persistence goes directly to Google Sheets - no LocalStorage fallback
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
import { sheetsApi, getAccessToken } from './sheetsService';

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
const CACHE_TTL = 1 * 60 * 1000; // 1 minute (reduced from 5 minutes for better sync)

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
    console.log("Initializing Google Sheets database...");
    
    // Ensure the spreadsheet exists or create it
    const spreadId = await sheetsApi.getOrCreateSpreadsheet();
    if (!spreadId) {
      throw new Error('Failed to create or access Google Sheets spreadsheet.');
    }

    // Check if database is empty by checking users
    const users = await sheetsApi.getCollection<User>('users');
    const tasks = await sheetsApi.getCollection<Task>('tasks');

    const isNewSpreadsheet = users.length === 0 && tasks.length === 0;

    if (isNewSpreadsheet) {
      console.log("Google Sheets database is empty. Seeding initial data...");
      
      // Seed initial data in parallel
      await Promise.all([
        sheetsApi.saveCollection('users', INITIAL_USERS),
        sheetsApi.saveCollection('teams', INITIAL_TEAMS),
        sheetsApi.saveCollection('templates', INITIAL_TEMPLATES),
        sheetsApi.saveCollection('tasks', INITIAL_TASKS),
        sheetsApi.saveCollection('reports', INITIAL_REPORTS),
        sheetsApi.saveCollection('followups', INITIAL_FOLLOWUPS),
        sheetsApi.saveCollection('auditlogs', INITIAL_AUDITS),
        sheetsApi.saveCollection('settings', INITIAL_SETTINGS),
        sheetsApi.saveCollection('subtasks', INITIAL_SUBTASKS),
        sheetsApi.saveCollection('comments', INITIAL_COMMENTS)
      ]);

      console.log("Initial data seeded successfully.");
    } else {
      console.log("Database already initialized with existing data.");
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
      const users = await sheetsApi.getCollection<User>('users');
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

      if (idx >= 0) {
        users[idx] = { ...users[idx], ...user, UpdatedAt: now };
      } else {
        users.push({ ...user, CreatedAt: now, UpdatedAt: now });
      }

      await sheetsApi.saveCollection('users', users);
      clearCache('users'); // Invalidate cache after write
      clearCache('teams'); // Also clear teams cache since team names might be referenced
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
      }
    } catch (error) {
      throw new Error(`Failed to toggle team status: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    } catch (error) {
      throw new Error(`Failed to delete template from Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Live Tasks
  async getTasks(): Promise<Task[]> {
    const cached = getFromCache<Task>('tasks');
    if (cached) return cached;

    try {
      const tasks = await sheetsApi.getCollection<Task>('tasks');
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

      if (idx >= 0) {
        tasks[idx] = { ...tasks[idx], ...task, UpdatedAt: now };
      } else {
        tasks.push({ ...task, CreatedAt: now, UpdatedAt: now });
      }
      
      await sheetsApi.saveCollection('tasks', tasks);
      clearCache('tasks');
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
    } catch (error) {
      throw new Error(`Failed to save comment to Google Sheets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};
