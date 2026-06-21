import { Task, TaskReport, FollowUp } from '../types';
import { ROLE } from '../constants/status';

export function parseSafely(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function getStatusBadgeStyle(status: string) {
  switch (status) {
    case 'Not Started': return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
    case 'In Progress': return 'bg-[#DBEAFE] text-[#1E40AF] border-[#BFDBFE]';
    case 'Submitted': return 'bg-[#F3E8FF] text-[#6B21A7] border-[#E9D5FF]';
    case 'Closed': return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
    case 'Overdue': return 'bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C] animate-pulse font-bold';
    default: return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
  }
}

export function getVisibleTasks(tasks: Task[], activeUser: any, currentView: string, filters: any) {
  if (!tasks) return [];
  
  const today = getCurrentLocalDate();
  
  const afterRoleFilter = tasks.filter(task => {
    // Admin sees everything
    if (activeUser.Role === ROLE.ADMIN) return true;
    
    // Stakeholders see their assigned tasks and tasks they assigned
    if (activeUser.Role === ROLE.STAKEHOLDER) {
      const assignedToMe = task.AssignedToEmail?.includes(activeUser.Email);
      const assignedByMe = task.AssignedByEmail === activeUser.Email;
      return assignedToMe || assignedByMe;
    }
    
    // Sub-stakeholders see only their assigned tasks
    if (activeUser.Role === ROLE.SUB_STAKEHOLDER) {
      return task.AssignedToEmail?.includes(activeUser.Email);
    }
    
    return false;
  });
  
  const afterViewFilter = afterRoleFilter.filter(task => {
    // Apply view filters
    if (currentView === 'my-tasks') {
      return task.AssignedToEmail?.includes(activeUser.Email);
    }
    if (currentView === 'assigned-by-me') {
      return task.AssignedByEmail === activeUser.Email;
    }
    return true;
  });
  
  const afterCategoryFilter = afterViewFilter.filter(task => {
    // Apply category filter
    if (filters.category && filters.category !== 'All') {
      return task.Category === filters.category;
    }
    return true;
  });
  
  const afterStatusFilter = afterCategoryFilter.filter(task => {
    // Apply status filter
    if (filters.status && filters.status !== 'All') {
      return task.Status === filters.status;
    }
    return true;
  });
  
  const afterPriorityFilter = afterStatusFilter.filter(task => {
    // Apply priority filter
    if (filters.priority && filters.priority !== 'All') {
      return task.Priority === filters.priority;
    }
    return true;
  });
  
  const afterSearchFilter = afterPriorityFilter.filter(task => {
    // Apply search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        task.Title?.toLowerCase().includes(searchLower) ||
        task.Description?.toLowerCase().includes(searchLower) ||
        task.TaskID?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });
  
  return afterSearchFilter;
}

export function getOverdueAndSoonTasks(tasks: Task[], activeUser: any) {
  if (!tasks) return { overdue: [], soon: [] };
  
  const today = getCurrentLocalDate();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const threeDaysFromNowStr = threeDaysFromNow.toISOString().split('T')[0];
  
  const visibleTasks = tasks.filter(task => {
    if (activeUser.Role === ROLE.ADMIN) return true;
    if (activeUser.Role === ROLE.STAKEHOLDER) {
      const assignedToMe = task.AssignedToEmail?.includes(activeUser.Email);
      const assignedByMe = task.AssignedByEmail === activeUser.Email;
      return assignedToMe || assignedByMe;
    }
    if (activeUser.Role === ROLE.SUB_STAKEHOLDER) {
      return task.AssignedToEmail?.includes(activeUser.Email);
    }
    return false;
  });
  
  const overdue = visibleTasks.filter(task => {
    if (task.Status === 'Closed' || task.Status === 'Reviewed') return false;
    if (!task.DueDate) return false;
    return task.DueDate < today;
  });
  
  const soon = visibleTasks.filter(task => {
    if (task.Status === 'Closed' || task.Status === 'Reviewed') return false;
    if (!task.DueDate) return false;
    return task.DueDate >= today && task.DueDate <= threeDaysFromNowStr;
  });
  
  return { overdue, soon };
}

export function getVisibleReports(reports: TaskReport[], activeUser: any) {
  if (!reports) return [];
  
  if (activeUser.Role === ROLE.ADMIN) return reports;
  
  return reports.filter(report => {
    return report.SubmittedByEmail === activeUser.Email;
  });
}

export function getFilteredTasks(tasks: Task[], filters: any) {
  if (!tasks) return [];
  
  return tasks.filter(task => {
    if (filters.category && filters.category !== 'All') {
      return task.Category === filters.category;
    }
    return true;
  }).filter(task => {
    if (filters.status && filters.status !== 'All') {
      return task.Status === filters.status;
    }
    return true;
  }).filter(task => {
    if (filters.priority && filters.priority !== 'All') {
      return task.Priority === filters.priority;
    }
    return true;
  }).filter(task => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        task.Title?.toLowerCase().includes(searchLower) ||
        task.Description?.toLowerCase().includes(searchLower) ||
        task.TaskID?.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });
}

function getCurrentLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
