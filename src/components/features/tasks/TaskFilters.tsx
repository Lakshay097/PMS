import React, { useState, useRef, useEffect } from 'react';
import { Filter, X, ChevronDown, Search, Calendar } from 'lucide-react';
import { User as UserType, Team } from '../../../types';
import { ROLE } from '../../../constants/status';
import { getAllSubordinates } from '../../../utils/userUtils';

interface TaskFiltersProps {
  filterStatus: string;
  filterPriority: string;
  filterAssigneeNames: string[];
  filterTeamIDs: string[];
  filterDateFrom: string;
  filterDateTo: string;
  currentUser: UserType;
  users: UserType[];
  teams: Team[];
  isDarkMode: boolean;
  onFilterStatusChange: (value: string) => void;
  onFilterPriorityChange: (value: string) => void;
  onFilterAssigneeNamesChange: (value: string[]) => void;
  onFilterTeamIDsChange: (value: string[]) => void;
  onFilterDateFromChange: (value: string) => void;
  onFilterDateToChange: (value: string) => void;
}

export default function TaskFilters({
  filterStatus,
  filterPriority,
  filterAssigneeNames,
  filterTeamIDs,
  filterDateFrom,
  filterDateTo,
  currentUser,
  users,
  teams,
  isDarkMode,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterAssigneeNamesChange,
  onFilterTeamIDsChange,
  onFilterDateFromChange,
  onFilterDateToChange,
}: TaskFiltersProps) {
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  // Close assignee dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(event.target as Node)) {
        setIsAssigneeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close team dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
        setIsTeamDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get filtered users based on role and search
  const getFilteredUsers = () => {
    let filteredUsers;
    if (currentUser.Role === ROLE.ADMIN) {
      filteredUsers = users.filter(u => u.Active);
    } else if (currentUser.Role === ROLE.STAKEHOLDER) {
      const subStakeholderEmails = getAllSubordinates(currentUser.Email, users);
      filteredUsers = users.filter(u => 
        u.Active && (
          u.Email.toLowerCase() === currentUser.Email.toLowerCase() ||
          subStakeholderEmails.includes(u.Email.toLowerCase())
        )
      );
    } else {
      filteredUsers = users.filter(u => u.Active && u.Email.toLowerCase() === currentUser.Email.toLowerCase());
    }

    // Apply search filter
    if (searchQuery) {
      filteredUsers = filteredUsers.filter(u =>
        u.FullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.Email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return filteredUsers;
  };

  const filteredUsers = getFilteredUsers();

  const toggleAssignee = (email: string) => {
    if (filterAssigneeNames.includes(email)) {
      onFilterAssigneeNamesChange(filterAssigneeNames.filter(e => e !== email));
    } else {
      onFilterAssigneeNamesChange([...filterAssigneeNames, email]);
    }
  };

  const clearAll = () => {
    onFilterAssigneeNamesChange([]);
    onFilterTeamIDsChange([]);
    onFilterDateFromChange('');
    onFilterDateToChange('');
    setSearchQuery('');
  };

  const toggleTeam = (teamId: string) => {
    if (filterTeamIDs.includes(teamId)) {
      onFilterTeamIDsChange(filterTeamIDs.filter(id => id !== teamId));
    } else {
      onFilterTeamIDsChange([...filterTeamIDs, teamId]);
    }
  };
  return (
    <div className={`border rounded-xl p-3 sm:p-4 flex flex-wrap gap-2 sm:gap-4 items-center ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
      <div className={`flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        <Filter size={14} className="sm:size-16" />
        <span className="hidden sm:inline">Filters:</span>
        <span className="sm:hidden">Filter</span>
      </div>
      <select
        value={filterStatus}
        onChange={(e) => onFilterStatusChange(e.target.value)}
        className={`border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode 
            ? 'bg-[#1E293B] border-[#334155] text-white' 
            : 'bg-slate-50 border-slate-200 text-slate-900'
        }`}
      >
        <option value="All">All status</option>
        <option value="In Progress">In Progress</option>
        <option value="Submitted">Submitted</option>
        <option value="Closed">Closed</option>
        <option value="Overdue">Overdue</option>
        <option value="On Hold">On Hold</option>
        <option value="Dropped">Dropped</option>
      </select>
      <select
        value={filterPriority}
        onChange={(e) => onFilterPriorityChange(e.target.value)}
        className={`border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode 
            ? 'bg-[#1E293B] border-[#334155] text-white' 
            : 'bg-slate-50 border-slate-200 text-slate-900'
        }`}
      >
        <option value="All">All priority</option>
        <option value="Critical">Critical</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <div className="relative" ref={assigneeDropdownRef}>
        <button
          onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
          className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isDarkMode 
              ? 'bg-[#1E293B] border-[#334155] text-white' 
              : 'bg-slate-50 border-slate-200 text-slate-900'
          }`}
        >
          <Filter size={14} className="sm:size-16" />
          <span className="hidden sm:inline">Assignees</span>
          <span className="sm:hidden">Users</span>
          {filterAssigneeNames.length > 0 && (
            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
              isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
            }`}>
              {filterAssigneeNames.length}
            </span>
          )}
          <ChevronDown size={12} className={`transition-transform sm:size-14 ${isAssigneeDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isAssigneeDropdownOpen && (
          <div className={`absolute top-full left-0 mt-2 w-64 sm:w-72 rounded-lg shadow-lg z-50 ${
            isDarkMode ? 'bg-[#1E293B] border border-[#334155]' : 'bg-white border border-[#E5E7EB]'
          }`}>
            {/* Search input */}
            <div className="p-2 sm:p-3 border-b border-[#E5E7EB] dark:border-[#334155]">
              <div className="relative">
                <Search size={12} className={`absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} sm:size-14`} />
                <input
                  type="text"
                  placeholder="Search assignees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-[#0F141F] border border-[#334155] text-white placeholder-slate-500' 
                      : 'bg-slate-50 border border-[#E5E7EB] text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
            </div>

            {/* Assignee list */}
            <div className="max-h-60 overflow-y-auto p-2">
              {filteredUsers.length === 0 ? (
                <div className={`text-center py-3 sm:py-4 text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No assignees found
                </div>
              ) : (
                filteredUsers.map(user => (
                  <label
                    key={user.UserID}
                    className={`flex items-center gap-2 sm:gap-3 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-[#334155]/50 transition-colors ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={filterAssigneeNames.includes(user.Email)}
                      onChange={() => toggleAssignee(user.Email)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-xs sm:text-sm">{user.FullName}</span>
                  </label>
                ))
              )}
            </div>

            {/* Clear all button */}
            {filterAssigneeNames.length > 0 && (
              <div className="p-2 border-t border-[#E5E7EB] dark:border-[#334155]">
                <button
                  onClick={clearAll}
                  className={`w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md transition-colors ${
                    isDarkMode 
                      ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <X size={12} className="sm:size-14" />
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Team Filter */}
      <div className="relative" ref={teamDropdownRef}>
        <button
          onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)}
          className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isDarkMode 
              ? 'bg-[#1E293B] border-[#334155] text-white' 
              : 'bg-slate-50 border-slate-200 text-slate-900'
          }`}
        >
          <Filter size={14} className="sm:size-16" />
          <span>Teams</span>
          {filterTeamIDs.length > 0 && (
            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
              isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {filterTeamIDs.length}
            </span>
          )}
          <ChevronDown size={12} className={`transition-transform sm:size-14 ${isTeamDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isTeamDropdownOpen && (
          <div className={`absolute top-full left-0 mt-2 w-64 sm:w-72 rounded-lg shadow-lg z-50 ${
            isDarkMode ? 'bg-[#1E293B] border border-[#334155]' : 'bg-white border border-[#E5E7EB]'
          }`}>
            {/* Team list */}
            <div className="max-h-60 overflow-y-auto p-2">
              {teams.length === 0 ? (
                <div className={`text-center py-3 sm:py-4 text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No teams found
                </div>
              ) : (
                teams.map(team => (
                  <label
                    key={team.TeamID}
                    className={`flex items-center gap-2 sm:gap-3 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-[#334155]/50 transition-colors ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={filterTeamIDs.includes(team.TeamID)}
                      onChange={() => toggleTeam(team.TeamID)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-xs sm:text-sm">{team.TeamName}</span>
                  </label>
                ))
              )}
            </div>

            {/* Clear all button */}
            {filterTeamIDs.length > 0 && (
              <div className="p-2 border-t border-[#E5E7EB] dark:border-[#334155]">
                <button
                  onClick={() => onFilterTeamIDsChange([])}
                  className={`w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md transition-colors ${
                    isDarkMode 
                      ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <X size={12} className="sm:size-14" />
                  Clear teams
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-[#E5E7EB]'}`}>
          <Calendar size={14} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => onFilterDateFromChange(e.target.value)}
            className={`bg-transparent focus:outline-none text-xs sm:text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
            placeholder="From"
          />
        </div>
        <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>to</span>
        <div className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-[#E5E7EB]'}`}>
          <Calendar size={14} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => onFilterDateToChange(e.target.value)}
            className={`bg-transparent focus:outline-none text-xs sm:text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
            placeholder="To"
          />
        </div>
      </div>
    </div>
  );
}
