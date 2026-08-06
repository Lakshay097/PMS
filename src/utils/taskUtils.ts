import { Task, TaskReport, FollowUp, User, Team, SubTeam, AppSetting } from '../types';
import { ROLE, isAdminLevel } from '../constants/status';
import { getAllSubordinates } from './userUtils';
import { normalizeStatus } from './taskStatus';
import { getUserRoles, getTeamTasksScope, splitEmails } from './roleUtils';

export function parseSafely(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function getStatusBadgeStyle(status: string) {
  switch (normalizeStatus(status)) {
    case 'In Progress': return 'bg-[#DBEAFE] text-[#1E40AF] border-[#BFDBFE]';
    case 'On Hold':     return 'bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]';
    case 'Dropped':     return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
    case 'Closed':      return 'bg-[#DCFCE7] text-[#166534] border-[#BBF7D0]'; // Completed — green
  }
}

export function getVisibleTasks(tasks: Task[], activeUser: any, currentView: string, filters: any, users: any[] = []) {
  if (!tasks) return [];
  if (!activeUser) return []; // Guard against null user
  
  const today = getCurrentLocalDate();
  const userEmail = activeUser.Email?.toLowerCase() || '';
  
  // If user has no email, return empty tasks (invalid user state)
  if (!userEmail) return [];
  
  // Get hierarchical subordinates for the current user (if they are a stakeholder/team leader)
  const subStakeholderEmails = activeUser.Role === ROLE.STAKEHOLDER || activeUser.Role === ROLE.TEAM_LEADER
    ? getAllSubordinates(activeUser.Email, users)
    : [];
  
  // Get team members for Team Leader (excluding themselves)
  const teamMemberEmails = activeUser.Role === ROLE.TEAM_LEADER
    ? users.filter(u => 
        u.TeamIDs?.some(tid => activeUser.TeamIDs?.includes(tid)) && 
        u.Email?.toLowerCase() !== userEmail &&
        u.Active
      ).map(u => u.Email.toLowerCase())
    : [];
  
  // Get sub-team members for Sub-Stakeholder (if they are a sub-team leader)
  const subTeamMemberEmails = activeUser.Role === ROLE.SUB_STAKEHOLDER
    ? users.filter(u => 
        u.SubTeamIDs?.some(stid => activeUser.SubTeamIDs?.includes(stid)) &&
        u.Email?.toLowerCase() !== userEmail &&
        u.Active
      ).map(u => u.Email.toLowerCase())
    : [];
  
  const afterRoleFilter = tasks.filter(task => {
    // Admin sees everything
    if (isAdminLevel(activeUser.Role)) return true;
    
    // Team Leader sees their assigned tasks, tasks they assigned, and team members' tasks (excluding own)
    if (activeUser.Role === ROLE.TEAM_LEADER) {
      const assignedToMe = task.AssignedToEmail?.toLowerCase().includes(userEmail);
      const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
      const assignedToTeamMember = task.AssignedToEmail?.toLowerCase().split(',').some(email => 
        teamMemberEmails.includes(email.trim().toLowerCase())
      );
      return assignedToMe || assignedByMe || assignedToTeamMember;
    }
    
    // Stakeholders see their assigned tasks, tasks they assigned, and their hierarchical sub-stakeholder tasks
    if (activeUser.Role === ROLE.STAKEHOLDER) {
      const assignedToMe = task.AssignedToEmail?.toLowerCase().includes(userEmail);
      const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
      const assignedToSubStakeholder = task.AssignedToEmail?.toLowerCase().split(',').some(email => 
        subStakeholderEmails.includes(email.trim().toLowerCase())
      );
      return assignedToMe || assignedByMe || assignedToSubStakeholder;
    }
    
    // Sub-Stakeholders see their assigned tasks and their sub-team members' tasks
    if (activeUser.Role === ROLE.SUB_STAKEHOLDER) {
      const assignedToMe = task.AssignedToEmail?.toLowerCase().includes(userEmail);
      const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
      const assignedToSubTeamMember = task.AssignedToEmail?.toLowerCase().split(',').some(email => 
        subTeamMemberEmails.includes(email.trim().toLowerCase())
      );
      return assignedToMe || assignedByMe || assignedToSubTeamMember;
    }
    
    // Regular members see only their assigned tasks
    return task.AssignedToEmail?.toLowerCase().includes(userEmail);
  });
  
  const afterViewFilter = afterRoleFilter.filter(task => {
    // Apply view filters
    if (currentView === 'my-tasks') {
      // My Tasks: Only tasks assigned directly to me
      return task.AssignedToEmail?.toLowerCase().includes(userEmail);
    }
    if (currentView === 'team-tasks') {
      // Team Tasks: For Admin - all tasks
      if (isAdminLevel(activeUser.Role)) {
        return true;
      }
      // Team Leader: team members' tasks (excludes own)
      if (activeUser.Role === ROLE.TEAM_LEADER) {
        return task.AssignedToEmail?.toLowerCase().split(',').some(email => 
          teamMemberEmails.includes(email.trim().toLowerCase())
        );
      }
      // Stakeholder: tasks they assigned
      if (activeUser.Role === ROLE.STAKEHOLDER) {
        return task.AssignedByEmail?.toLowerCase() === userEmail;
      }
      // Sub-Stakeholder: sub-team members' tasks (excludes own)
      if (activeUser.Role === ROLE.SUB_STAKEHOLDER) {
        return task.AssignedToEmail?.toLowerCase().split(',').some(email => 
          subTeamMemberEmails.includes(email.trim().toLowerCase())
        );
      }
      // Regular members don't see team tasks
      return false;
    }
    if (currentView === 'assigned-by-me') {
      return task.AssignedByEmail?.toLowerCase() === userEmail;
    }
    return true;
  });
  
  const afterStatusFilter = afterViewFilter.filter(task => {
    // Apply status filter — supports both a single value ("Closed") and a
    // comma-joined multi-value string ("Closed,Reviewed") produced when the
    // Dashboard KPI cards navigate with a statusFilter array.
    if (filters.status && filters.status !== 'All') {
      const statuses = filters.status.split(',').map((s: string) => s.trim()).filter(Boolean);
      return statuses.includes(task.Status);
    }
    return true;
  });
  
  const afterCategoryFilter = afterStatusFilter.filter(task => {
    // Apply category filter
    if (filters.category && filters.category !== 'All') {
      return task.TaskType === filters.category;
    }
    return true;
  });
  
  const afterPriorityFilter = afterCategoryFilter.filter(task => {
    // Apply priority filter
    if (filters.priority && filters.priority !== 'All') {
      // Handle both string and array priority filters
      if (Array.isArray(filters.priority)) {
        if (filters.priority.length === 0) return true; // Empty array means no filter
        const priorities = Array.isArray(task.Priority) ? task.Priority : [task.Priority];
        return filters.priority.some(p => priorities.includes(p));
      }
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

export function getOverdueAndSoonTasks(tasks: Task[], activeUser: any, users: any[] = []) {
  if (!tasks) return { overdue: [], soon: [] };
  if (!activeUser) return { overdue: [], soon: [] }; // Guard against null user
  
  const today = getCurrentLocalDate();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
  const threeDaysFromNowStr = threeDaysFromNow.toISOString().split('T')[0];
  
  // Get hierarchical subordinates for stakeholders
  const subStakeholderEmails = activeUser.Role === ROLE.STAKEHOLDER 
    ? getAllSubordinates(activeUser.Email, users)
    : [];
  
  const visibleTasks = tasks.filter(task => {
    if (isAdminLevel(activeUser.Role)) return true;
    if (activeUser.Role === ROLE.STAKEHOLDER) {
      const assignedToMe = task.AssignedToEmail?.includes(activeUser.Email);
      const assignedByMe = task.AssignedByEmail === activeUser.Email;
      const assignedToSubordinate = task.AssignedToEmail?.toLowerCase().split(',').some(email => 
        subStakeholderEmails.includes(email.trim().toLowerCase())
      );
      return assignedToMe || assignedByMe || assignedToSubordinate;
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

export function getVisibleReports(
  reports: TaskReport[], 
  activeUser: User,
  tasks: Task[] = [],
  users: User[] = [],
  teams: Team[] = [],
  subTeams: SubTeam[] = [],
  settings: AppSetting[] = []
) {
  if (!reports) return [];
  
  const userEmail = activeUser.Email?.toLowerCase() || '';
  
  // Compute user roles using the new role-based approach
  const userRoles = getUserRoles(activeUser, teams, subTeams, settings);
  
  // Get the Team Tasks scope filter function based on user roles
  const teamTasksFilter = getTeamTasksScope(activeUser, userRoles, users);

  return reports.filter(report => {
    // Admin sees all reports
    if (userRoles.some(r => r.type === 'Admin')) return true;
    
    // User sees reports they submitted
    if (report.SubmittedByEmail?.toLowerCase() === userEmail) return true;
    
    // User sees reports for tasks they can access
    const task = tasks.find(t => t.TaskID === report.TaskID);
    if (!task) return false;
    
    // Check if user can access this task using the same logic as task visibility
    const assignedToMe = splitEmails(task.AssignedToEmail).some(email => 
      email.toLowerCase() === userEmail
    );
    const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
    const inTeamScope = teamTasksFilter(task);
    
    return assignedToMe || assignedByMe || inTeamScope;
  });
}

export function getFilteredTasks(tasks: Task[], filters: any) {
  if (!tasks) return [];
  
  return tasks.filter(task => {
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
