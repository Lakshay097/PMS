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
  taskSubView?: 'my-tasks' | 'team-tasks' | 'assigned-by-me';
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
  return (
    <div className="border rounded-xl overflow-hidden bg-surface border-token">
      <div className="divide-y divide-[var(--color-border)]">
        {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
        {tasks.map((task) => {
          return (
            <div
              key={task.TaskID}
              onClick={(e) => { e.preventDefault(); onTaskClick(task); }}
              className="p-4 sm:p-6 transition-colors cursor-pointer hover-surface"
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
                  </div>
                  <h4 className={`font-medium text-sm sm:text-base mb-2 line-clamp-2 ${isDarkMode ? 'text-white' : 'text-primary'}`}>{task.Title}</h4>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[10px] sm:text-xs text-secondary">
                    <span>Due: {task.DueDate}</span>
                    <span>Assigned to: {task.AssignedToEmail.split(',').map(email => email.trim().split('@')[0]).join(', ')}</span>
                  </div>
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
                      className="p-1.5 sm:p-2 rounded-lg transition-colors hover-surface text-red-500 hover:text-red-600"
                      title="Delete task"
                    >
                      <Trash2 size={14} className="sm:size-4" />
                    </button>
                  )}
                  <div className="text-right">
                    <p className={`text-[10px] sm:text-xs font-mono text-secondary`}>{task.TaskID}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {tasks.length === 0 && (
          <div className={`p-8 sm:p-12 text-center text-secondary`}>
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
