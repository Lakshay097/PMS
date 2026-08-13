import { Task } from '../types';
import { splitEmails } from './roleUtils';

export interface TaskListFilters {
  status?: string[] | string;
  priority?: string | string[];
  assignee?: string;
  searchQuery?: string;
  assignedByEmails?: string[];
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Returns true when a task matches every active filter (AND across filter types;
 * OR within multi-select status / assignee / assigned-by lists).
 */
export function taskMatchesFilters(task: Task, filters: TaskListFilters): boolean {
  if (!matchesStatusFilter(task, filters.status)) return false;
  if (!matchesPriorityFilter(task, filters.priority)) return false;
  if (!matchesAssigneeFilter(task, filters.assignee)) return false;
  if (!matchesSearchFilter(task, filters.searchQuery)) return false;
  if (!matchesAssignedByFilter(task, filters.assignedByEmails)) return false;
  if (!matchesDateRangeFilter(task, filters.dateFrom, filters.dateTo)) return false;
  return true;
}

function normalizeStatusList(status: string[] | string | undefined): string[] {
  if (!status) return [];
  if (Array.isArray(status)) {
    const filtered = status.filter(s => s && s !== 'All');
    const allStatuses = ['In Progress', 'Submitted', 'Closed', 'Overdue', 'On Hold', 'Dropped', 'Not Started'];
    // If all statuses are selected, treat as no filter (Excel-style)
    const isAllSelected = filtered.length === allStatuses.length && allStatuses.every(s => filtered.includes(s));
    return isAllSelected ? [] : filtered;
  }
  if (status === 'All') return [];
  const parsed = status.split(',').map(s => s.trim()).filter(s => s && s !== 'All');
  const allStatuses = ['In Progress', 'Submitted', 'Closed', 'Overdue', 'On Hold', 'Dropped', 'Not Started'];
  // If all statuses are selected, treat as no filter (Excel-style)
  const isAllSelected = parsed.length === allStatuses.length && allStatuses.every(s => parsed.includes(s));
  return isAllSelected ? [] : parsed;
}

export function matchesStatusFilter(task: Task, status: string[] | string | undefined): boolean {
  const statuses = normalizeStatusList(status);
  if (statuses.length === 0) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = task.DueDate ? new Date(task.DueDate) : null;
  if (dueDate) dueDate.setHours(0, 0, 0, 0);

  const isClosed = task.Status === 'Closed' || task.Status === 'Reviewed';

  return statuses.some(s => {
    if (s === 'Active') return !isClosed;
    if (s === 'Overdue') return !isClosed && !!dueDate && dueDate < today;
    if (s === 'Due Today') {
      return !isClosed && !!dueDate && dueDate.getTime() === today.getTime();
    }
    return task.Status === s;
  });
}

export function matchesPriorityFilter(task: Task, priority: string | string[] | undefined): boolean {
  if (!priority || priority === 'All') return true;

  const taskPriorities = Array.isArray(task.Priority) ? task.Priority : [task.Priority];

  if (Array.isArray(priority)) {
    if (priority.length === 0) return true;
    return priority.some(p => taskPriorities.includes(p as Task['Priority'][number]));
  }

  return taskPriorities.includes(priority as Task['Priority'][number]);
}

export function matchesAssigneeFilter(task: Task, assignee: string | undefined): boolean {
  if (!assignee) return true;
  const assigneeEmails = assignee.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  if (assigneeEmails.length === 0) return true;

  const taskAssignees = splitEmails(task.AssignedToEmail).map(e => e.toLowerCase());
  // Also match additional stakeholder viewers when present
  const stakeholderEmails = (task.StakeholderEmails || []).map(e => e.toLowerCase());
  const all = [...taskAssignees, ...stakeholderEmails];

  return assigneeEmails.some(e => all.includes(e));
}

export function matchesSearchFilter(task: Task, searchQuery: string | undefined): boolean {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (
    task.Title?.toLowerCase().includes(q) ||
    task.Description?.toLowerCase().includes(q) ||
    task.TaskID?.toLowerCase().includes(q) ||
    task.AssignedToEmail?.toLowerCase().includes(q) ||
    false
  );
}

export function matchesAssignedByFilter(task: Task, assignedByEmails: string[] | undefined): boolean {
  if (!assignedByEmails || assignedByEmails.length === 0) return true;
  const taskAssignedBy = task.AssignedByEmail?.toLowerCase() || '';
  return assignedByEmails.some(e => e.toLowerCase() === taskAssignedBy);
}

export function matchesDateRangeFilter(
  task: Task,
  dateFrom: string | undefined,
  dateTo: string | undefined
): boolean {
  if (dateFrom) {
    if (!task.DueDate || task.DueDate < dateFrom) return false;
  }
  if (dateTo) {
    if (!task.DueDate || task.DueDate > dateTo) return false;
  }
  return true;
}

/** Diff helpers for stakeholder email notifications */
export function getNewlyAddedEmails(previous: string[], next: string[]): string[] {
  const prevSet = new Set(previous.map(e => e.trim().toLowerCase()).filter(Boolean));
  return next
    .map(e => e.trim())
    .filter(Boolean)
    .filter(e => !prevSet.has(e.toLowerCase()));
}
