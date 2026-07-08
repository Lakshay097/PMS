/**
 * subTeamUtils.ts
 *
 * Helper utilities for sub-team structure, leadership, and visibility.
 *
 * VISIBILITY RULES (from spec):
 *   Team leader        — sees task/report data for EVERYONE in the team,
 *                        across all sub-teams.
 *   Sub-team leader    — sees task/report data ONLY for members of their
 *                        own sub-team (assigned by the team leader via the
 *                        team_{TeamID}_subteam_{SubTeamID}_leaders setting).
 *   Regular member     — sees only their own tasks/reports, or tasks they
 *                        personally assigned to others.
 *
 * ROSTER VISIBILITY (amendment):
 *   EVERYONE in a team can see the full roster (names only, no task/report
 *   data) of all other members across all sub-teams in that team.
 *
 * ASSIGNMENT RULE:
 *   Any team member can assign a task to any other member in the same parent
 *   team, regardless of sub-team. Cross-team assignment is Admin-only.
 *
 * SETTINGS KEY PATTERN (mirrors TeamLeaderEmails):
 *   team_{TeamID}_subteam_{SubTeamID}_leaders  →  comma-separated emails
 *   SubTeamLeaderEmails is derived at read-time by dbService and attached to
 *   each SubTeam object — these helpers consume that derived field directly.
 */

import { User, SubTeam, Team } from '../types';
import { isAdminLevel, ROLE } from '../constants/status';
import { getAllSubordinates } from './userUtils';

// ─── Leadership checks ────────────────────────────────────────────────────────

/**
 * Returns true if the given email is a leader of the specified sub-team.
 * Reads from the already-hydrated SubTeamLeaderEmails field.
 */
export function isSubTeamLeader(email: string, subTeam: SubTeam): boolean {
  if (!email || !subTeam.SubTeamLeaderEmails) return false;
  const normalised = email.toLowerCase();
  return subTeam.SubTeamLeaderEmails.some(e => e.toLowerCase() === normalised);
}

/**
 * Returns true if the given email is a leader of ANY sub-team within a
 * specific parent team.
 */
export function isAnySubTeamLeader(
  email: string,
  subTeams: SubTeam[],
  teamId: string
): boolean {
  return subTeams
    .filter(st => st.TeamID === teamId && st.Active)
    .some(st => isSubTeamLeader(email, st));
}

/**
 * Returns true if the given email is a team-level leader (stored in the
 * team_{TeamID}_leaders settings key, surfaced as TeamLeaderEmails on Team).
 */
export function isTeamLeader(email: string, team: Team): boolean {
  if (!email || !team.TeamLeaderEmails) return false;
  const normalised = email.toLowerCase();
  return team.TeamLeaderEmails.some(e => e.toLowerCase() === normalised);
}

// ─── Sub-team membership ──────────────────────────────────────────────────────

/**
 * Returns the UNION of all sub-team IDs the user can see:
 *   1. All sub-team IDs where the user is a leader (SubTeamLeaderEmails)
 *   2. All sub-team IDs in the user's own SubTeamIDs array (membership)
 *
 * This is the single authoritative function for Sub-Team Leader visibility
 * in task/report filtering. Sub-Team Leaders see tasks/reports belonging to
 * anyone whose SubTeamIDs overlaps with this result.
 *
 * @param user     - The user whose visibility we are computing
 * @param subTeams - All sub-teams (already hydrated with SubTeamLeaderEmails)
 * @returns        - Array of sub-team IDs the user can see (unique, no duplicates)
 */
export function getVisibleSubTeamIds(user: User, subTeams: SubTeam[]): string[] {
  const result = new Set<string>();

  // Add sub-teams where user is a leader
  const userEmail = user.Email?.toLowerCase();
  if (userEmail) {
    subTeams.forEach(st => {
      if (st.Active && st.SubTeamLeaderEmails?.some(e => e.toLowerCase() === userEmail)) {
        result.add(st.SubTeamID);
      }
    });
  }

  // Add sub-teams where user is a member
  if (user.SubTeamIDs) {
    user.SubTeamIDs.forEach(id => result.add(id));
  }

  return Array.from(result);
}

/**
 * Returns the SubTeam the given user belongs to within a specific parent team,
 * or null if they are not assigned to any sub-team in that team.
 * With multi-membership, returns the first matching sub-team (for backward compatibility
 * with single-membership code paths). Callers needing all sub-teams should use
 * getSubTeamsForUser instead.
 */
export function getSubTeamForUser(
  user: User,
  subTeams: SubTeam[],
  teamId: string
): SubTeam | null {
  if (!user.SubTeamIDs || user.SubTeamIDs.length === 0) return null;
  return (
    subTeams.find(
      st =>
        user.SubTeamIDs.includes(st.SubTeamID) &&
        st.TeamID === teamId &&
        st.Active
    ) ?? null
  );
}

/**
 * Returns all members of a given sub-team.
 */
export function getMembersOfSubTeam(
  subTeamId: string,
  allUsers: User[]
): User[] {
  return allUsers.filter(u => u.SubTeamIDs?.includes(subTeamId) && u.Active);
}

/**
 * Returns all members of a given parent team (across all sub-teams and
 * unassigned members).
 */
export function getMembersOfTeam(teamId: string, allUsers: User[]): User[] {
  return allUsers.filter(
    u => (u.TeamIDs ?? []).includes(teamId) && u.Active
  );
}

// ─── Task/report data visibility ─────────────────────────────────────────────

/**
 * Returns the set of user emails whose task/report DATA the given user is
 * allowed to see, according to the spec visibility rules.
 *
 * This is the single authoritative function that Tasks 5 and 6 will use to
 * scope their filters — it keeps all visibility logic in one place.
 *
 * @param viewerEmail  - Email of the user whose visibility scope we are computing
 * @param teamId       - The team context to evaluate (users can belong to multiple teams)
 * @param allUsers     - Full user list (active + inactive for completeness)
 * @param subTeams     - All sub-teams (already hydrated with SubTeamLeaderEmails)
 * @param team         - The Team object (carries TeamLeaderEmails)
 * @returns            - Set of lowercase emails the viewer can see task/report data for.
 *                       Always includes the viewer themselves.
 */
export function getVisibleMemberEmails(
  viewerEmail: string,
  teamId: string,
  allUsers: User[],
  subTeams: SubTeam[],
  team: Team
): Set<string> {
  const normalised = viewerEmail.toLowerCase();
  const result = new Set<string>([normalised]); // viewer always sees themselves

  // Admin — handled upstream, but guard here too
  const viewer = allUsers.find(u => u.Email.toLowerCase() === normalised);
  if (!viewer) return result;
  if (isAdminLevel(viewer.Role)) {
    allUsers.forEach(u => result.add(u.Email.toLowerCase()));
    return result;
  }

  // Team leader → everyone in the team
  if (isTeamLeader(viewerEmail, team)) {
    getMembersOfTeam(teamId, allUsers).forEach(u =>
      result.add(u.Email.toLowerCase())
    );
    return result;
  }

  // Sub-team leader → everyone in their own sub-team
  const ledSubTeam = subTeams.find(
    st =>
      st.TeamID === teamId &&
      st.Active &&
      isSubTeamLeader(viewerEmail, st)
  );
  if (ledSubTeam) {
    getMembersOfSubTeam(ledSubTeam.SubTeamID, allUsers).forEach(u =>
      result.add(u.Email.toLowerCase())
    );
    return result;
  }

  // Regular member → only themselves (already in result)
  return result;
}

// ─── Roster visibility (amendment) ───────────────────────────────────────────

/**
 * Returns the full roster (User objects) of everyone in the given team,
 * across all sub-teams, visible to ALL team members regardless of role.
 *
 * This is NAMES/ROSTER only — no task or report data is included.
 * The caller is responsible for projecting only the fields they need
 * (e.g. FullName, Email, SubTeamName) before rendering.
 */
export function getTeamRoster(teamId: string, allUsers: User[]): User[] {
  return getMembersOfTeam(teamId, allUsers);
}

// ─── Assignment eligibility ───────────────────────────────────────────────────

/**
 * Returns true if the assigner can assign a task to the target user without
 * Admin involvement.
 *
 * Rules (from spec):
 * - Admin: can always assign to anyone
 * - Team Leader: can only assign to members within their own parent team
 * - Sub-Stakeholder (Sub-team Leader): can only assign to members within their own sub-team
 * - Stakeholder: can assign within their hierarchical scope (subordinates)
 * - Regular Member: can assign to anyone in the same parent team
 *
 * @param assigner  - The user attempting to assign
 * @param assignee  - The target user being assigned to
 * @param subTeams  - All sub-teams (already hydrated with SubTeamLeaderEmails)
 * @param allUsers  - All users in the system (for hierarchical subordinate lookup)
 * @returns         - true if assignment is allowed
 */
export function canAssignWithinTeam(
  assigner: User,
  assignee: User,
  subTeams: SubTeam[],
  allUsers: User[] = []
): boolean {
  if (!assigner || !assignee) return false;

  // Admins can always assign to anyone
  if (isAdminLevel(assigner.Role)) return true;

  const assignerEmail = assigner.Email?.toLowerCase() || '';
  const assigneeEmail = assignee.Email?.toLowerCase() || '';

  // Team Leader: can only assign to members within their own parent team (excluding themselves)
  if (assigner.Role === ROLE.TEAM_LEADER) {
    const assignerTeams = new Set(assigner.TeamIDs ?? []);
    const assigneeTeams = assignee.TeamIDs ?? [];
    
    // Must be in the same team
    const sameTeam = assigneeTeams.some(tid => assignerTeams.has(tid));
    
    // Cannot assign to themselves
    const notSelf = assigneeEmail !== assignerEmail;
    
    return sameTeam && notSelf;
  }

  // Sub-Stakeholder: can only assign to members within their own sub-team
  if (assigner.Role === ROLE.SUB_STAKEHOLDER) {
    const visibleSubTeamIds = getVisibleSubTeamIds(assigner, subTeams);
    
    // Check if they're actually a sub-team leader
    const isLeader = subTeams.some(st =>
      st.Active && st.SubTeamLeaderEmails?.some(e => e.toLowerCase() === assignerEmail)
    );
    
    if (isLeader && visibleSubTeamIds.length > 0) {
      // As a sub-team leader, can only assign to members of their visible sub-teams
      const assigneeSubTeamIds = assignee.SubTeamIDs ?? [];
      const inVisibleSubTeam = assigneeSubTeamIds.some(id => visibleSubTeamIds.includes(id));
      
      // Cannot assign to themselves
      const notSelf = assigneeEmail !== assignerEmail;
      
      return inVisibleSubTeam && notSelf;
    }
    
    // Regular sub-stakeholder (not a leader): can assign within their parent team
    const assignerTeams = new Set(assigner.TeamIDs ?? []);
    const assigneeTeams = assignee.TeamIDs ?? [];
    const sameTeam = assigneeTeams.some(tid => assignerTeams.has(tid));
    const notSelf = assigneeEmail !== assignerEmail;
    
    return sameTeam && notSelf;
  }

  // Stakeholder: can assign within their hierarchical scope (subordinates)
  if (assigner.Role === ROLE.STAKEHOLDER) {
    const subordinateEmails = getAllSubordinates(assigner.Email, allUsers);
    const isSubordinate = subordinateEmails.includes(assigneeEmail);
    
    // Can also assign to themselves
    const isSelf = assigneeEmail === assignerEmail;
    
    return isSubordinate || isSelf;
  }

  // Regular Member: can assign to anyone in the same parent team
  const assignerTeams = new Set(assigner.TeamIDs ?? []);
  const assigneeTeams = assignee.TeamIDs ?? [];
  const sameTeam = assigneeTeams.some(tid => assignerTeams.has(tid));
  const notSelf = assigneeEmail !== assignerEmail;
  
  return sameTeam && notSelf;
}

// ─── Settings key helpers ─────────────────────────────────────────────────────

/**
 * Returns the settings key used to store sub-team leader emails.
 * Mirrors the pattern used in dbService and AdminPanel for team leaders:
 *   team_{TeamID}_leaders  →  team_{TeamID}_subteam_{SubTeamID}_leaders
 */
export function subTeamLeadersSettingKey(
  teamId: string,
  subTeamId: string
): string {
  return `team_${teamId}_subteam_${subTeamId}_leaders`;
}

/**
 * Parses a comma-separated leaders value from the settings store into a
 * clean array of lowercase emails.  Returns [] for empty/undefined values.
 */
export function parseLeaderEmails(settingValue: string | undefined): string[] {
  if (!settingValue) return [];
  return settingValue
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}
