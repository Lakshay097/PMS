/**
 * roleUtils.ts
 *
 * Role resolution and union-based task visibility logic.
 */

import { User, Team, SubTeam, AppSetting } from '../types';

export type UserRole = 
  | { type: 'Admin' }
  | { type: 'TeamLeader'; teamIDs: string[] }
  | { type: 'SubTeamLeader'; subTeamIDs: string[] }
  | { type: 'Stakeholder' }
  | { type: 'SubStakeholder' };

/**
 * Computes the full set of roles for a user based on their BaseRole,
 * team leadership, sub-team leadership, and settings.
 */
export function getUserRoles(
  user: User,
  teams: Team[],
  subTeams: SubTeam[],
  settings: AppSetting[]
): UserRole[] {
  const roles: UserRole[] = [];

  // Return empty roles if user is null or undefined
  if (!user) {
    return roles;
  }

  // Admin role
  if (isAdminLevel(user.Role)) {
    roles.push({ type: 'Admin' });
  }

  // Team Leader role - check if user is in TeamLeaderEmails for any team
  const leaderTeamIDs = teams
    .filter(t => t.TeamLeaderEmails?.some(e => e.toLowerCase() === (user.Email || '').toLowerCase()))
    .map(t => t.TeamID);
  
  if (leaderTeamIDs.length > 0) {
    roles.push({ type: 'TeamLeader', teamIDs: leaderTeamIDs });
  }

  // Sub-Team Leader role - parse from settings keys matching team_*_subteam_*_leaders
  const leaderSubTeamIDs = parseSubTeamLeaderSettings(user.Email || '', settings);
  
  if (leaderSubTeamIDs.length > 0) {
    roles.push({ type: 'SubTeamLeader', subTeamIDs: leaderSubTeamIDs });
  }

  // Stakeholder role
  if (user.Role === 'Stakeholder') {
    roles.push({ type: 'Stakeholder' });
  }

  // Sub-stakeholder role
  if (user.Role === 'Sub-stakeholder') {
    roles.push({ type: 'SubStakeholder' });
  }

  return roles;
}

/**
 * Parses settings keys matching team_*_subteam_*_leaders to find sub-teams
 * where the user is a leader.
 */
function parseSubTeamLeaderSettings(userEmail: string, settings: AppSetting[]): string[] {
  const subTeamIDs: string[] = [];
  const pattern = /^team_(.+)_subteam_(.+)_leaders$/;

  for (const setting of settings) {
    const match = setting.Key.match(pattern);
    if (match) {
      const subTeamId = match[2];
      const emails = parseCommaSeparatedEmails(setting.Value);
      
      if (emails.includes(userEmail.toLowerCase())) {
        subTeamIDs.push(subTeamId);
      }
    }
  }

  return subTeamIDs;
}

/**
 * Parses a comma-separated string of emails into a lowercase array.
 */
function parseCommaSeparatedEmails(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Checks if the role is Admin level.
 */
function isAdminLevel(role: string | undefined): boolean {
  return role === 'Admin';
}

/**
 * Splits a comma-separated email string into an array of trimmed emails.
 */
export function splitEmails(emailString: string | undefined): string[] {
  if (!emailString) return [];
  return emailString.split(',').map(e => e.trim()).filter(Boolean);
}

/**
 * Computes the Team Tasks data scope for a user based on their roles.
 * Returns a filter function that can be applied to a task array.
 */
export function getTeamTasksScope(
  user: User,
  roles: UserRole[],
  users: User[]
): (task: any) => boolean {
  // Admin short-circuit - sees all tasks
  if (roles.some(r => r.type === 'Admin')) {
    return () => true;
  }

  // Collect scope team IDs and sub-team IDs from all roles
  const scopeTeamIDs: string[] = [];
  const scopeSubTeamIDs: string[] = [];

  for (const role of roles) {
    if (role.type === 'TeamLeader') {
      scopeTeamIDs.push(...role.teamIDs);
    }
    if (role.type === 'SubTeamLeader') {
      scopeSubTeamIDs.push(...role.subTeamIDs);
    }
  }

  // If no team/sub-team scope, user shouldn't see team tasks
  if (scopeTeamIDs.length === 0 && scopeSubTeamIDs.length === 0) {
    return () => false;
  }

  // Resolve to member emails
  const teamMemberEmails = users
    .filter(u => u.TeamIDs?.some(id => scopeTeamIDs.includes(id)))
    .map(u => (u.Email || '').toLowerCase());
  
  const subTeamMemberEmails = users
    .filter(u => u.SubTeamIDs?.some(id => scopeSubTeamIDs.includes(id)))
    .map(u => (u.Email || '').toLowerCase());

  // Union of team and sub-team member emails
  const targetEmails = new Set([...teamMemberEmails, ...subTeamMemberEmails]);

  // Return filter function
  return (task: any) => {
    // Check if task is assigned to any target email (split comma-separated)
    const assignedToTargets = splitEmails(task.AssignedToEmail).some(email =>
      targetEmails.has(email.toLowerCase())
    );

    // OR check if task is assigned directly to a team in scope
    const assignedToScopeTeam = task.AssignedToTeamIDs?.some((id: string) =>
      scopeTeamIDs.includes(id)
    );

    // No filter on AssignedByEmail - any assigner counts per spec
    return assignedToTargets || assignedToScopeTeam;
  };
}

/**
 * Determines if the user should see the Team Tasks tab based on their roles.
 */
export function shouldShowTeamTasksTab(roles: UserRole[]): boolean {
  return roles.some(role => 
    role.type === 'Admin' || 
    role.type === 'TeamLeader' || 
    role.type === 'SubTeamLeader'
  );
}

/**
 * Determines if the user should see the Assigned by Me tab.
 */
export function shouldShowAssignedByMeTab(roles: UserRole[]): boolean {
  return roles.length > 0;
}
