import React from 'react';
import { Filter } from 'lucide-react';
import { User as UserType } from '../../../types';

interface TaskFiltersProps {
  filterStatus: string;
  filterPriority: string;
  filterAssignee: string;
  currentUser: UserType;
  users: UserType[];
  isDarkMode: boolean;
  onFilterStatusChange: (value: string) => void;
  onFilterPriorityChange: (value: string) => void;
  onFilterAssigneeChange: (value: string) => void;
}

export default function TaskFilters({
  filterStatus,
  filterPriority,
  filterAssignee,
  currentUser,
  users,
  isDarkMode,
  onFilterStatusChange,
  onFilterPriorityChange,
  onFilterAssigneeChange,
}: TaskFiltersProps) {
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
      {currentUser.Role === 'Admin' && (
        <select
          value={filterAssignee}
          onChange={(e) => onFilterAssigneeChange(e.target.value)}
          className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            isDarkMode 
              ? 'bg-[#1E293B] border-[#334155] text-white' 
              : 'bg-slate-50 border-slate-200 text-slate-900'
          }`}
        >
          <option value="All">All Assignees</option>
          {users.filter(u => u.Active).map(user => (
            <option key={user.UserID} value={user.Email}>{user.FullName}</option>
          ))}
        </select>
      )}
    </div>
  );
}
