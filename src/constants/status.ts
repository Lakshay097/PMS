/**
 * Task status constants
 */
export const TASK_STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  REVIEWED: 'Reviewed',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  OVERDUE: 'Overdue',
} as const;

export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];

/**
 * Priority constants
 */
export const PRIORITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
} as const;

export type Priority = typeof PRIORITY[keyof typeof PRIORITY];

/**
 * Role constants
 */
export const ROLE = {
  ADMIN: 'Admin',
  STAKEHOLDER: 'Stakeholder',
  SUB_STAKEHOLDER: 'Sub-stakeholder',
} as const;

export type Role = typeof ROLE[keyof typeof ROLE];
