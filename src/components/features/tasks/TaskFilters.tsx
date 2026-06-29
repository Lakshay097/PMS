import React, { useState, useRef, useEffect } from 'react';
import { Filter, X, ChevronDown, Search } from 'lucide-react';
import { User as UserType } from '../../../types';
import { ROLE } from '../../../constants/status';
import { getAllSubordinates } from '../../../utils/userUtils';

interface TaskFiltersProps {
  filterStatus: string;
  filterPriority: string;
  filterAssigneeNames: string[];
  currentUser: UserType;
  users: UserType[];
  isDarkMode: boolean;
  onFilterStatusChange: (value: string) => void;
  onFilterPriorityChange: (value: string) => void;
  onFilterAssigneeNamesChange: (value: string[]) => void;
}

export default function TaskFilters({
  filterStatus,
  filterPriority,
  filterAssigneeNames,
  currentUser,
  users,
  isDarkMode,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterAssigneeNamesChange,
}: TaskFiltersProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
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
    setSearchQuery('');
  };
  return (
    <div className={`border rounded-xl p-4 flex flex-wrap gap-4 items-center ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
      <div className={`flex items-center space-x-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        <Filter size={16} />
        <span>Filters:</span>
      </div>
      <select
        value={filterStatus}
        onChange={(e) => onFilterStatusChange(e.target.value)}
        className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode 
            ? 'bg-[#1E293B] border-[#334155] text-white' 
            : 'bg-slate-50 border-slate-200 text-slate-900'
        }`}
      >
        <option value="All">All Status</option>
        <option value="Not Started">Not Started</option>
        <option value="In progress">In Progress</option>
        <option value="Submitted">Submitted</option>
        <option value="Closed">Closed</option>
        <option value="Overdue">Overdue</option>
      </select>
      <select
        value={filterPriority}
        onChange={(e) => onFilterPriorityChange(e.target.value)}
        className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isDarkMode 
            ? 'bg-[#1E293B] border-[#334155] text-white' 
            : 'bg-slate-50 border-slate-200 text-slate-900'
        }`}
      >
        <option value="All">All Priority</option>
        <option value="Critical">Critical</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isDarkMode 
              ? 'bg-[#1E293B] border-[#334155] text-white' 
              : 'bg-slate-50 border-slate-200 text-slate-900'
          }`}
        >
          <Filter size={16} />
          <span>Assignees</span>
          {filterAssigneeNames.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
            }`}>
              {filterAssigneeNames.length}
            </span>
          )}
          <ChevronDown size={14} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isDropdownOpen && (
          <div className={`absolute top-full left-0 mt-2 w-72 rounded-lg shadow-lg z-50 ${
            isDarkMode ? 'bg-[#1E293B] border border-[#334155]' : 'bg-white border border-slate-200'
          }`}>
            {/* Search input */}
            <div className="p-3 border-b border-slate-200 dark:border-[#334155]">
              <div className="relative">
                <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder="Search assignees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2 text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode 
                      ? 'bg-[#0F141F] border border-[#334155] text-white placeholder-slate-500' 
                      : 'bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
            </div>

            {/* Assignee list */}
            <div className="max-h-60 overflow-y-auto p-2">
              {filteredUsers.length === 0 ? (
                <div className={`text-center py-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No assignees found
                </div>
              ) : (
                filteredUsers.map(user => (
                  <label
                    key={user.UserID}
                    className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-[#334155]/50 transition-colors ${
                      isDarkMode ? 'text-white' : 'text-slate-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={filterAssigneeNames.includes(user.Email)}
                      onChange={() => toggleAssignee(user.Email)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-sm">{user.FullName}</span>
                  </label>
                ))
              )}
            </div>

            {/* Clear all button */}
            {filterAssigneeNames.length > 0 && (
              <div className="p-2 border-t border-slate-200 dark:border-[#334155]">
                <button
                  onClick={clearAll}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    isDarkMode 
                      ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50' 
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <X size={14} />
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
