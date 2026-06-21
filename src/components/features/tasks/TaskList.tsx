import React from 'react';
import { Task } from '../../../types';

interface TaskListProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  isDarkMode: boolean;
  getPriorityColor: (priority: string) => string;
  getStatusColor: (status: string) => string;
  emptyMessage?: string;
}

export default function TaskList({
  tasks,
  onTaskClick,
  isDarkMode,
  getPriorityColor,
  getStatusColor,
  emptyMessage = 'No tasks found',
}: TaskListProps) {
  return (
    <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
      <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
        {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
        {tasks.map((task) => (
          <div
            key={task.TaskID}
            onClick={() => onTaskClick(task)}
            className={`p-6 transition-colors cursor-pointer ${isDarkMode ? 'hover:bg-[#1E293B]/30' : 'hover:bg-slate-50'}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${getPriorityColor(task.Priority)}`}>
                    {task.Priority}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${getStatusColor(task.Status)}`}>
                    {task.Status}
                  </span>
                </div>
                <h4 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{task.Title}</h4>
                <div className={`flex items-center space-x-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  <span>Due: {task.DueDate}</span>
                  <span>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{task.TaskID}</p>
              </div>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{emptyMessage}</div>
        )}
      </div>
    </div>
  );
}
