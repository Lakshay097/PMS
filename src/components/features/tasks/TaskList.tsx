import React, { useState, useMemo } from 'react';
import { Trash2, Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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

type SortOrder = 'asc' | 'desc';

function formatAssignedDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDate = a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0;
      const bDate = b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0;
      return sortOrder === 'desc' ? bDate - aDate : aDate - bDate;
    });
  }, [tasks, sortOrder]);

  const toggleSort = () => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));

  return (
    <div className="border rounded-xl overflow-hidden bg-surface border-token">
      {/* Sort header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-2 sm:py-3 border-b border-[var(--color-border)] bg-surface">
        <span className="text-[10px] sm:text-xs text-secondary">
          {sortedTasks.length} task{sortedTasks.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={toggleSort}
          className="flex items-center gap-1 text-[10px] sm:text-xs text-secondary hover:text-primary transition-colors"
          title="Sort by assigned date"
        >
          {sortOrder === 'desc' ? (
            <ArrowDown size={12} className="shrink-0" />
          ) : (
            <ArrowUp size={12} className="shrink-0" />
          )}
          <span>Assigned Date</span>
          <ArrowUpDown size={11} className="shrink-0 opacity-50" />
        </button>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
        {sortedTasks.map((task) => {
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
                    <span>Assigned by: {task.AssignedByEmail ? task.AssignedByEmail.split('@')[0] : '—'}</span>
                    <span>When assigned: {formatAssignedDate(task.CreatedAt)}</span>
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
        {sortedTasks.length === 0 && (
          <div className={`p-8 sm:p-12 text-center text-secondary`}>
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
