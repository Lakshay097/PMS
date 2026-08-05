import React, { useState } from 'react';
import { Task, User as UserType, Team, SubTeam } from '../types';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import { isAdminLevel } from '../constants/status';
import { ROLE } from '../constants/status';
import { Plus, ChevronRight, ChevronDown, User, Search } from 'lucide-react';

interface TeamPageProps {
  tasks: Task[];
  currentUser?: UserType;
  users?: UserType[];
  teams?: Team[];
  subTeams?: SubTeam[];
  onAddTeam?: (team: Team) => void;
  onToggleTeamStatus?: (teamId: string) => void;
  onUpdateUserTeams?: (email: string, teamIDs: string[], teamNames: string[]) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
  onRenameTeam?: (teamId: string, newName: string) => Promise<void>;
  onSaveSubTeam?: (subTeam: SubTeam) => Promise<void>;
  onDeleteSubTeam?: (subTeamId: string) => Promise<void>;
  onUpdateSubTeamLeaders?: (teamId: string, subTeamId: string, leaderEmails: string[]) => Promise<void>;
  onAssignUserToSubTeam?: (userEmail: string, subTeamId: string | null, subTeamName: string | null) => Promise<void>;
  onRemoveUserFromSubTeam?: (userEmail: string, subTeamId: string) => Promise<void>;
  isDarkMode?: boolean;
  onNewTask?: (assigneeEmail?: string, teamIds?: string[]) => void;
}

export default function TeamPage({
  tasks,
  currentUser,
  users = [],
  teams = [],
  subTeams = [],
  onAddTeam,
  onToggleTeamStatus,
  onUpdateUserTeams,
  onDeleteTeam,
  onRenameTeam,
  onSaveSubTeam,
  onDeleteSubTeam,
  onUpdateSubTeamLeaders,
  onAssignUserToSubTeam,
  onRemoveUserFromSubTeam,
  isDarkMode = false,
  onNewTask,
}: TeamPageProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedTeamIds, setCollapsedTeamIds] = useState<Set<string>>(new Set((teams || []).filter(t => t.Active).map(t => t.TeamID)));

  // Roster amendment: every team member sees the full roster of all members in
  // their team(s), grouped by sub-team. Names/email only — no task/report data.
  // Admins see every team; non-admins see only teams they belong to.
  const visibleTeams = currentUser && isAdminLevel(currentUser.Role)
    ? (teams || []).filter(t => t.Active)
    : currentUser ? (teams || []).filter(t => t.Active && (currentUser.TeamIDs || []).includes(t.TeamID)) : [];

  const searchLower = searchQuery.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 border rounded-xl p-6 bg-surface border-token">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-lg text-primary">
              Team Members
            </h3>
            <p className="text-sm mt-1 text-muted">
              Full roster — all members across all sub-teams
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {/* Search input */}
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-9 pr-4 py-2 bg-surface border border-token rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {currentUser && isAdminLevel(currentUser.Role) && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigate(ROUTES.ADMIN)}
                  className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  <span>Add Member</span>
                </button>
                <button
                  onClick={() => navigate(ROUTES.ADMIN)}
                  className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  <span>Add Team</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {visibleTeams.length === 0 ? (
          <div className={`p-12 text-center text-muted`}>
            {currentUser && isAdminLevel(currentUser.Role) ? 'No active teams.' : 'You are not assigned to any team.'}
          </div>
        ) : (
          <div className="space-y-6">
            {visibleTeams.map(team => {
              // All active members of this team
              const allTeamMembers = (users || []).filter(
                u => u.Active && (u.TeamIDs || []).includes(team.TeamID)
              );
              const filteredMembers = searchQuery
                ? allTeamMembers.filter(u =>
                  u.FullName.toLowerCase().includes(searchLower) ||
                  u.Email.toLowerCase().includes(searchLower)
                )
                : allTeamMembers;

              // Sub-teams for this team
              const teamSubTeamList = (subTeams || []).filter(
                st => st.TeamID === team.TeamID && st.Active
              );

              // Group members by sub-team; unassigned go to a separate bucket
              type GroupEntry = { label: string; members: UserType[]; isSubTeam: boolean };
              const groups: GroupEntry[] = [];

              teamSubTeamList.forEach(st => {
                // Multi-membership: include all users who belong to this sub-team
                const members = filteredMembers.filter(u => u.SubTeamIDs?.includes(st.SubTeamID));
                groups.push({ label: st.SubTeamName, members, isSubTeam: true });
              });

              // Unassigned: users with no sub-team assignments in this team
              const unassigned = filteredMembers.filter(u => !u.SubTeamIDs || u.SubTeamIDs.length === 0 || !teamSubTeamList.some(st => u.SubTeamIDs?.includes(st.SubTeamID)));
              if (unassigned.length > 0 || teamSubTeamList.length === 0) {
                groups.push({ label: teamSubTeamList.length > 0 ? 'Unassigned' : 'Members', members: unassigned, isSubTeam: false });
              }

              const isCollapsed = collapsedTeamIds.has(team.TeamID);
              const toggleCollapse = () => {
                setCollapsedTeamIds(prev => {
                  const next = new Set(prev);
                  if (next.has(team.TeamID)) {
                    next.delete(team.TeamID);
                  } else {
                    next.add(team.TeamID);
                  }
                  return next;
                });
              };

              return (
                <div key={team.TeamID} className="border rounded-xl overflow-hidden border-token">
                  {/* Team header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-surface border-token">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={toggleCollapse}
                        className="flex items-center justify-center w-6 h-6 rounded hover-surface transition-colors"
                      >
                        {isCollapsed ? (
                          <ChevronRight size={16} className="text-muted" />
                        ) : (
                          <ChevronDown size={16} className="text-muted" />
                        )}
                      </button>
                      <h4 className="font-bold text-sm text-primary">{team.TeamName}</h4>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-blue-500/10 border-blue-500/20 text-blue-400">
                        {allTeamMembers.length} member{allTeamMembers.length !== 1 ? 's' : ''}
                      </span>
                      {teamSubTeamList.length > 0 && (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-indigo-500/10 border-indigo-500/20 text-indigo-400">
                          {teamSubTeamList.length} sub-team{teamSubTeamList.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {currentUser && isAdminLevel(currentUser.Role) && (
                      <button
                        onClick={() => onNewTask && onNewTask(allTeamMembers.map(u => u.Email).join(', '), [team.TeamID])}
                        className="text-xs font-medium px-2 py-1 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                      >
                        Assign Task to Team
                      </button>
                    )}
                  </div>

                  {/* Member groups */}
                  <div className="divide-y divide-[var(--color-border)]">
                    {isCollapsed ? (
                      // Collapsed view: show only team leaders and sub-teams
                      <>
                        {/* Team leaders */}
                        {allTeamMembers.filter(m => team.TeamLeaderEmails?.some(e => e.toLowerCase() === m.Email.toLowerCase())).map(member => (
                          <div key={member.Email} className="px-5 py-3 flex items-center justify-between hover:bg-opacity-50 transition-colors hover-surface">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center flex-shrink-0">
                                <User className="text-white" size={14} />
                              </div>
                              <div>
                                <div className="font-medium text-sm text-primary">
                                  {member.FullName}
                                </div>
                                <div className="text-xs text-muted">{member.Email}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-500/10 border-amber-500/20 text-amber-400">
                                Team Leader
                              </span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded border ${member.Role === ROLE.ADMIN
                                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                  : member.Role === ROLE.STAKEHOLDER
                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                    : 'bg-slate-500/10 text-secondary border-slate-500/20'
                              }`}>
                                {member.Role}
                              </span>
                            </div>
                          </div>
                        ))}
                        {/* Sub-teams (just names, no members) */}
                        {teamSubTeamList.map(st => (
                          <div key={st.SubTeamID} className="px-5 py-2 flex items-center gap-2 bg-surface border-token">
                            <span className="text-[10px] font-bold tracking-widest uppercase text-muted">
                              {st.SubTeamName}
                            </span>
                            <span className="text-[10px] text-muted">
                              ({allTeamMembers.filter(m => m.SubTeamIDs?.includes(st.SubTeamID)).length} members)
                            </span>
                          </div>
                        ))}
                      </>
                    ) : (
                      // Expanded view: show all members grouped by sub-team
                      groups.map(group => (
                        <div key={group.label}>
                          {/* Sub-team label — only show when there are actual sub-teams */}
                          {teamSubTeamList.length > 0 && (
                            <div className="px-5 py-2 flex items-center gap-2 bg-surface border-token">
                              <span className="text-[10px] font-bold tracking-widest uppercase text-muted">
                                {group.label}
                              </span>
                              <span className="text-[10px] text-muted">
                                ({group.members.length})
                              </span>
                            </div>
                          )}
                          {group.members.length === 0 ? (
                            <div className="px-5 py-3 text-xs italic text-muted">
                              No members in this sub-team
                            </div>
                          ) : (
                            group.members.map(member => {
                              const isLeader = team.TeamLeaderEmails?.some(e => e.toLowerCase() === member.Email.toLowerCase());
                              // Multi-membership: check if user is a leader of ANY sub-team they belong to
                              const subTeamObj = member.SubTeamIDs && member.SubTeamIDs.length > 0
                                ? teamSubTeamList.find(st => member.SubTeamIDs?.includes(st.SubTeamID))
                                : null;
                              const isSubLeader = subTeamObj?.SubTeamLeaderEmails?.some(
                                e => e.toLowerCase() === member.Email.toLowerCase()
                              );
                              return (
                                <div key={member.Email} className="px-5 py-3 flex items-center justify-between hover:bg-opacity-50 transition-colors hover-surface">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center flex-shrink-0">
                                      <User className="text-white" size={14} />
                                    </div>
                                    <div>
                                      <div className={`font-medium text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                        {member.FullName}
                                      </div>
                                      <div className={`text-xs ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>{member.Email}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {isLeader && (
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                                        Team Leader
                                      </span>
                                    )}
                                    {isSubLeader && (
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                                        Sub-Team Leader
                                      </span>
                                    )}
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${member.Role === ROLE.ADMIN
                                        ? isDarkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200'
                                        : member.Role === ROLE.STAKEHOLDER
                                          ? isDarkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200'
                                          : 'bg-slate-500/10 text-secondary border-slate-500/20'
                                      }`}>
                                      {member.Role}
                                    </span>
                                    {currentUser && isAdminLevel(currentUser.Role) && member.Role === ROLE.STAKEHOLDER && (
                                      <button
                                        onClick={() => onNewTask && onNewTask(member.Email)}
                                        className="text-xs font-medium px-2 py-1 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                                      >
                                        Assign Task
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
