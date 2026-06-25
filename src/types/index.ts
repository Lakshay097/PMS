export interface User {
  UserID: string;
  FullName: string;
  Email: string;
  Role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder';
  ManagerEmail: string; // empty if Admin or Stakeholder (unless Stakeholder is mapped to someone)
  TeamIDs: string[]; // Multiple teams support
  TeamNames: string[]; // Multiple team names for display
  Active: boolean;
  CanCreateFollowUp: boolean;
  CanCloseTask: boolean;
  CreatedAt: string;
  UpdatedAt: string;
  Password?: string;
  ApprovalStatus?: 'pending' | 'approved' | 'rejected';
  RequestedBy?: string; // Email of the person who requested the account
  RequestedAt?: string;
  ApprovedBy?: string; // Email of the admin who approved
  ApprovedAt?: string;
  TeamID?: string;
  TeamName?: string;
}

export interface Team {
  TeamID: string;
  TeamName: string;
  Description?: string;
  Active: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface TaskTemplate {
  TemplateID: string;
  Title: string;
  Description: string;
  Priority: 'Low' | 'Medium' | 'High' | 'Critical';
  RecurrenceType: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly';
  StartDate: string;
  NextGenerationDate: string;
  LastGeneratedDate: string;
  AssignedByEmail: string;
  AssignedToEmail: string;
  AssignedToRole: 'Stakeholder';
  TeamID: string;
  Active: boolean;
  CreatedAt: string;
  UpdatedAt: string;
}

export type TaskStatus = 'Not Started' | 'In Progress' | 'Submitted' | 'Reviewed' | 'Closed' | 'Reopened' | 'Overdue';

export interface Task {
  TaskID: string;
  TemplateID: string | null;
  ParentTaskID: string | null;
  Title: string;
  Description: string;
  Priority: 'Low' | 'Medium' | 'High' | 'Critical';
  TaskType: 'One-time' | 'Recurring';
  RecurrenceType: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly' | 'One-time';
  CycleKey: string | null; // prevent duplicate trigger generation
  StartDate: string;
  DueDate: string;
  AssignedByEmail: string;
  AssignedToEmail: string;
  AssignedToRole: 'Admin' | 'Stakeholder' | 'Sub-stakeholder';
  AssignedToTeamIDs: string[]; // Can be assigned to multiple teams
  Status: TaskStatus;
  PercentComplete: number;
  LastReportSummary: string;
  RequiresFollowUp: 'Yes' | 'No';
  FollowUpCount: number;
  FollowUpReason?: string; // stores the reason for the latest follow-up
  CompletionDate: string | null;
  CloseRemark: string | null;
  AttachmentLink: string;
  CreatedAt: string;
  UpdatedAt: string;
  Active: boolean;
  OriginalDueDate?: string;
  EtaRequestCount?: number;
  DeletedAt: string | null;
  TeamID?: string;
}

export interface TaskReport {
  ReportID: string;
  TaskID: string;
  SubtaskID?: string;
  SubmittedByEmail: string;
  ReportDate: string;
  StatusUpdate: TaskStatus;
  WorkSummary: string;
  PercentComplete: number;
  Blockers: string;
  NextAction: string;
  AttachmentLink: string;
  CreatedAt: string;
}

export interface FollowUp {
  FollowUpID: string;
  ParentTaskID: string;
  NewTaskID: string;
  FollowUpNumber: number;
  CreatedByEmail: string;
  Reason: string;
  CreatedAt: string;
  Status: 'Pending' | 'Active' | 'Completed';
}

export interface AppSetting {
  Key: string;
  Value: string;
}

export interface SystemAlert {
  ID: string;
  Type: 'Delay Alert' | 'ETA Breach' | 'Task Assignment' | 'Progress Update';
  Message: string;
  EmailSentTo: string;
  Timestamp: string;
}

export interface Subtask {
  SubtaskID: string;
  TaskID: string;
  Title: string;
  AssignedTo?: string;
  DueDate?: string;
  CreatedBy?: string;
  LastReportSummary?: string;
  Completed: boolean;
  CreatedAt: string;
}

export interface Comment {
  CommentID: string;
  TaskID: string;
  Comment: string;
  CreatedAt: string;
  CreatedBy: string;
}

export interface AuditLog {
  LogID: string;
  EntityType: string;
  EntityID: string;
  Action: string;
  OldValueJSON: string;
  NewValueJSON: string;
  ActionByEmail: string;
  ActionDateTime: string;
}
