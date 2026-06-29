import React from 'react';
import KPICard from '../shared/KPICard';
import StatusBadge from '../shared/StatusBadge';
import PriorityBadge from '../shared/PriorityBadge';
import TimelineItem from '../shared/TimelineItem';
import { Clock, AlertCircle, CheckCircle2, Calendar, ArrowRight, User } from 'lucide-react';
import { Task } from '../../types';

interface OverviewDashboardProps {
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
  onViewAllTasks?: () => void;
  onViewChange?: (view: 'overview' | 'tasks' | 'schedules' | 'team' | 'reports' | 'admin' | 'settings') => void;
  onFilterChange?: (filterType: 'status' | 'priority' | 'assignee' | 'dueDate', value: string) => void;
}

export default function OverviewDashboard({ tasks, onTaskClick, onViewAllTasks, onViewChange, onFilterChange }: OverviewDashboardProps) {
  // Calculate KPI metrics
  const activeTasks = tasks.filter(t => t.Status === 'In Progress' || t.Status === 'Submitted').length;
  const overdueTasks = tasks.filter(t => t.Status === 'Overdue').length;
  const today = new Date().toISOString().split('T')[0];
  const dueTodayTasks = tasks.filter(t => {
    return t.DueDate === today && t.Status !== 'Closed';
  }).length;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const completedThisWeek = tasks.filter(t => {
    return t.Status === 'Closed' && new Date(t.CompletionDate || '') > oneWeekAgo;
  }).length;

  // Handle card clicks to navigate with filters
  const handleActiveTasksClick = () => {
    if (onViewChange) onViewChange('tasks');
    if (onFilterChange) onFilterChange('status', 'In Progress,Submitted');
  };

  const handleOverdueClick = () => {
    if (onViewChange) onViewChange('tasks');
    if (onFilterChange) onFilterChange('status', 'Overdue');
  };

  const handleDueTodayClick = () => {
    if (onViewChange) onViewChange('tasks');
    if (onFilterChange) onFilterChange('dueDate', 'today');
  };

  const handleCompletedThisWeekClick = () => {
    if (onViewChange) onViewChange('tasks');
    if (onFilterChange) onFilterChange('status', 'Closed');
  };

  // Get urgent tasks (needs attention)
  const urgentTasks = tasks
    .filter(t => t.Status === 'Overdue' || t.Priority === 'Critical' || t.Priority === 'High')
    .filter(t => t.Status !== 'Closed')
    .slice(0, 6);

  // Recent updates timeline
  const recentUpdates = [
    { title: 'Task completed', timestamp: '2 hours ago', actor: 'John Doe', status: 'success' },
    { title: 'Progress update submitted', timestamp: '4 hours ago', actor: 'Jane Smith', status: 'default' },
    { title: 'New task assigned', timestamp: 'Yesterday', actor: 'Admin', status: 'default' },
    { title: 'ETA changed', timestamp: 'Yesterday', actor: 'John Doe', status: 'warning' },
  ];

  // Upcoming deadlines
  const upcomingDeadlines = tasks
    .filter(t => t.Status !== 'Closed')
    .sort((a, b) => new Date(a.DueDate).getTime() - new Date(b.DueDate).getTime())
    .slice(0, 3);

  return (
    <div className="p-6 space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Active tasks"
          value={activeTasks}
          note="Currently in progress"
          trend={{ value: '+12%', positive: true }}
          onClick={handleActiveTasksClick}
        />
        <KPICard
          label="Overdue"
          value={overdueTasks}
          note="Require immediate attention"
          trend={{ value: '+2', positive: false }}
          onClick={handleOverdueClick}
        />
        <KPICard
          label="Due today"
          value={dueTodayTasks}
          note="Tasks due by end of day"
          onClick={handleDueTodayClick}
        />
        <KPICard
          label="Completed this week"
          value={completedThisWeek}
          note="Tasks closed in last 7 days"
          trend={{ value: '+8%', positive: true }}
          onClick={handleCompletedThisWeekClick}
        />
      </div>

      {/* Main Work Zone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Needs attention */}
        <div className="lg:col-span-2">
          <div className="bg-surface rounded-lg border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0f172a]">Needs attention</h2>
              <span className="text-sm text-muted">{urgentTasks.length} urgent tasks</span>
            </div>
            
            <div className="divide-y divide-[var(--color-border)]">
              {urgentTasks.length === 0 ? (
                <div className="p-8 text-center">
                  <CheckCircle2 size={48} className="text-muted mx-auto mb-3" />
                  <p className="text-sm text-muted">No urgent tasks requiring attention</p>
                </div>
              ) : (
                <>
                  {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
                  {urgentTasks.map((task) => (
                    <div
                      key={task.TaskID}
                      onClick={() => onTaskClick?.(task.TaskID)}
                      className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-medium text-[#0f172a] truncate">{task.Title}</h3>
                            <PriorityBadge priority={task.Priority} size="sm" />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted">
                            <span className="flex items-center gap-1">
                              <Calendar size={12} />
                              {new Date(task.DueDate).toLocaleDateString()}
                            </span>
                            <span className="flex items-center gap-1">
                              <User size={12} />
                              {task.AssignedToEmail}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <StatusBadge status={task.Status} size="sm" />
                          <ArrowRight size={16} className="text-muted" />
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {onViewAllTasks && (
              <div className="px-6 py-3 border-t border-[var(--color-border)]">
                <button
                  onClick={onViewAllTasks}
                  className="text-sm text-[var(--color-accent)] hover:underline font-medium"
                >
                  View all active tasks →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Recent updates and upcoming */}
        <div className="space-y-6">
          {/* Recent updates timeline */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[#0f172a]">Recent updates</h2>
            </div>
            <div className="p-4">
              <div className="space-y-0">
                {recentUpdates.map((update, idx) => (
                  <div key={idx}>
                    <TimelineItem
                      title={update.title}
                      timestamp={update.timestamp}
                      actor={update.actor}
                      status={update.status as any}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Upcoming deadlines */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[#0f172a]">Upcoming deadlines</h2>
            </div>
            <div className="p-4 space-y-3">
              {upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">No upcoming deadlines</p>
              ) : (
                upcomingDeadlines.map((task) => (
                  <div
                    key={task.TaskID}
                    onClick={() => onTaskClick?.(task.TaskID)}
                    className="p-3 bg-gray-50 rounded-md hover:bg-gray-100 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-[#0f172a] truncate">{task.Title}</h4>
                        <div className="flex items-center gap-1 text-xs text-muted mt-1">
                          <Clock size={12} />
                          {new Date(task.DueDate).toLocaleDateString()}
                        </div>
                      </div>
                      <PriorityBadge priority={task.Priority} size="sm" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending approvals (role-based) */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)]">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[#0f172a]">Pending approvals</h2>
            </div>
            <div className="p-4 text-center">
              <AlertCircle size={32} className="text-muted mx-auto mb-2" />
              <p className="text-sm text-muted">No pending approvals</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lower modules - role specific */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* My tasks by status */}
        <div className="bg-surface rounded-lg border border-[var(--color-border)] p-6">
          <h3 className="text-base font-semibold text-[#0f172a] mb-4">My tasks by status</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Not Started</span>
              <span className="text-sm font-medium text-[#0f172a]">3</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">In Progress</span>
              <span className="text-sm font-medium text-[#0f172a]">5</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Submitted</span>
              <span className="text-sm font-medium text-[#0f172a]">2</span>
            </div>
          </div>
        </div>

        {/* Team workload snapshot */}
        <div className="bg-surface rounded-lg border border-[var(--color-border)] p-6">
          <h3 className="text-base font-semibold text-[#0f172a] mb-4">Team workload</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">John Doe</span>
              <span className="text-sm font-medium text-[#0f172a]">8 tasks</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Jane Smith</span>
              <span className="text-sm font-medium text-[#0f172a]">6 tasks</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Bob Johnson</span>
              <span className="text-sm font-medium text-[#0f172a]">4 tasks</span>
            </div>
          </div>
        </div>

        {/* Scheduler health */}
        <div className="bg-surface rounded-lg border border-[var(--color-border)] p-6">
          <h3 className="text-base font-semibold text-[#0f172a] mb-4">Scheduler health</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Active blueprints</span>
              <span className="text-sm font-medium text-[#0f172a]">12</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Next run</span>
              <span className="text-sm font-medium text-[#0f172a]">In 2 hours</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">Failed runs</span>
              <span className="text-sm font-medium text-[#0f172a]">0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
