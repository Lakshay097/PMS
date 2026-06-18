import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ClipboardList,
  Calendar,
  Users,
  FileText,
  Settings,
  LogOut,
  Search,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle,
  Bell,
  Activity,
  ChevronRight,
  ChevronLeft,
  User,
  Shield,
  Wrench,
  Filter,
  RefreshCw
} from 'lucide-react';
import { Task, User as UserType, TaskTemplate } from '../types';

interface DashboardProps {
  tasks: Task[];
  currentUser: UserType;
  onNewTask: (assigneeEmail?: string) => void;
  onTaskClick: (task: Task) => void;
  onLogout: () => void;
  templates?: TaskTemplate[];
  onViewChange?: (view: 'overview' | 'tasks' | 'schedules' | 'team' | 'reports' | 'admin' | 'settings') => void;
  users?: UserType[];
  onAddUser?: (userData: UserType) => void;
  onAddTemplate?: (templateData: TaskTemplate) => void;
  onToggleTemplateStatus?: (templateId: string) => void;
  onUpdateSetting?: (key: string, value: string) => void;
  onEditProfile?: () => void;
  onChangePassword?: () => void;
  onConfigureNotifications?: () => void;
  onToggleUserActive?: (userId: string, active: boolean) => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  onSyncDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  dbConnectionStatus?: 'connected' | 'disconnected' | 'error';
}

export default function Dashboard({ tasks, currentUser, onNewTask, onTaskClick, onLogout, templates = [], onViewChange, users = [], onAddUser, onAddTemplate, onToggleTemplateStatus, onUpdateSetting, onEditProfile, onChangePassword, onConfigureNotifications, onToggleUserActive, isDarkMode = false, onToggleTheme, onSyncDatabase, isSyncing = false, lastSyncTime, dbConnectionStatus = 'connected' }: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'tasks' | 'schedules' | 'team' | 'reports' | 'admin' | 'settings'>('overview');
  const [navigationHistory, setNavigationHistory] = useState<'overview' | 'tasks' | 'schedules' | 'team' | 'reports' | 'admin' | 'settings'[]>([]);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState('All');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);

  // Calculate metrics
  const activeTasks = tasks.filter(t => t.Status !== 'Closed' && t.Status !== 'Reviewed').length;
  const overdueTasks = tasks.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    const today = new Date().toISOString().split('T')[0];
    return t.DueDate < today;
  }).length;
  const today = new Date().toISOString().split('T')[0];
  const dueToday = tasks.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate === today;
  }).length;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const completedThisWeek = tasks.filter(t => {
    if (t.Status !== 'Closed' && t.Status !== 'Reviewed') return false;
    if (!t.CompletionDate) return false;
    const completionDate = new Date(t.CompletionDate);
    return completionDate >= oneWeekAgo;
  }).length;

  // Get tasks needing attention (overdue or high priority)
  const needsAttention = tasks
    .filter(t => {
      if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
      const isOverdue = t.DueDate < today;
      const isHighPriority = t.Priority === 'High' || t.Priority === 'Critical';
      return isOverdue || isHighPriority;
    })
    .slice(0, 3);

  // Get recent activity (from audit logs or task updates)
  const recentActivity: { date: string; action: string; type: string }[] = [];

  // Get alerts based on actual task data
  const alerts = tasks
    .filter(t => {
      if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
      const isOverdue = t.DueDate < today;
      const isHighPriority = t.Priority === 'High' || t.Priority === 'Critical';
      return isOverdue || isHighPriority;
    })
    .slice(0, 5);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'High': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Medium': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Low': return 'bg-green-500/10 text-green-400 border-green-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Overdue': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'In progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Submitted': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Not Started': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleViewChange = (view: 'overview' | 'tasks' | 'schedules' | 'team' | 'reports' | 'admin' | 'settings', filterStatus?: string) => {
    // Add current view to history before changing
    if (activeView !== view) {
      setNavigationHistory(prev => [...prev, activeView]);
    }
    setActiveView(view);
    if (filterStatus) {
      setFilterStatus(filterStatus);
    }
    if (onViewChange) {
      onViewChange(view);
    }
  };

  const handleBack = () => {
    if (navigationHistory.length > 0) {
      const previousView = navigationHistory[navigationHistory.length - 1];
      setNavigationHistory(prev => prev.slice(0, -1));
      setActiveView(previousView);
      if (onViewChange) {
        onViewChange(previousView);
      }
    }
  };

  // Get team members based on user role
  const getTeamMembers = () => {
    if (currentUser.Role === 'Admin') {
      // Admin sees all users
      return users.filter(u => u.Email !== currentUser.Email);
    } else if (currentUser.Role === 'Stakeholder') {
      // Stakeholder sees sub-stakeholders where they are the manager
      return users.filter(u => 
        u.Email !== currentUser.Email && 
        u.Role === 'Sub-stakeholder' && 
        u.ManagerEmail === currentUser.Email
      );
    } else {
      // Sub-stakeholder sees their manager (stakeholder)
      return users.filter(u => 
        u.Email !== currentUser.Email && 
        u.Email === currentUser.ManagerEmail
      );
    }
  };

  const getFilteredTasks = () => {
    let filtered = tasks;
    
    if (filterStatus !== 'All') {
      filtered = filtered.filter(t => t.Status === filterStatus);
    }
    if (filterPriority !== 'All') {
      filtered = filtered.filter(t => t.Priority === filterPriority);
    }
    if (filterAssignee !== 'All') {
      filtered = filtered.filter(t => t.AssignedToEmail === filterAssignee);
    }
    if (searchQuery) {
      filtered = filtered.filter(t => 
        t.Title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.TaskID.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Sort by urgency: overdue first, then due soon
    const today = new Date().toISOString().split('T')[0];
    const sorted = filtered.sort((a, b) => {
      const aOverdue = a.DueDate < today && a.Status !== 'Closed' && a.Status !== 'Reviewed';
      const bOverdue = b.DueDate < today && b.Status !== 'Closed' && b.Status !== 'Reviewed';
      
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      
      // If both overdue or both not overdue, sort by due date
      return a.DueDate.localeCompare(b.DueDate);
    });
    
    return sorted;
  };

  const renderOverview = () => (
    <div className="space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => handleViewChange('tasks')}
          className={`border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-blue-500/50' : 'bg-white border-slate-200 hover:border-blue-500/50'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <ClipboardList className="text-blue-400" size={18} />
            </div>
            <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Open & in progress</span>
          </div>
          <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activeTasks}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active Tasks</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => handleViewChange('tasks', 'Overdue')}
          className={`border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-red-500/50' : 'bg-white border-slate-200 hover:border-red-500/50'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-red-400" size={18} />
            </div>
            <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Past due date</span>
          </div>
          <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{overdueTasks}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Overdue</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={() => handleViewChange('tasks')}
          className={`border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-yellow-500/50' : 'bg-white border-slate-200 hover:border-yellow-500/50'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <Clock className="text-yellow-400" size={18} />
            </div>
            <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Deadline today</span>
          </div>
          <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{dueToday}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Due Today</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={() => handleViewChange('tasks', 'Closed')}
          className={`border rounded-xl p-3 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-green-500/50' : 'bg-white border-slate-200 hover:border-green-500/50'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-400" size={18} />
            </div>
            <span className={`text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Last 7 days</span>
          </div>
          <p className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{completedThisWeek}</p>
          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Completed This Week</p>
        </motion.div>
      </div>

      {/* Needs Attention Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={`border rounded-xl ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}
      >
        <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-3">
            <Bell className="text-orange-400" size={20} />
            <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Needs attention</h3>
            <span className="bg-orange-500/10 text-orange-400 text-xs font-bold px-2 py-1 rounded-full border border-orange-500/20">
              {needsAttention.length} items
            </span>
          </div>
          <button onClick={() => handleViewChange('tasks')} className="text-blue-400 text-sm font-medium hover:text-blue-300 flex items-center space-x-1">
            <span>View all active</span>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
          {needsAttention.map((task, index) => {
            const daysUntil = getDaysUntilDue(task.DueDate);
            const dueText = daysUntil < 0 ? 'Overdue' : daysUntil === 0 ? 'Today' : `${daysUntil} days`;
            
            return (
              <motion.div
                key={task.TaskID}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
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
                    <h4 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {task.Title.length > 30 ? task.Title.substring(0, 30) + '...' : task.Title}
                    </h4>
                    <div className="flex items-center space-x-4 text-sm">
                      <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Due: {task.DueDate} {daysUntil > 0 && `(${dueText})`}</span>
                      <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{task.TaskID}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Alerts and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className={`border rounded-xl ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}
        >
          <div className={`p-6 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
            <div className="flex items-center space-x-3">
              <AlertTriangle className="text-red-400" size={20} />
              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Alerts</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {alerts.length > 0 ? (
              alerts.map((task) => {
                const isOverdue = task.DueDate < today;
                return (
                  <div 
                    key={task.TaskID}
                    onClick={() => onTaskClick(task)}
                    className={`${isOverdue ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20'} border rounded-lg p-4 cursor-pointer transition-colors`}
                  >
                    <div className="flex items-start space-x-3">
                      {isOverdue ? (
                        <AlertTriangle className="text-red-400 mt-0.5" size={18} />
                      ) : (
                        <Bell className="text-yellow-400 mt-0.5" size={18} />
                      )}
                      <div className="flex-1">
                        <p className={`font-medium text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {isOverdue ? 'Overdue task' : 'High priority task'}
                        </p>
                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {task.TaskID}: {task.Title.length > 50 ? task.Title.substring(0, 50) + '...' : task.Title}
                        </p>
                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Due: {task.DueDate} • Priority: {task.Priority}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={`text-center py-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <CheckCircle className="mx-auto mb-2 text-green-400" size={24} />
                <p className="text-sm">No alerts at this time</p>
                <p className="text-xs mt-1">All tasks are on track</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className={`border rounded-xl ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}
        >
          <div className={`p-6 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
            <div className="flex items-center space-x-3">
              <Activity className="text-blue-400" size={20} />
              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Recent activity</h3>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {recentActivity.map((activity, index) => (
              <div 
                key={index} 
                onClick={() => activity.type === 'report' ? handleViewChange('tasks', 'Submitted') : handleViewChange('tasks', 'In progress')}
                className="flex items-start space-x-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1E293B]/30 rounded-lg p-2 -mx-2 transition-colors"
              >
                <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Activity className="text-blue-400" size={14} />
                </div>
                <div>
                  <p className={`text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activity.action}</p>
                  <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{activity.date}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6">
      {/* Filters */}
      <div className={`border rounded-xl p-4 flex flex-wrap gap-4 items-center ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        <div className={`flex items-center space-x-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          <Filter size={16} />
          <span>Filters:</span>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
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
          onChange={(e) => setFilterPriority(e.target.value)}
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
            onChange={(e) => setFilterAssignee(e.target.value)}
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

      {/* Tasks List */}
      <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
          {getFilteredTasks().map((task) => (
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
          {getFilteredTasks().length === 0 && (
            <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No tasks found</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSchedules = () => (
    <div className="space-y-6">
      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Recurring Schedules</h3>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manage automated task generation schedules</p>
          </div>
          <button
            onClick={onNewTask}
            className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            <span>Create Schedule</span>
          </button>
        </div>
        <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
          {templates.filter(t => t.Active).length > 0 ? (
            templates.filter(t => t.Active).map((template) => (
              <div key={template.TemplateID} className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{template.Title}</h4>
                      <span className={`text-xs font-bold px-2 py-1 rounded border ${getPriorityColor(template.Priority)}`}>
                        {template.Priority}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm">
                      <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>{template.RecurrenceType}</span>
                      <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>• {template.Category}</span>
                      <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>• Next: {template.NextGenerationDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onNewTask()}
                      className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors ${
                        isDarkMode 
                          ? 'text-slate-700 hover:text-slate-900 bg-slate-200 hover:bg-slate-300' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
                      }`}
                    >
                      Edit
                    </button>
                    <button
                      className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No active schedules found</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTeam = () => {
    const teamMembers = getTeamMembers();

    // Group users by team for Admin view
    const teams = users.reduce((acc, user) => {
      const teamName = user.TeamName || 'Unassigned';
      if (!acc[teamName]) {
        acc[teamName] = [];
      }
      acc[teamName].push(user);
      return acc;
    }, {} as Record<string, UserType[]>);

    return (
      <div className="space-y-6">
        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {currentUser.Role === 'Admin' ? 'Teams & Members' : 'Team Members'}
              </h3>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {currentUser.Role === 'Admin' ? 'Manage teams and their members' :
                 currentUser.Role === 'Stakeholder' ? 'Your sub-stakeholders' : 
                 'Your manager'}
              </p>
            </div>
            {currentUser.Role === 'Admin' && (
              <button 
                onClick={() => handleViewChange('admin')}
                className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                <span>Add Member</span>
              </button>
            )}
          </div>

          {currentUser.Role === 'Admin' ? (
            // Admin view: Show teams with their members
            <div className="space-y-4">
              {Object.entries(teams).map(([teamName, teamUsers]) => (
                <div key={teamName} className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{teamName}</h4>
                    <span className={`text-xs font-bold px-2 py-1 rounded border ${
                      teamUsers.filter(u => u.Active).length > 0 
                        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {teamUsers.filter(u => u.Active).length} Active
                    </span>
                  </div>
                  <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
                    {teamUsers.filter(u => u.Active).map((member) => (
                      <div key={member.UserID} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center flex-shrink-0">
                              <User className="text-white" size={16} />
                            </div>
                            <div className="flex-1">
                              <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{member.FullName}</h4>
                              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{member.Email}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-3">
                            <span className={`text-xs font-bold px-2 py-1 rounded border ${
                              member.Role === 'Admin' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              member.Role === 'Stakeholder' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                              'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            }`}>
                              {member.Role}
                            </span>
                            {member.Role === 'Stakeholder' && (
                              <button
                                onClick={() => onNewTask(member.Email)}
                                className="text-xs font-medium px-2 py-1 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                              >
                                Assign Task
                              </button>
                            )}
                            <button
                              onClick={() => onToggleUserActive && onToggleUserActive(member.UserID, !member.Active)}
                              className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${
                                member.Active 
                                  ? 'text-green-400 bg-green-500/10 border-green-500/20 hover:bg-green-500/20' 
                                  : 'text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
                              }`}
                            >
                              {member.Active ? 'Active' : 'Inactive'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {teamUsers.filter(u => u.Active).length === 0 && (
                      <div className={`p-4 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        No active members in this team
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {Object.keys(teams).length === 0 && (
                <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No teams found</div>
              )}
            </div>
          ) : (
            // Non-admin view: Show filtered team members
            <div className="space-y-3">
              {teamMembers.length > 0 ? (
                teamMembers.map((member) => (
                  <div key={member.Email} className={`border rounded-lg p-4 flex items-center justify-between hover:border-[#475569] transition-colors ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center">
                        <User className="text-white" size={18} />
                      </div>
                      <div>
                        <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{member.FullName}</h4>
                        <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{member.Email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`text-xs font-bold px-2 py-1 rounded border ${
                        member.Role === 'Admin' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        member.Role === 'Stakeholder' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>
                        {member.Role}
                      </span>
                      <span className={`text-xs font-medium ${member.Active ? 'text-green-400' : 'text-red-400'}`}>
                        {member.Active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {currentUser.Role === 'Stakeholder' ? 'No sub-stakeholders assigned to you' : 
                   'No manager assigned'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderReports = () => (
    <div className="space-y-6">
      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center justify-between mb-6">
          <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Progress Reports</h3>
          <div className="flex items-center space-x-2">
            <select className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isDarkMode 
                ? 'bg-[#1E293B] border-[#334155] text-white' 
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}>
              <option>All Reports</option>
              <option>This Week</option>
              <option>This Month</option>
            </select>
          </div>
        </div>
        <div className="space-y-3">
          {tasks.filter(t => t.Status === 'Submitted' || t.Status === 'In Progress').length > 0 ? (
            tasks.filter(t => t.Status === 'Submitted' || t.Status === 'In Progress').map((task) => (
              <div 
                key={task.TaskID}
                onClick={() => onTaskClick(task)}
                className={`border rounded-lg p-4 hover:border-[#475569] transition-colors cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className={`font-medium mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{task.Title}</h4>
                    <div className={`flex items-center space-x-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      <span>Task: {task.TaskID}</span>
                      <span>Due: {task.DueDate}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${
                    task.Status === 'Submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                  }`}>
                    {task.Status}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No reports found</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderAdmin = () => {
    // Group users by team
    const teams = users.reduce((acc, user) => {
      const teamName = user.TeamName || 'Unassigned';
      if (!acc[teamName]) {
        acc[teamName] = { stakeholders: [], subStakeholders: [] };
      }
      if (user.Role === 'Stakeholder') {
        acc[teamName].stakeholders.push(user);
      } else if (user.Role === 'Sub-stakeholder') {
        acc[teamName].subStakeholders.push(user);
      }
      return acc;
    }, {} as Record<string, { stakeholders: UserType[], subStakeholders: UserType[] }>);

    return (
      <div className="space-y-6">
        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>System Workbench</h3>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                dbConnectionStatus === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                dbConnectionStatus === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                'bg-slate-500/10 text-slate-400 border border-slate-500/20'
              }`}>
                <div className={`w-2 h-2 rounded-full ${
                  dbConnectionStatus === 'connected' ? 'bg-emerald-400' :
                  dbConnectionStatus === 'error' ? 'bg-red-400' : 'bg-slate-400'
                }`} />
                {dbConnectionStatus === 'connected' ? 'Connected' : dbConnectionStatus === 'error' ? 'Error' : 'Disconnected'}
              </div>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${
                isDarkMode ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-cyan-50 text-cyan-600 border border-cyan-200'
              }`}>
                <Clock size={12} />
                <span>Auto-sync (5m)</span>
              </div>
              {lastSyncTime && (
                <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Last sync: {new Date(lastSyncTime).toLocaleTimeString()}
                </span>
              )}
              {onSyncDatabase && (
                <button
                  onClick={onSyncDatabase}
                  disabled={isSyncing}
                  className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Force database synchronization"
                >
                  <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div 
              onClick={() => handleViewChange('team')}
              className={`border rounded-lg p-4 hover:border-[#475569] transition-colors cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <Users className="text-blue-400" size={20} />
                </div>
                <div>
                  <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>User Management</h4>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manage users and roles</p>
                </div>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{users.length} total users</p>
            </div>

            <div 
              onClick={() => handleViewChange('schedules')}
              className={`border rounded-lg p-4 hover:border-[#475569] transition-colors cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                  <Calendar className="text-purple-400" size={20} />
                </div>
                <div>
                  <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Schedule Templates</h4>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Recurring task schedules</p>
                </div>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{templates.filter(t => t.Active).length} active templates</p>
            </div>

            <div 
              onClick={() => handleViewChange('tasks')}
              className={`border rounded-lg p-4 hover:border-[#475569] transition-colors cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <Activity className="text-green-400" size={20} />
                </div>
                <div>
                  <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Task Management</h4>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>View and manage tasks</p>
                </div>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{tasks.length} total tasks</p>
            </div>

            <div 
              onClick={() => handleViewChange('settings')}
              className={`border rounded-lg p-4 hover:border-[#475569] transition-colors cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="text-orange-400" size={20} />
                </div>
                <div>
                  <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Alert Configuration</h4>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Notification settings</p>
                </div>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Configure alerts</p>
            </div>

            <div 
              onClick={() => handleViewChange('settings')}
              className={`border rounded-lg p-4 hover:border-[#475569] transition-colors cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
                  <RefreshCw className="text-cyan-400" size={20} />
                </div>
                <div>
                  <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Data Sync</h4>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Database synchronization</p>
                </div>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Sync status</p>
            </div>

            <div 
              onClick={() => handleViewChange('reports')}
              className={`border rounded-lg p-4 hover:border-[#475569] transition-colors cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                  <FileText className="text-yellow-400" size={20} />
                </div>
                <div>
                  <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Reports</h4>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>View progress reports</p>
                </div>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Report management</p>
            </div>
          </div>
        </div>

        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <h3 className={`font-semibold text-lg mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Teams Overview</h3>
          <div className="space-y-4">
            {Object.entries(teams).map(([teamName, teamData]) => (
              <div key={teamName} className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{teamName}</h4>
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${isDarkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                    {teamData.stakeholders.length} Stakeholders, {teamData.subStakeholders.length} Sub-stakeholders
                  </span>
                </div>
                <div className="space-y-2">
                  {teamData.stakeholders.map((stakeholder) => (
                    <div key={stakeholder.UserID} className={`p-3 rounded border ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
                            <User className="text-white" size={14} />
                          </div>
                          <div>
                            <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{stakeholder.FullName}</p>
                            <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{stakeholder.Email}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20`}>
                          Stakeholder
                        </span>
                      </div>
                      {teamData.subStakeholders.filter(sub => sub.ManagerEmail === stakeholder.Email).length > 0 && (
                        <div className="ml-4 mt-2 space-y-1">
                          <p className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Sub-stakeholders:</p>
                          {teamData.subStakeholders.filter(sub => sub.ManagerEmail === stakeholder.Email).map((sub) => (
                            <div key={sub.UserID} className={`flex items-center space-x-2 p-2 rounded ${isDarkMode ? 'bg-[#0F141F]' : 'bg-slate-100'}`}>
                              <div className="w-6 h-6 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center">
                                <User className="text-white" size={10} />
                              </div>
                              <div className="flex-1">
                                <p className={`text-xs font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{sub.FullName}</p>
                                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{sub.Email}</p>
                              </div>
                              <span className={`text-xs font-bold px-1 py-0.5 rounded border bg-slate-500/10 text-slate-400 border-slate-500/20`}>
                                Sub-stakeholder
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {Object.keys(teams).length === 0 && (
              <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No teams found</div>
            )}
          </div>
        </div>

        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <h3 className={`font-semibold text-lg mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Recent System Activity</h3>
          <div className="space-y-3">
            {[
              { action: `User ${currentUser.Email} logged in`, time: 'Just now', type: 'auth' },
              { action: 'Dashboard view accessed', time: 'Just now', type: 'system' },
            ].map((activity, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className={`w-2 h-2 rounded-full mt-2 ${
                  activity.type === 'auth' ? 'bg-blue-400' :
                  activity.type === 'task' ? 'bg-green-400' :
                  activity.type === 'schedule' ? 'bg-purple-400' :
                  'bg-orange-400'
                }`} />
                <div className="flex-1">
                  <p className={`text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activity.action}</p>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-6">
      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        <h3 className={`font-semibold text-lg mb-6 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Account Settings</h3>
        
        <div className="space-y-6">
          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Profile Information</h4>
                <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Update your personal details</p>
              </div>
              <button 
                onClick={onEditProfile}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Edit Profile
              </button>
            </div>
          </div>

          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Change Password</h4>
                <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Update your password</p>
              </div>
              <button 
                onClick={onChangePassword}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Change Password
              </button>
            </div>
          </div>

          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Email Notifications</h4>
                <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manage email notification preferences</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-green-400 text-sm font-medium">Enabled</span>
                <button 
                  onClick={onConfigureNotifications}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}`}
                >
                  Configure
                </button>
              </div>
            </div>
          </div>

          <div className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Theme Preference</h4>
                <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{isDarkMode ? 'Dark theme is currently active' : 'Light theme is currently active'}</p>
              </div>
              <button
                onClick={() => onToggleTheme && onToggleTheme()}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}`}
              >
                {isDarkMode ? 'Switch to Light' : 'Switch to Dark'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        <h3 className={`font-semibold text-lg mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Danger Zone</h3>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Delete Account</h4>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Permanently delete your account and all data</p>
            </div>
            <button 
              onClick={onLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex min-h-screen font-sans ${isDarkMode ? 'bg-[#0A0E1A]' : 'bg-slate-50'}`}>
      {/* Sidebar */}
      <aside className={`${isSidebarVisible ? '' : 'hidden'} w-64 border-r flex flex-col ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        {/* Logo */}
        <div className={`p-6 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-3">
            <img src="/pw-logo.jpg" alt="PW Logo" className="w-10 h-10 object-contain" />
          </div>
        </div>

        {/* User Info */}
        <div className={`p-4 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center">
              <User className="text-white" size={18} />
            </div>
            <div>
              <p className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{currentUser.FullName}</p>
              <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{currentUser.Role}</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {/* Workspace Section */}
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Workspace</p>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => handleViewChange('overview')}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'overview' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <LayoutDashboard size={18} />
                  <span className="font-medium text-sm">Overview</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleViewChange('tasks')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'tasks' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <ClipboardList size={18} />
                    <span className="font-medium text-sm">Tasks</span>
                  </div>
                  <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{tasks.length}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleViewChange('schedules')}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'schedules' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Calendar size={18} />
                  <span className="font-medium text-sm">Schedules</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleViewChange('team')}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'team' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Users size={18} />
                  <span className="font-medium text-sm">Team</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleViewChange('reports')}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'reports' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <FileText size={18} />
                  <span className="font-medium text-sm">Reports</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Admin Section */}
          {currentUser.Role === 'Admin' && (
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Admin</p>
              <ul className="space-y-1">
                <li>
                  <button
                    onClick={() => handleViewChange('admin')}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                      activeView === 'admin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Wrench size={18} />
                    <span className="font-medium text-sm">System workbench</span>
                  </button>
                </li>
              </ul>
            </div>
          )}

          {/* Account Section */}
          <div>
            <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Account</p>
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => handleViewChange('settings')}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'settings' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Settings size={18} />
                  <span className="font-medium text-sm">Settings</span>
                </button>
              </li>
            </ul>
          </div>
        </nav>

        {/* Sign Out */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
          <button
            onClick={onLogout}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <LogOut size={18} />
            <span className="font-medium text-sm">Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className={`px-8 py-5 sticky top-0 z-10 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              {/* Toggle Sidebar Button */}
              <button
                onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                className={`p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                <LayoutDashboard size={20} />
              </button>
              {/* Back Button */}
              {navigationHistory.length > 0 && (
                <button
                  onClick={handleBack}
                  className={`p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                  title="Go back"
                >
                  <ChevronLeft size={20} />
                </button>
              )}
              <div>
                <h2 className={`text-2xl font-bold capitalize ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activeView}</h2>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Welcome back, {currentUser.FullName}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} size={18} />
                <input
                  type="text"
                  placeholder="Search tasks, people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-80 border rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${
                    isDarkMode 
                      ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-400' 
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
              {/* New Task Button */}
              <button
                onClick={onNewTask}
                className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-colors"
              >
                <Plus size={18} />
                <span>New task</span>
              </button>
              {/* Profile Icon */}
              <button
                onClick={onEditProfile}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isDarkMode ? 'bg-slate-800/50 hover:bg-slate-700/50 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900'}`}
              >
                <User size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeView === 'overview' && renderOverview()}
              {activeView === 'tasks' && renderTasks()}
              {activeView === 'schedules' && renderSchedules()}
              {activeView === 'team' && renderTeam()}
              {activeView === 'reports' && renderReports()}
              {activeView === 'admin' && renderAdmin()}
              {activeView === 'settings' && renderSettings()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
