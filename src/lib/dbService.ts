import { db, auth } from './firebase';
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

// Fallback persistence layer using LocalStorage
class LocalStorageCache {
  get<T>(key: string, initial: T[]): T[] {
    const data = localStorage.getItem(`trustgrid_${key}`);
    if (!data) {
      localStorage.setItem(`trustgrid_${key}`, JSON.stringify(initial));
      return initial;
    }
    try {
      return JSON.parse(data);
    } catch {
      return initial;
    }
  }

  set<T>(key: string, data: T[]): void {
    localStorage.setItem(`trustgrid_${key}`, JSON.stringify(data));
  }

  getUsers(): User[] { return this.get<User>('users', INITIAL_USERS); }
  setUsers(data: User[]) { this.set<User>('users', data); }

  getTeams(): Team[] { return this.get<Team>('teams', INITIAL_TEAMS); }
  setTeams(data: Team[]) { this.set<Team>('teams', data); }

  getTemplates(): TaskTemplate[] { return this.get<TaskTemplate>('templates', INITIAL_TEMPLATES); }
  setTemplates(data: TaskTemplate[]) { this.set<TaskTemplate>('templates', data); }

  getTasks(): Task[] { return this.get<Task>('tasks', INITIAL_TASKS); }
  setTasks(data: Task[]) { this.set<Task>('tasks', data); }

  getReports(): TaskReport[] { return this.get<TaskReport>('reports', INITIAL_REPORTS); }
  setReports(data: TaskReport[]) { this.set<TaskReport>('reports', data); }

  getFollowups(): FollowUp[] { return this.get<FollowUp>('followups', INITIAL_FOLLOWUPS); }
  setFollowups(data: FollowUp[]) { this.set<FollowUp>('followups', data); }

  getAudits(): AuditLog[] { return this.get<AuditLog>('auditlogs', INITIAL_AUDITS); }
  setAudits(data: AuditLog[]) { this.set<AuditLog>('auditlogs', data); }

  getSettings(): AppSetting[] { return this.get<AppSetting>('settings', INITIAL_SETTINGS); }
  setSettings(data: AppSetting[]) { this.set<AppSetting>('settings', data); }

  getSubtasks(): Subtask[] { return this.get<Subtask>('subtasks', INITIAL_SUBTASKS); }
  setSubtasks(data: Subtask[]) { this.set<Subtask>('subtasks', data); }

  getComments(): Comment[] { return this.get<Comment>('comments', INITIAL_COMMENTS); }
  setComments(data: Comment[]) { this.set<Comment>('comments', data); }
}

const localCache = new LocalStorageCache();

// Trigger sync when user signs in or opens the app with Google credentials
export async function syncFromGoogleSheets(): Promise<boolean> {
  const token = getAccessToken();
  if (!token) {
    console.log("No Google OAuth access token present. Operating in Local Persistence Cache mode.");
    return false;
  }

  try {
    console.log("Synchronizing data with Google Sheets as the master database...");
    
    // Ensure the spreadsheet exists or create it
    const spreadId = await sheetsApi.getOrCreateSpreadsheet();
    if (!spreadId) return false;

    // Fetch existing records from Google Sheets
    let users = await sheetsApi.getCollection<User>('users');
    let teams = await sheetsApi.getCollection<Team>('teams');
    let templates = await sheetsApi.getCollection<TaskTemplate>('templates');
    let tasks = await sheetsApi.getCollection<Task>('tasks');
    let reports = await sheetsApi.getCollection<TaskReport>('reports');
    let followups = await sheetsApi.getCollection<FollowUp>('followups');
    let audits = await sheetsApi.getCollection<AuditLog>('auditlogs');
    let settings = await sheetsApi.getCollection<AppSetting>('settings');
    let subtasks = await sheetsApi.getCollection<Subtask>('subtasks');
    let comments = await sheetsApi.getCollection<Comment>('comments');

    const isNewSpreadsheet = users.length === 0 && tasks.length === 0;

    if (isNewSpreadsheet) {
      console.log("Google Sheets database is empty. Autoseeding initial core data to your spreadsheet...");
      
      // Sync initial assets in parallel to optimize startup
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

      // Seed local cache with original models as well
      localCache.setUsers(INITIAL_USERS);
      localCache.setTeams(INITIAL_TEAMS);
      localCache.setTemplates(INITIAL_TEMPLATES);
      localCache.setTasks(INITIAL_TASKS);
      localCache.setReports(INITIAL_REPORTS);
      localCache.setFollowups(INITIAL_FOLLOWUPS);
      localCache.setAudits(INITIAL_AUDITS);
      localCache.setSettings(INITIAL_SETTINGS);
      localCache.setSubtasks(INITIAL_SUBTASKS);
      localCache.setComments(INITIAL_COMMENTS);
    } else {
      console.log("Existing spreadsheet records detected. Loading records into applet cache.");
      // Overwrite local cache with retrieved Masters
      if (users.length > 0) localCache.setUsers(users);
      if (teams.length > 0) localCache.setTeams(teams);
      if (templates.length > 0) localCache.setTemplates(templates);
      if (tasks.length > 0) localCache.setTasks(tasks);
      if (reports.length > 0) localCache.setReports(reports);
      if (followups.length > 0) localCache.setFollowups(followups);
      if (audits.length > 0) localCache.setAudits(audits);
      if (settings.length > 0) localCache.setSettings(settings);
      if (subtasks.length > 0) localCache.setSubtasks(subtasks);
      if (comments.length > 0) localCache.setComments(comments);
    }

    return true;
  } catch (error) {
    console.error("Failed to sync from Google Sheets:", error);
    return false;
  }
}

// Custom DB Services coordinating Google Sheets & Local Cache fallback
export const dbService = {
  // Users Service
  async getUsers(): Promise<User[]> {
    const list = localCache.getUsers();
    const token = getAccessToken();
    if (token) {
      try {
        const sheetsUsers = await sheetsApi.getCollection<User>('users');
        if (sheetsUsers.length > 0) {
          localCache.setUsers(sheetsUsers);
          return sheetsUsers;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets users tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveUser(user: User): Promise<void> {
    const list = localCache.getUsers();
    const idx = list.findIndex(u => u.UserID === user.UserID || u.Email === user.Email);
    const now = new Date().toISOString();
    
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...user, UpdatedAt: now };
    } else {
      list.push({ ...user, CreatedAt: now, UpdatedAt: now });
    }
    localCache.setUsers(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('users', list);
      } catch (error) {
        console.error("Failed to persist user update to Google Sheets:", error);
      }
    }
  },

  // Teams Service
  async getTeams(): Promise<Team[]> {
    const list = localCache.getTeams();
    const token = getAccessToken();
    if (token) {
      try {
        const sheetsTeams = await sheetsApi.getCollection<Team>('teams');
        if (sheetsTeams.length > 0) {
          localCache.setTeams(sheetsTeams);
          return sheetsTeams;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets teams tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveTeam(team: Team): Promise<void> {
    const list = localCache.getTeams();
    const idx = list.findIndex(t => t.TeamID === team.TeamID);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...team };
    } else {
      list.push(team);
    }
    localCache.setTeams(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('teams', list);
      } catch (error) {
        console.error("Failed to persist team update to Google Sheets:", error);
      }
    }
  },

  // Task Templates
  async getTemplates(): Promise<TaskTemplate[]> {
    const list = localCache.getTemplates();
    const token = getAccessToken();
    if (token) {
      try {
        const templates = await sheetsApi.getCollection<TaskTemplate>('templates');
        if (templates.length > 0) {
          localCache.setTemplates(templates);
          return templates;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets templates tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveTemplate(template: TaskTemplate): Promise<void> {
    const list = localCache.getTemplates();
    const idx = list.findIndex(t => t.TemplateID === template.TemplateID);
    const now = new Date().toISOString();

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...template, UpdatedAt: now };
    } else {
      list.push({ ...template, CreatedAt: now, UpdatedAt: now });
    }
    localCache.setTemplates(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('templates', list);
      } catch (error) {
        console.error("Failed to persist template to Google Sheets:", error);
      }
    }
  },

  async deleteTemplate(templateId: string): Promise<void> {
    const list = localCache.getTemplates();
    const filtered = list.filter(t => t.TemplateID !== templateId);
    localCache.setTemplates(filtered);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('templates', filtered);
      } catch (error) {
        console.error("Failed to persist template deletion to Google Sheets:", error);
      }
    }
  },

  // Live Tasks
  async getTasks(): Promise<Task[]> {
    const list = localCache.getTasks();
    const token = getAccessToken();
    if (token) {
      try {
        const tasks = await sheetsApi.getCollection<Task>('tasks');
        if (tasks.length > 0) {
          localCache.setTasks(tasks);
          return tasks;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets tasks tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveTask(task: Task): Promise<void> {
    const list = localCache.getTasks();
    const idx = list.findIndex(t => t.TaskID === task.TaskID);
    const now = new Date().toISOString();

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...task, UpdatedAt: now };
    } else {
      list.push({ ...task, CreatedAt: now, UpdatedAt: now });
    }
    localCache.setTasks(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('tasks', list);
      } catch (error) {
        console.error("Failed to persist task to Google Sheets:", error);
      }
    }
  },

  // Reports
  async getReports(): Promise<TaskReport[]> {
    const list = localCache.getReports();
    const token = getAccessToken();
    if (token) {
      try {
        const reports = await sheetsApi.getCollection<TaskReport>('reports');
        if (reports.length > 0) {
          localCache.setReports(reports);
          return reports;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets reports tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveReport(report: TaskReport): Promise<void> {
    const list = localCache.getReports();
    list.push(report);
    localCache.setReports(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('reports', list);
      } catch (error) {
        console.error("Failed to persist report to Google Sheets:", error);
      }
    }
  },

  // Follow-ups
  async getFollowups(): Promise<FollowUp[]> {
    const list = localCache.getFollowups();
    const token = getAccessToken();
    if (token) {
      try {
        const followups = await sheetsApi.getCollection<FollowUp>('followups');
        if (followups.length > 0) {
          localCache.setFollowups(followups);
          return followups;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets followups tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveFollowup(follow: FollowUp): Promise<void> {
    const list = localCache.getFollowups();
    list.push(follow);
    localCache.setFollowups(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('followups', list);
      } catch (error) {
        console.error("Failed to persist followup to Google Sheets:", error);
      }
    }
  },

  // Audit Logs
  async getAuditLogs(): Promise<AuditLog[]> {
    const list = localCache.getAudits();
    const token = getAccessToken();
    if (token) {
      try {
        const audits = await sheetsApi.getCollection<AuditLog>('auditlogs');
        if (audits.length > 0) {
          localCache.setAudits(audits);
          return audits;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets auditlogs tab, relying on cache.", error);
      }
    }
    return list;
  },

  async logAction(
    entityType: AuditLog['EntityType'],
    entityId: string,
    action: string,
    actorEmail: string,
    oldValue: any = null,
    newValue: any = null
  ): Promise<void> {
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

    const list = localCache.getAudits();
    list.unshift(newLog); // Put recent log on top
    localCache.setAudits(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('auditlogs', list);
      } catch (error) {
        console.error("Failed to persist auditlog to Google Sheets:", error);
      }
    }
  },

  // Settings
  async getSettings(): Promise<AppSetting[]> {
    const list = localCache.getSettings();
    const token = getAccessToken();
    if (token) {
      try {
        const settings = await sheetsApi.getCollection<AppSetting>('settings');
        if (settings.length > 0) {
          localCache.setSettings(settings);
          return settings;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets settings tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveSettings(settingsList: AppSetting[]): Promise<void> {
    localCache.setSettings(settingsList);
    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('settings', settingsList);
      } catch (error) {
        console.error("Failed saving settings to Google Sheets:", error);
      }
    }
  },

  // Subtasks Service
  async getSubtasks(): Promise<Subtask[]> {
    const list = localCache.getSubtasks();
    const token = getAccessToken();
    if (token) {
      try {
        const subtasks = await sheetsApi.getCollection<Subtask>('subtasks');
        if (subtasks.length > 0) {
          localCache.setSubtasks(subtasks);
          return subtasks;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets subtasks tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveSubtask(subtask: Subtask): Promise<void> {
    const list = localCache.getSubtasks();
    const idx = list.findIndex(s => s.SubtaskID === subtask.SubtaskID);
    const now = new Date().toISOString();

    if (idx >= 0) {
      list[idx] = { ...list[idx], ...subtask, UpdatedAt: now };
    } else {
      list.push({ ...subtask, CreatedAt: now, UpdatedAt: now });
    }
    localCache.setSubtasks(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('subtasks', list);
      } catch (error) {
        console.error("Failed to persist subtask to Google Sheets:", error);
      }
    }
  },

  async saveSubtasksBatch(taskId: string, subtasks: Subtask[]): Promise<void> {
    const allSubtasks = localCache.getSubtasks();
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
    localCache.setSubtasks(updated);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('subtasks', updated);
      } catch (error) {
        console.error("Failed to persist subtasks batch to Google Sheets:", error);
      }
    }
  },

  // Comments Service
  async getComments(): Promise<Comment[]> {
    const list = localCache.getComments();
    const token = getAccessToken();
    if (token) {
      try {
        const comments = await sheetsApi.getCollection<Comment>('comments');
        if (comments.length > 0) {
          localCache.setComments(comments);
          return comments;
        }
      } catch (error) {
        console.warn("Failed retrieving from Google Sheets comments tab, relying on cache.", error);
      }
    }
    return list;
  },

  async saveComment(comment: Comment): Promise<void> {
    const list = localCache.getComments();
    list.push(comment);
    localCache.setComments(list);

    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('comments', list);
      } catch (error) {
        console.error("Failed to persist comment to Google Sheets:", error);
      }
    }
  }
};

// Dummy exports to satisfy index-signature bindings / references in existing imports
export async function seedFirestoreCollections(): Promise<void> {}
export async function testConnection(): Promise<boolean> { return true; }
