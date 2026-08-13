import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Filter, X, ChevronDown, Search, Calendar } from 'lucide-react';
import { User as UserType } from '../../../types';
import { ROLE, isAdminLevel } from '../../../constants/status';
import { getAllSubordinates } from '../../../utils/userUtils';
import MultiselectDropdown from '../../../components/shared/MultiselectDropdown';

interface TaskFiltersProps {
  filterStatus: string[];
  filterPriority: string[];
  filterAssigneeNames: string[];
  filterDateFrom: string;
  filterDateTo: string;
  filterAssignedByEmails: string[];
  searchQuery: string;
  currentUser?: UserType;
  users: UserType[];
  isDarkMode: boolean;
  onFilterStatusChange: (value: string[]) => void;
  onFilterPriorityChange: (value: string[]) => void;
  onFilterAssigneeNamesChange: (value: string[]) => void;
  onFilterDateFromChange: (value: string) => void;
  onFilterDateToChange: (value: string) => void;
  onFilterAssignedByEmailsChange: (value: string[]) => void;
  onSearchQueryChange: (value: string) => void;
}

export default function TaskFilters({
  filterStatus,
  filterPriority,
  filterAssigneeNames,
  filterDateFrom,
  filterDateTo,
  filterAssignedByEmails,
  searchQuery,
  currentUser,
  users,
  isDarkMode,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterAssigneeNamesChange,
  onFilterDateFromChange,
  onFilterDateToChange,
  onFilterAssignedByEmailsChange,
  onSearchQueryChange,
}: TaskFiltersProps) {
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const [isAssignedByDropdownOpen, setIsAssignedByDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
  const [assignedBySearchQuery, setAssignedBySearchQuery] = useState('');
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);
  const assignedByDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(event.target as Node)) {
        setIsAssigneeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (assignedByDropdownRef.current && !assignedByDropdownRef.current.contains(event.target as Node)) {
        setIsAssignedByDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getFilteredUsers = () => {
    let filteredUsers;
    if (!currentUser) {
      filteredUsers = users.filter(u => u.Active);
    } else if (isAdminLevel(currentUser.Role)) {
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

    if (assigneeSearchQuery) {
      filteredUsers = filteredUsers.filter(u =>
        u.FullName.toLowerCase().includes(assigneeSearchQuery.toLowerCase()) ||
        u.Email.toLowerCase().includes(assigneeSearchQuery.toLowerCase())
      );
    }

    return filteredUsers;
  };

  const filteredUsers = getFilteredUsers();

  // Memoize computed values to avoid re-renders
  const allStatuses = useMemo(() => ['In Progress', 'Submitted', 'Closed', 'Overdue', 'On Hold', 'Dropped', 'Not Started'], []);
  const isAllStatusesSelected = useMemo(() => allStatuses.every(s => filterStatus.includes(s)), [filterStatus, allStatuses]);
  const hasStatusFilter = useMemo(() => filterStatus.length > 0 && !isAllStatusesSelected, [filterStatus.length, isAllStatusesSelected]);

  const toggleAssignee = (email: string) => {
    if (filterAssigneeNames.includes(email)) {
      onFilterAssigneeNamesChange(filterAssigneeNames.filter(e => e !== email));
    } else {
      onFilterAssigneeNamesChange([...filterAssigneeNames, email]);
    }
  };

  const getAssignedByUsers = () => {
    let eligibleUsers: UserType[];
    if (!currentUser) {
      eligibleUsers = users.filter(u => u.Active);
    } else if (isAdminLevel(currentUser.Role)) {
      // Admins see everyone
      eligibleUsers = users.filter(u => u.Active);
    } else if (currentUser.Role === ROLE.STAKEHOLDER) {
      // Stakeholders can be assigned tasks by admin-level users or by themselves.
      // Show all active admin-level users plus the stakeholder themselves.
      eligibleUsers = users.filter(u =>
        u.Active && (
          isAdminLevel(u.Role) ||
          u.Email.toLowerCase() === currentUser.Email.toLowerCase()
        )
      );
    } else {
      eligibleUsers = users.filter(u => u.Active);
    }

    if (assignedBySearchQuery) {
      eligibleUsers = eligibleUsers.filter(u =>
        u.FullName.toLowerCase().includes(assignedBySearchQuery.toLowerCase()) ||
        u.Email.toLowerCase().includes(assignedBySearchQuery.toLowerCase())
      );
    }

    return eligibleUsers;
  };

  const assignedByUsers = getAssignedByUsers();

  const toggleAssignedBy = (email: string) => {
    if (filterAssignedByEmails.includes(email)) {
      onFilterAssignedByEmailsChange(filterAssignedByEmails.filter(e => e !== email));
    } else {
      onFilterAssignedByEmailsChange([...filterAssignedByEmails, email]);
    }
  };

  const clearAll = () => {
    onFilterStatusChange(allStatuses);
    onFilterPriorityChange([]);
    onFilterAssigneeNamesChange([]);
    onFilterDateFromChange('');
    onFilterDateToChange('');
    onFilterAssignedByEmailsChange([]);
    onSearchQueryChange('');
    setAssigneeSearchQuery('');
    setAssignedBySearchQuery('');
  };

  const toggleStatus = (status: string) => {
    if (status === 'All') {
      // When "All" is clicked: if all are selected, deselect all; otherwise select all
      if (isAllStatusesSelected) {
        onFilterStatusChange([]);
      } else {
        onFilterStatusChange(allStatuses);
      }
    } else {
      // Toggle individual status
      if (filterStatus.includes(status)) {
        const newStatuses = filterStatus.filter(s => s !== status);
        onFilterStatusChange(newStatuses);
      } else {
        onFilterStatusChange([...filterStatus, status]);
      }
    }
  };

  const hasActiveFilters = useMemo(() => {
    return hasStatusFilter ||
      filterAssigneeNames.length > 0 ||
      filterAssignedByEmails.length > 0 ||
      !!filterDateFrom ||
      !!filterDateTo ||
      filterPriority.length > 0;
  }, [hasStatusFilter, filterAssigneeNames.length, filterAssignedByEmails.length, filterDateFrom, filterDateTo, filterPriority.length]);

  // Shared class helpers
  const inputBase = isDarkMode
    ? 'bg-[#1E293B] border-[#334155] text-white'
    : 'bg-slate-50 border-slate-200 text-slate-900';

  const dropdownPanel = isDarkMode
    ? 'bg-[#1E293B] border border-[#334155]'
    : 'bg-white border border-[#E5E7EB]';

  const dropdownItem = isDarkMode
    ? 'text-slate-200 hover:bg-[#334155]/60'
    : 'text-slate-800 hover:bg-slate-100';

  const dividerBorder = isDarkMode ? 'border-[#334155]' : 'border-[#E5E7EB]';

  const clearBtn = isDarkMode
    ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50'
    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100';

  return (
    <div className={`border rounded-xl p-3 sm:p-4 flex flex-wrap gap-2 sm:gap-4 items-center ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
      <div className={`flex items-center space-x-1.5 sm:space-x-2 text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
        <Filter size={14} className="sm:size-4" />
        <span className="hidden sm:inline">Filters:</span>
        <span className="sm:hidden">Filter</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className={`absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 sm:size-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className={`pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBase} placeholder:${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}
        />
      </div>

      {/* Status */}
      <div className="relative" ref={statusDropdownRef}>
        <button
          onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
          className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBase}`}
        >
          <Filter size={14} className="sm:size-4" />
          <span className="hidden sm:inline">Status</span>
          {hasStatusFilter && (
            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
              isDarkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'
            }`}>
              {filterStatus.length}
            </span>
          )}
          <ChevronDown size={12} className={`transition-transform sm:size-3.5 ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isStatusDropdownOpen && (
          <div className={`absolute top-full left-0 mt-2 w-48 sm:w-56 rounded-lg shadow-lg z-50 ${dropdownPanel}`}>
            <div className="max-h-60 overflow-y-auto p-2">
              {['All', ...allStatuses].map(status => {
                const isIndeterminate = filterStatus.length > 0 && !isAllStatusesSelected;
                
                return (
                  <label
                    key={status}
                    className={`flex items-center gap-2 sm:gap-3 p-2 rounded-md cursor-pointer transition-colors ${dropdownItem}`}
                  >
                    <input
                      type="checkbox"
                      ref={input => {
                        if (input && status === 'All') {
                          input.indeterminate = isIndeterminate;
                        }
                      }}
                      checked={status === 'All' ? isAllStatusesSelected : filterStatus.includes(status)}
                      onChange={() => toggleStatus(status)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-xs sm:text-sm">{status}</span>
                  </label>
                );
              })}
            </div>

            <div className={`p-2 border-t ${dividerBorder}`}>
              <button
                onClick={() => onFilterStatusChange(allStatuses)}
                className={`w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md transition-colors ${clearBtn}`}
              >
                <X size={12} className="sm:size-3.5" />
                Select all
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Priority */}
      <MultiselectDropdown
        label="Priority"
        options={[
          { value: 'Critical', label: 'Critical' },
          { value: 'High', label: 'High' },
          { value: 'Medium', label: 'Medium' },
          { value: 'Low', label: 'Low' }
        ]}
        selectedValues={filterPriority}
        onSelectionChange={onFilterPriorityChange}
        isDarkMode={isDarkMode}
        badgeColor="orange"
      />

      {/* Assignees */}
      <div className="relative" ref={assigneeDropdownRef}>
        <button
          onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
          className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBase}`}
        >
          <Filter size={14} className="sm:size-4" />
          <span className="hidden sm:inline">Assignees</span>
          <span className="sm:hidden">Users</span>
          {filterAssigneeNames.length > 0 && (
            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
              isDarkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
            }`}>
              {filterAssigneeNames.length}
            </span>
          )}
          <ChevronDown size={12} className={`transition-transform sm:size-3.5 ${isAssigneeDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isAssigneeDropdownOpen && (
          <div className={`absolute top-full left-0 mt-2 w-64 sm:w-72 rounded-lg shadow-lg z-50 ${dropdownPanel}`}>
            <div className={`p-2 sm:p-3 border-b ${dividerBorder}`}>
              <div className="relative">
                <Search size={12} className={`absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 sm:size-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder="Search assignees..."
                  value={assigneeSearchQuery}
                  onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                  className={`w-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? 'bg-[#0F141F] border-[#334155] text-white placeholder:text-slate-500'
                      : 'bg-slate-50 border-[#E5E7EB] text-slate-900 placeholder:text-slate-400'
                  }`}
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto p-2">
              {filteredUsers.length === 0 ? (
                <div className={`text-center py-3 sm:py-4 text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No assignees found
                </div>
              ) : (
                filteredUsers.map(user => (
                  <label
                    key={user.UserID}
                    className={`flex items-center gap-2 sm:gap-3 p-2 rounded-md cursor-pointer transition-colors ${dropdownItem}`}
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

            {filterAssigneeNames.length > 0 && (
              <div className={`p-2 border-t ${dividerBorder}`}>
                <button
                  onClick={() => { onFilterAssigneeNamesChange([]); setAssigneeSearchQuery(''); }}
                  className={`w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md transition-colors ${clearBtn}`}
                >
                  <X size={12} className="sm:size-3.5" />
                  Clear assignees
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Assigned By */}
      <div className="relative" ref={assignedByDropdownRef}>
        <button
          onClick={() => setIsAssignedByDropdownOpen(!isAssignedByDropdownOpen)}
          className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputBase}`}
        >
          <Filter size={14} className="sm:size-4" />
          <span className="hidden sm:inline">Assigned By</span>
          <span className="sm:hidden">By</span>
          {filterAssignedByEmails.length > 0 && (
            <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
              isDarkMode ? 'bg-orange-500/20 text-orange-300' : 'bg-orange-100 text-orange-700'
            }`}>
              {filterAssignedByEmails.length}
            </span>
          )}
          <ChevronDown size={12} className={`transition-transform sm:size-3.5 ${isAssignedByDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {isAssignedByDropdownOpen && (
          <div className={`absolute top-full left-0 mt-2 w-64 sm:w-72 rounded-lg shadow-lg z-50 ${dropdownPanel}`}>
            <div className={`p-2 sm:p-3 border-b ${dividerBorder}`}>
              <div className="relative">
                <Search size={12} className={`absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 sm:size-3.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                <input
                  type="text"
                  placeholder="Search assigners..."
                  value={assignedBySearchQuery}
                  onChange={(e) => setAssignedBySearchQuery(e.target.value)}
                  className={`w-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? 'bg-[#0F141F] border-[#334155] text-white placeholder:text-slate-500'
                      : 'bg-slate-50 border-[#E5E7EB] text-slate-900 placeholder:text-slate-400'
                  }`}
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto p-2">
              {assignedByUsers.length === 0 ? (
                <div className={`text-center py-3 sm:py-4 text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  No users found
                </div>
              ) : (
                assignedByUsers.map(user => (
                  <label
                    key={user.UserID}
                    className={`flex items-center gap-2 sm:gap-3 p-2 rounded-md cursor-pointer transition-colors ${dropdownItem}`}
                  >
                    <input
                      type="checkbox"
                      checked={filterAssignedByEmails.includes(user.Email)}
                      onChange={() => toggleAssignedBy(user.Email)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="flex-1 text-xs sm:text-sm">{user.FullName}</span>
                  </label>
                ))
              )}
            </div>

            {filterAssignedByEmails.length > 0 && (
              <div className={`p-2 border-t ${dividerBorder}`}>
                <button
                  onClick={() => { onFilterAssignedByEmailsChange([]); setAssignedBySearchQuery(''); }}
                  className={`w-full flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-md transition-colors ${clearBtn}`}
                >
                  <X size={12} className="sm:size-3.5" />
                  Clear assigned by
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Due Date Filter */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className={`text-xs sm:text-sm font-medium flex items-center gap-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
          <Calendar size={14} className="sm:size-4" />
          <span className="hidden sm:inline">Due Date:</span>
        </span>
        <div className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${
          isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'
        }`}>
          <label className={`text-[10px] sm:text-xs font-medium shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>From</label>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => onFilterDateFromChange(e.target.value)}
            className={`bg-transparent focus:outline-none text-xs sm:text-sm w-[120px] sm:w-[130px] ${
              isDarkMode ? 'text-slate-100 [color-scheme:dark]' : 'text-slate-900 [color-scheme:light]'
            }`}
          />
        </div>
        <span className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>—</span>
        <div className={`flex items-center gap-1.5 sm:gap-2 border rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${
          isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'
        }`}>
          <label className={`text-[10px] sm:text-xs font-medium shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>To</label>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => onFilterDateToChange(e.target.value)}
            className={`bg-transparent focus:outline-none text-xs sm:text-sm w-[120px] sm:w-[130px] ${
              isDarkMode ? 'text-slate-100 [color-scheme:dark]' : 'text-slate-900 [color-scheme:light]'
            }`}
          />
        </div>
        {(filterDateFrom || filterDateTo) && (
          <button
            onClick={() => { onFilterDateFromChange(''); onFilterDateToChange(''); }}
            className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            title="Clear due date filter"
          >
            <X size={12} className="sm:size-3.5" />
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <button
          onClick={clearAll}
          className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg transition-colors ${clearBtn}`}
          title="Clear all filters"
        >
          <X size={12} className="sm:size-3.5" />
          Clear filters
        </button>
      )}
    </div>
  );
}
