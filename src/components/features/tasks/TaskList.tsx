import React, { useState } from 'react';
import { Trash2, Search } from 'lucide-react';
import { Task, User as UserType } from '../../../types';
import { ROLE, isAdminLevel } from '../../../constants/status';

interface TaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  isDarkMode: boolean;
  getPriorityColor: (priority: string) => string;
  getStatusColor: (status: string) => string;
  emptyMessage?: string;
  currentUser?: UserType;
  taskSubView?: 'my-tasks' | 'team-tasks';
  onDeleteTask?: (taskId: string) => void;
}

export default function TaskList({
  tasks,
  onTaskClick,
  isDarkMode,
  getPriorityColor,
  getStatusColor,
  emptyMessage = 'No tasks found',
  currentUser,
  taskSubView = 'my-tasks',
  onDeleteTask,
}: TaskListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTasks = tasks.filter(task => {
    const searchLower = searchQuery.toLowerCase();
    return (
      task.Title?.toLowerCase().includes(searchLower) ||
      task.TaskID?.toLowerCase().includes(searchLower) ||
      task.AssignedToEmail?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
      {/* Search bar */}
      <div className={`p-3 sm:p-4 border-b border-[#E5E7EB] ${isDarkMode ? 'border-[#1E293B]' : ''}`}>
        <div className="relative">
          <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} />
          <input
            type="text"
            placeholder="Search by title, ID, or assignee..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-8 sm:pl-9 pr-3 sm:pr-4 py-2 text-xs sm:text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isDarkMode 
                ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' 
                : 'bg-slate-50 border-[#E5E7EB] text-slate-800 placeholder-slate-400'
            }`}
          />
        </div>
      </div>
      <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
        {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
        {filteredTasks.map((task) => {
          const taskIsSubStakeholder = currentUser && currentUser.Role === 'Stakeholder' && taskSubView === 'team-tasks' && 
            !task.AssignedToEmail?.toLowerCase().includes(currentUser.Email.toLowerCase()) &&
            !task.AssignedByEmail?.toLowerCase().includes(currentUser.Email.toLowerCase());
          
          return (
            <div
              key={task.TaskID}
              onClick={(e) => { e.preventDefault(); !taskIsSubStakeholder && onTaskClick(task); }}
              className={`p-4 sm:p-6 transition-colors ${!taskIsSubStakeholder ? 'cursor-pointer' : 'cursor-default'} ${isDarkMode ? 'hover:bg-[#1E293B]/30' : 'hover:bg-slate-50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                    <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border ${getPriorityColor(task.Priority)}`}>
                      {task.Priority}
                    </span>
                    <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border ${getStatusColor(task.Status)}`}>
                      {task.Status}
                    </span>
                    {taskIsSubStakeholder && (
                      <span className="text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">
                        Sub-stakeholder Task
                      </span>
                    )}
                  </div>
                  {!taskIsSubStakeholder ? (
                    <>
                      <h4 className={`font-medium text-sm sm:text-base mb-2 line-clamp-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{task.Title}</h4>
                      <div className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span>Due: {task.DueDate}</span>
                        <span>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <h4 className={`font-medium text-sm sm:text-base mb-2 line-clamp-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{task.Title}</h4>
                      <div className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                        <span>Due: {task.DueDate}</span>
                        <span>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                        <span className="text-[10px] italic">(Status only view)</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                  {isAdminLevel(currentUser?.Role) && onDeleteTask && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Are you sure you want to delete task ${task.TaskID}?`)) {
                          onDeleteTask(task.TaskID);
                        }
                      }}
                      className={`p-1.5 sm:p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-red-400 hover:text-red-300' : 'hover:bg-red-50 text-red-500 hover:text-red-600'}`}
                      title="Delete task"
                    >
                      <Trash2 size={14} className="sm:size-4" />
                    </button>
                  )}
                  <div className="text-right">
                    <p className={`text-[10px] sm:text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{task.TaskID}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filteredTasks.length === 0 && (
          <div className={`p-8 sm:p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {searchQuery ? 'No tasks match your search' : emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
