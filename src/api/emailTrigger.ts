import { api } from './client';

/**
 * Task creation trigger request
 */
export interface TaskCreationTriggerRequest {
  creatorEmail: string;
  assignedToEmail: string;
  task: {
    TaskID: string;
    Title: string;
    Description: string;
    DueDate: string;
    Priority: string;
    AttachmentLink?: string;
  };
}

/**
 * Trigger task creation email
 */
export async function triggerTaskCreationEmail(data: TaskCreationTriggerRequest): Promise<{ success: boolean; message: string; error?: string }> {
  return api.post<{ success: boolean; message: string; error?: string }>('/email/trigger/task-creation', data);
}

/**
 * Task assignment trigger request
 */
export interface TaskAssignmentTriggerRequest {
  assignerEmail: string;
  assignedToEmail: string;
  task: {
    TaskID: string;
    Title: string;
    Description: string;
    DueDate: string;
    Priority: string;
    AttachmentLink?: string;
  };
}

/**
 * Task due soon trigger request
 */
export interface TaskDueSoonTriggerRequest {
  creatorEmail: string;
  assignedToEmail: string;
  task: {
    TaskID: string;
    Title: string;
    Description: string;
    DueDate: string;
    Priority: string;
  };
}

/**
 * Task overdue trigger request
 */
export interface TaskOverdueTriggerRequest {
  creatorEmail: string;
  assignedToEmail: string;
  task: {
    TaskID: string;
    Title: string;
    Description: string;
    DueDate: string;
    Priority: string;
  };
}

/**
 * Report submission trigger request
 */
export interface ReportSubmissionTriggerRequest {
  submitterEmail: string;
  allocatorEmail: string;
  task: {
    TaskID: string;
    Title: string;
    Description: string;
  };
  reportContent: string;
}

/**
 * Trigger task assignment email
 */
export async function triggerTaskAssignmentEmail(data: TaskAssignmentTriggerRequest): Promise<{ success: boolean; message: string; error?: string }> {
  return api.post<{ success: boolean; message: string; error?: string }>('/email/trigger/task-assignment', data);
}

/**
 * Trigger task due soon email
 */
export async function triggerTaskDueSoonEmail(data: TaskDueSoonTriggerRequest): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>('/email/trigger/task-due-soon', data);
}

/**
 * Trigger task overdue email
 */
export async function triggerTaskOverdueEmail(data: TaskOverdueTriggerRequest): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>('/email/trigger/task-overdue', data);
}

/**
 * Trigger report submission email
 */
export async function triggerReportSubmissionEmail(data: ReportSubmissionTriggerRequest): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>('/email/trigger/report-submission', data);
}

/**
 * Task closure trigger request
 */
export interface TaskClosureTriggerRequest {
  closedByEmail: string;
  assignedToEmail: string;
  allocatorEmail: string;   // task creator/assigner — receives closure notification as primary To
  task: {
    TaskID: string;
    Title: string;
    Description: string;
    CompletionDate: string;
  };
  closeRemark: string;
}

/**
 * Trigger task closure email
 */
export async function triggerTaskClosureEmail(data: TaskClosureTriggerRequest): Promise<{ success: boolean; message: string }> {
  return api.post<{ success: boolean; message: string }>('/email/trigger/task-closed', data);
}