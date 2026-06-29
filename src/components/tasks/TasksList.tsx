import React, { useState, useMemo } from 'react';
import StatusBadge from '../shared/StatusBadge';
import PriorityBadge from '../shared/PriorityBadge';
import FilterChip from '../shared/FilterChip';
import BulkActionBar from '../shared/BulkActionBar';
import { useRowSelection } from '../../hooks/useRowSelection';
import { Plus, MoreVertical, Search, Filter as FilterIcon, X, CheckSquare, Trash2, Download } from 'lucide-react';
import { Task, TaskStatus } from '../../types';

interface TasksListProps {
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
  onCreateTask?: () => void;
  currentUserId?: string;
  onDeleteTask?: (taskId: string) => void;
  onUpdateTaskStatus?: (taskId: string, status: TaskStatus) => void;
}

type SavedView = 'all' | 'assigned-to-me' | 'assigned-by-me' | 'overdue' | 'due-today' | 'active' | 'history';

export default function TasksList({ tasks, onTaskClick, onCreateTask, currentUserId, onDeleteTask, onUpdateTaskStatus }: TasksListProps) {
  const [savedView, setSavedView] = useState<SavedView>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<'Low' | 'Medium' | 'High' | 'Critical' | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Filter tasks based on saved view and filters
  // useMemo: tasks list can be large, filter is O(n)
  const filteredTasks = useMemo(() => tasks.filter(task => {
    // Saved view filter
    if (savedView === 'assigned-to-me' && task.AssignedToEmail !== currentUserId) return false;
    if (savedView === 'assigned-by-me' && task.AssignedByEmail !== currentUserId) return false;
    if (savedView === 'overdue' && task.Status !== 'Overdue') return false;
    if (savedView === 'due-today') {
      const today = new Date().toISOString().split('T')[0];
      if (task.DueDate !== today) return false;
    }
    if (savedView === 'active' && (task.Status === 'Closed' || task.Status === 'Not Started')) return false;
    if (savedView === 'history' && task.Status !== 'Closed') return false;

    // Search filter
    if (searchQuery && !task.Title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

    // Status filter
    if (statusFilter !== 'all' && task.Status !== statusFilter) return false;

    // Priority filter
    if (priorityFilter !== 'all' && task.Priority !== priorityFilter) return false;

    return true;
  }), [tasks, savedView, currentUserId, searchQuery, statusFilter, priorityFilter]);

  const clearFilters = () => {
    setStatusFilter('all');
    setPriorityFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters = statusFilter !== 'all' || priorityFilter !== 'all' || searchQuery !== '';

  // Row selection hook
  const {
    selectedIds,
    selectedCount,
    allSelected,
    someSelected,
    toggleSelection,
    toggleSelectAll,
    clearSelection,
    isSelected,
  } = useRowSelection<Task>({
    items: filteredTasks,
    getItemId: (task) => task.TaskID,
  });

  // Bulk action handlers
  const handleBulkDelete = () => {
    selectedIds.forEach(taskId => {
      onDeleteTask?.(taskId as string);
    });
    clearSelection();
  };

  const handleBulkMarkComplete = () => {
    selectedIds.forEach(taskId => {
      onUpdateTaskStatus?.(taskId as string, 'Closed');
    });
    clearSelection();
  };

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#0f172a]">Tasks</h1>
          <p className="text-sm text-muted mt-1">
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''} {savedView !== 'all' && `• ${savedView.replace('-', ' ')}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
          >
            <FilterIcon size={16} />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="w-2 h-2 bg-[var(--color-accent)] rounded-full" />
            )}
          </button>
          {onCreateTask && (
            <button
              onClick={onCreateTask}
              className="flex items-center gap-2 px-3 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              <Plus size={16} />
              <span>Create task</span>
            </button>
          )}
        </div>
      </div>

      {/* Saved Views Row */}
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label="All visible"
          active={savedView === 'all'}
          onClick={() => setSavedView('all')}
        />
        <FilterChip
          label="Assigned to me"
          active={savedView === 'assigned-to-me'}
          onClick={() => setSavedView('assigned-to-me')}
        />
        <FilterChip
          label="Assigned by me"
          active={savedView === 'assigned-by-me'}
          onClick={() => setSavedView('assigned-by-me')}
        />
        <FilterChip
          label="Overdue"
          active={savedView === 'overdue'}
          onClick={() => setSavedView('overdue')}
        />
        <FilterChip
          label="Due today"
          active={savedView === 'due-today'}
          onClick={() => setSavedView('due-today')}
        />
        <FilterChip
          label="Active"
          active={savedView === 'active'}
          onClick={() => setSavedView('active')}
        />
        <FilterChip
          label="History / archive"
          active={savedView === 'history'}
          onClick={() => setSavedView('history')}
        />
      </div>

      {/* Filter Row */}
      {showFilters && (
        <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4 space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </div>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            >
              <option value="all">All statuses</option>
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Submitted">Submitted</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Closed">Closed</option>
              <option value="Overdue">Overdue</option>
            </select>

            {/* Priority filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className="px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            >
              <option value="all">All priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-muted hover:text-[#0f172a] transition-colors"
              >
                <X size={14} />
                <span>Clear filters</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Data Region - Task Table */}
      <div className="bg-surface rounded-lg border border-[var(--color-border)] overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted">No tasks found matching your filters</p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-2 text-sm text-[var(--color-accent)] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={input => {
                        if (input) input.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted">
                    Assignee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted">
                    Due date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted">
                    Last update
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
                {filteredTasks.map((task) => (
                  <tr
                    key={task.TaskID}
                    onClick={() => onTaskClick?.(task.TaskID)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected(task.TaskID)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleSelection(task.TaskID);
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-[#0f172a]">{task.Title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={task.Status} size="sm" />
                    </td>
                    <td className="px-6 py-4">
                      <PriorityBadge priority={task.Priority} size="sm" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[#0f172a]">{task.AssignedToEmail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[#0f172a]">
                        {new Date(task.DueDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-muted">
                        {new Date(task.UpdatedAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick?.(task.TaskID);
                        }}
                        className="p-1 hover:bg-gray-200 rounded transition-colors"
                      >
                        <MoreVertical size={16} className="text-muted" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedCount}
        actions={[
          {
            label: 'Delete',
            icon: <Trash2 size={16} />,
            onClick: handleBulkDelete,
            variant: 'danger',
          },
          {
            label: 'Mark Complete',
            icon: <CheckSquare size={16} />,
            onClick: handleBulkMarkComplete,
            variant: 'primary',
          },
        ]}
        onClear={clearSelection}
      />
    </div>
  );
}
