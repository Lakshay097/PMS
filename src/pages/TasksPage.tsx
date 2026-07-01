import React from 'react';
import { Task, User as UserType } from '../types';
import TaskList from '../components/features/tasks/TaskList';
import TaskFilters from '../components/features/tasks/TaskFilters';

interface TasksPageProps {
  tasks: Task[];
  filters: {
    status: string;
    priority: string;
    assignee: string;
  };
  currentUser: UserType;
  users: UserType[];
  isDarkMode: boolean;
  onFilterChange: (filterType: 'status' | 'priority' | 'assignee', value: string) => void;
  onTaskClick: (task: Task) => void;
  onNewTask: () => void;
  getPriorityColor: (priority: string) => string;
  getStatusColor: (status: string) => string;
}

export default function TasksPage({
  tasks,
  filters,
  currentUser,
  users,
  isDarkMode,
  onFilterChange,
  onTaskClick,
  onNewTask,
  getPriorityColor,
  getStatusColor,
}: TasksPageProps) {
  return (
    <div className="space-y-6">
      <TaskFilters
        filterStatus={filters.status}
        filterPriority={filters.priority}
        filterAssigneeNames={filters.assignee ? [filters.assignee] : []}
        filterTeamIDs={[]}
        filterDateFrom=""
        filterDateTo=""
        currentUser={currentUser}
        users={users}
        teams={[]}
        isDarkMode={isDarkMode}
        onFilterStatusChange={(value) => onFilterChange('status', value)}
        onFilterPriorityChange={(value) => onFilterChange('priority', value)}
        onFilterAssigneeNamesChange={(value) => onFilterChange('assignee', value.join(','))}
        onFilterTeamIDsChange={() => {}}
        onFilterDateFromChange={() => {}}
        onFilterDateToChange={() => {}}
      />
      <TaskList
        tasks={tasks}
        onTaskClick={onTaskClick}
        isDarkMode={isDarkMode}
        getPriorityColor={getPriorityColor}
        getStatusColor={getStatusColor}
      />
    </div>
  );
}
