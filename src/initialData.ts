import { User, Team, TaskTemplate, Task, TaskReport, FollowUp, AuditLog, AppSetting, Subtask, Comment } from './types';

export const INITIAL_USERS: User[] = [
  {
    UserID: "USR-001",
    FullName: "Admin Account",
    Email: "admin@PMS.com",
    Role: "Admin",
    ManagerEmail: "",
    TeamIDs: ["T-ALL"],
    TeamNames: ["Global Management"],
    Active: true,
    CanCreateFollowUp: true,
    CanCloseTask: true,
    CreatedAt: "2026-01-10T08:00:00Z",
    UpdatedAt: "2026-01-10T08:00:00Z"
  }
];

export const INITIAL_TEAMS: Team[] = [
  {
    TeamID: "T-ALL",
    TeamName: "Global Management",
    Description: "Administrative team with full system access",
    Active: true,
    CreatedAt: "2026-01-10T08:00:00Z",
    UpdatedAt: "2026-01-10T08:00:00Z"
  }
];

export const INITIAL_TEMPLATES: TaskTemplate[] = [];

export const INITIAL_TASKS: Task[] = [];

export const INITIAL_REPORTS: TaskReport[] = [];

export const INITIAL_FOLLOWUPS: FollowUp[] = [];

export const INITIAL_AUDITS: AuditLog[] = [];

export const INITIAL_SETTINGS: AppSetting[] = [
  { Key: "lock_timeout_ms", Value: "10000" },
  { Key: "alert_overdue_tasks", Value: "true" },
  { Key: "require_attachment_for_closing", Value: "false" },
  { Key: "deployment_web_app_version", Value: "v1.0.4" },
  { Key: "template_assigned_email", Value: "NEW TASK ALLOCATION ALERT!\nTask ID: {TaskID}\nTitle: {Title}\nCategory: {Category}\nPriority: {Priority}\nDue Date: {DueDate}\n\nPlease click to compile your update sheets on time." },
  { Key: "template_delayed_email", Value: "URGENT OVERDUE COMPLIANCE WARNING!\nTask ID: {TaskID}\nTitle: {Title}\nDue Date: {DueDate}\n\nThis task is delayed. Submit your active progress reports and revised ETA immediately." }
];

export const INITIAL_SUBTASKS: Subtask[] = [];

export const INITIAL_COMMENTS: Comment[] = [];
