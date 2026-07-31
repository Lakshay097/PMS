import React, { useState, useMemo } from 'react';
import { Task, User as UserType, Team, SubTeam, AppSetting } from '../types';
import TaskList from '../components/features/tasks/TaskList';
import TaskFilters from '../components/features/tasks/TaskFilters';
import { getUserRoles, getTeamTasksScope, splitEmails, shouldShowTeamTasksTab, shouldShowAssignedByMeTab } from '../utils/roleUtils';
import { Plus } from 'lucide-react';

interface TasksPageProps {
  tasks: Task[];
  filters: {
    status: string[];
    priority: string;
    assignee: string;
    searchQuery: string;
  };
  currentUser: UserType;
  users: UserType[];
  teams: Team[];
  subTeams: SubTeam[];
  settings: AppSetting[];
  isDarkMode: boolean;
  onFilterChange: (filterType: 'status' | 'priority' | 'assignee' | 'searchQuery', value: string | string[]) => void;
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
  teams,
  subTeams,
  settings,
  isDarkMode,
  onFilterChange,
  onTaskClick,
  onNewTask,
  getPriorityColor,
  getStatusColor,
}: TasksPageProps) {
  const [taskSubView, setTaskSubView] = useState<'my-tasks' | 'team-tasks' | 'assigned-by-me'>('my-tasks');

  // Compute user roles once per render
  const userRoles = useMemo(() => {
    return getUserRoles(currentUser, teams || [], subTeams || [], settings || []);
  }, [currentUser, teams, subTeams, settings]);

  // Filter tasks based on selected tab
  const filteredTasks = useMemo(() => {
    if (!currentUser) return [];

    const userEmail = currentUser.Email?.toLowerCase() || '';

    // Get the Team Tasks scope filter function based on user roles
    const teamTasksFilter = getTeamTasksScope(currentUser, userRoles, users || []);

    const roleFiltered = (tasks || []).filter(task => {
      // Apply view-based filtering using the role-based approach
      if (taskSubView === 'my-tasks') {
        return splitEmails(task.AssignedToEmail).some(email =>
          email.toLowerCase() === userEmail
        );
      }

      if (taskSubView === 'assigned-by-me') {
        return task.AssignedByEmail?.toLowerCase() === userEmail;
      }

      if (taskSubView === 'team-tasks') {
        return teamTasksFilter(task);
      }

      // Default: return union of all visible tasks
      const assignedToMe = splitEmails(task.AssignedToEmail).some(email =>
        email.toLowerCase() === userEmail
      );
      const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
      const inTeamScope = teamTasksFilter(task);

      return assignedToMe || assignedByMe || inTeamScope;
    });

    return roleFiltered;
  }, [tasks, currentUser, users, taskSubView, userRoles]);

  return (
    <div className="space-y-6">
      {/* Task View Tabs */}
      <div className="sticky top-0 z-10 border rounded-xl p-4 bg-surface border-token">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
            onClick={() => setTaskSubView('my-tasks')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${taskSubView === 'my-tasks'
                ? 'bg-blue-500 text-white'
                : isDarkMode
                  ? 'bg-[#1E293B] text-secondary hover:text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
          >
            My Tasks
          </button>
          {shouldShowTeamTasksTab(userRoles) && (
            <button
              onClick={() => setTaskSubView('team-tasks')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${taskSubView === 'team-tasks'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                    ? 'bg-[#1E293B] text-secondary hover:text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              Team Tasks
            </button>
          )}
          {shouldShowAssignedByMeTab(userRoles) && (
            <button
              onClick={() => setTaskSubView('assigned-by-me')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${taskSubView === 'assigned-by-me'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                    ? 'bg-[#1E293B] text-secondary hover:text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              Assigned by Me
            </button>
          )}
        </div>
      </div>

      <TaskFilters
        filterStatus={filters.status}
        filterPriority={filters.priority}
        filterAssigneeNames={filters.assignee ? [filters.assignee] : []}
        filterTeamIDs={[]}
        filterDateFrom=""
        filterDateTo=""
        searchQuery={filters.searchQuery || ''}
        currentUser={currentUser}
        users={users}
        teams={teams}
        isDarkMode={isDarkMode}
        onFilterStatusChange={(value) => onFilterChange('status', value)}
        onFilterPriorityChange={(value) => onFilterChange('priority', value)}
        onFilterAssigneeNamesChange={(value) => onFilterChange('assignee', value.join(','))}
        onFilterTeamIDsChange={() => {}}
        onFilterDateFromChange={() => {}}
        onFilterDateToChange={() => {}}
        onSearchQueryChange={(value) => onFilterChange('searchQuery', value)}
      />
      <TaskList
        tasks={filteredTasks}
        onTaskClick={onTaskClick}
        isDarkMode={isDarkMode}
        getPriorityColor={getPriorityColor}
        getStatusColor={getStatusColor}
        currentUser={currentUser}
        taskSubView={taskSubView}
      />
    </div>
  );
}
