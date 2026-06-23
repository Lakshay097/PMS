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
  RefreshCw,
  X,
  Menu,
  Mail,
  Link,
  Unlink,
  Loader2
} from 'lucide-react';
import { Task, User as UserType, TaskTemplate, AppSetting, Team } from '../../../types';
import { ROLE } from '../../../constants/status';
import AdminPanel from '../../AdminPanel';
import TaskList from '../tasks/TaskList';
import TaskFilters from '../tasks/TaskFilters';

interface DashboardProps {
  tasks: Task[];
  currentUser: UserType;
  onNewTask: (assigneeEmail?: string) => void;
  onTaskClick: (task: Task) => void;
  onLogout: () => void;
  templates?: TaskTemplate[];
  onViewChange?: (view: 'overview' | 'tasks' | 'team' | 'reports' | 'admin' | 'settings') => void;
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
  audits?: AppSetting[];
  settings?: AppSetting[];
  teams?: Team[];
  onToggleUserStatus?: (email: string) => void;
  onUpdateUserRole?: (email: string, role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder') => void;
  onApproveUser?: (email: string) => void;
  onAddTeam?: (team: Team) => void;
  onToggleTeamStatus?: (teamId: string) => void;
  onUpdateUserTeams?: (email: string, teamIDs: string[], teamNames: string[]) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
  onDeleteTask?: (taskId: string) => void;
  isDrawerOpen?: boolean;
  isTaskModalOpen?: boolean;
  isReportModalOpen?: boolean;
  isFollowUpModalOpen?: boolean;
  isEditProfileModalOpen?: boolean;
  isChangePasswordModalOpen?: boolean;
  isConfigureNotificationsModalOpen?: boolean;
  isAddUserModalOpen?: boolean;
  isAddTeamModalOpen?: boolean;
}

export default function Dashboard({
  tasks,
  currentUser,
  onNewTask,
  onTaskClick,
  onLogout,
  templates = [],
  onViewChange,
  users = [],
  onAddUser,
  onAddTemplate,
  onToggleTemplateStatus,
  onUpdateSetting,
  onEditProfile,
  onChangePassword,
  onConfigureNotifications,
  onToggleUserActive,
  isDarkMode = false,
  onToggleTheme,
  onSyncDatabase,
  isSyncing = false,
  lastSyncTime,
  dbConnectionStatus = 'connected',
  audits = [],
  settings = [],
  teams = [],
  onToggleUserStatus,
  onUpdateUserRole,
  onApproveUser,
  onAddTeam,
  onToggleTeamStatus,
  onUpdateUserTeams,
  onDeleteTeam,
  onDeleteTask,
  isDrawerOpen = false,
  isTaskModalOpen = false,
  isReportModalOpen = false,
  isFollowUpModalOpen = false,
  isEditProfileModalOpen = false,
  isChangePasswordModalOpen = false,
  isConfigureNotificationsModalOpen = false,
  isAddUserModalOpen = false,
  isAddTeamModalOpen = false,
}: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'tasks' | 'team' | 'reports' | 'admin' | 'settings'>('overview');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState('All');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [taskSubView, setTaskSubView] = useState<'my-tasks' | 'team-tasks'>('my-tasks');
  const [taskContentType, setTaskContentType] = useState<'tasks' | 'schedules'>('tasks');
  const [lastActionTime, setLastActionTime] = useState(Date.now());
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check if any modal is open
  const isAnyModalOpen = isDrawerOpen || isTaskModalOpen || isReportModalOpen || 
    isFollowUpModalOpen || isEditProfileModalOpen || isChangePasswordModalOpen ||
    isConfigureNotificationsModalOpen || isAddUserModalOpen || isAddTeamModalOpen;

  // Persist sidebar collapse state
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isSidebarCollapsed ? 'true' : 'false');
  }, [isSidebarCollapsed]);

  // Check Gmail connection status on mount
  useEffect(() => {
    checkGmailStatus();
    
    // Check for OAuth callback in URL
    const urlParams = new URLSearchParams(window.location.search);
    const emailSuccess = urlParams.get('email_success');
    const emailError = urlParams.get('email_error');
    
    if (emailSuccess === 'true') {
      setConnectionMessage({ type: 'success', text: 'Gmail connected successfully!' });
      checkGmailStatus();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (emailError) {
      const errorMessages: Record<string, string> = {
        'access_denied': 'Authorization was denied',
        'missing_code': 'Authorization code missing',
        'token_exchange_failed': 'Failed to exchange authorization code',
        'failed_to_get_email': 'Failed to retrieve email address',
        'save_failed': 'Failed to save connection',
        'unknown_error': 'An unknown error occurred',
      };
      setConnectionMessage({ 
        type: 'error', 
        text: errorMessages[emailError] || 'Connection failed' 
      });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const checkGmailStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch('/api/auth/gmail/status', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGmailConnected(data.connected);
      }
    } catch (err) {
      console.error('Error checking Gmail status:', err);
    }
  };

  const handleConnectGmail = async () => {
    setGmailLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setConnectionMessage({ type: 'error', text: 'Please log in first' });
        setGmailLoading(false);
        return;
      }

      const response = await fetch('/api/auth/gmail/url', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.authUrl) {
          window.location.href = data.authUrl;
        } else {
          setConnectionMessage({ type: 'error', text: 'No authorization URL returned' });
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setConnectionMessage({ type: 'error', text: errorData.error || 'Failed to get authorization URL' });
      }
    } catch (err) {
      console.error('Error connecting Gmail:', err);
      setConnectionMessage({ type: 'error', text: 'Failed to connect Gmail' });
    } finally {
      setGmailLoading(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setGmailLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) return;

      const response = await fetch('/api/auth/gmail/disconnect', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setGmailConnected(false);
        setConnectionMessage({ type: 'success', text: 'Gmail disconnected successfully' });
      } else {
        setConnectionMessage({ type: 'error', text: 'Failed to disconnect Gmail' });
      }
    } catch (err) {
      console.error('Error disconnecting Gmail:', err);
      setConnectionMessage({ type: 'error', text: 'Failed to disconnect Gmail' });
    } finally {
      setGmailLoading(false);
    }
  };

  // Function to trigger sync after user actions (silent)
  const triggerSyncAfterAction = () => {
    if (onSyncDatabase && !isSyncing) {
      setLastActionTime(Date.now());
      onSyncDatabase();
    }
  };

  // Auto-sync every 5 minutes to avoid rate limiting (silent)
  useEffect(() => {
    const syncInterval = setInterval(() => {
      if (onSyncDatabase && !isSyncing) {
        // Only auto-sync if no user action in the last 2 minutes
        const timeSinceLastAction = Date.now() - lastActionTime;
        if (timeSinceLastAction > 120000) { // 2 minutes
          onSyncDatabase();
        }
      }
    }, 300000); // 5 minutes

    return () => clearInterval(syncInterval);
  }, [onSyncDatabase, isSyncing, lastActionTime]);

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

  const handleViewChange = (
    view: 'overview' | 'tasks' | 'team' | 'reports' | 'admin' | 'settings',
    filterStatus?: string
  ) => {
    if (activeView !== view) {
      // Push to browser history
      window.history.pushState({ view: activeView }, '', `#${view}`);
    }
    setActiveView(view);
    if (filterStatus) {
      setFilterStatus(filterStatus);
    }
    if (onViewChange) {
      onViewChange(view);
    }
  };

  // Initialize browser history with initial view
  useEffect(() => {
    window.history.replaceState({ view: activeView }, '', `#${activeView}`);
  }, []);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state && event.state.view) {
        setActiveView(event.state.view);
        if (onViewChange) {
          onViewChange(event.state.view);
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onViewChange]);

  // Get team members based on user role
  const getTeamMembers = () => {
    if (currentUser.Role === ROLE.ADMIN) {
      return users || [];
    } else if (currentUser.Role === ROLE.STAKEHOLDER) {
      return (users || []).filter(u =>
        u.Email === currentUser.Email ||
        (u.Role === ROLE.SUB_STAKEHOLDER && u.ManagerEmail === currentUser.Email)
      );
    } else {
      return (users || []).filter(u =>
        u.Email === currentUser.Email ||
        u.Email === currentUser.ManagerEmail
      );
    }
  };

  const getFilteredTasks = () => {
    // First apply role-based filtering using taskSubView
    const subView = currentUser.Role === ROLE.SUB_STAKEHOLDER ? 'my-tasks' : taskSubView;
    
    // Get sub-stakeholders for the current user (if they are a stakeholder)
    const subStakeholders = currentUser.Role === ROLE.STAKEHOLDER 
      ? (users || []).filter(u => u.Role === ROLE.SUB_STAKEHOLDER && u.ManagerEmail?.toLowerCase() === currentUser.Email.toLowerCase())
      : [];
    
    const subStakeholderEmails = subStakeholders.map(u => u.Email.toLowerCase());
    
    // Get team members for the current user
    const myTeamMembers = currentUser.TeamIDs && currentUser.TeamIDs.length > 0
      ? (users || []).filter(u => u.TeamIDs.some(teamId => currentUser.TeamIDs.includes(teamId)))
      : [];
    
    const teamMemberEmails = myTeamMembers.map(u => u.Email.toLowerCase());
    
    const roleFiltered = (tasks || []).filter(task => {
      // Admin: My Tasks = assigned to me, Team Tasks = all tasks
      if (currentUser.Role === ROLE.ADMIN) {
        if (subView === 'my-tasks') {
          return task.AssignedToEmail?.toLowerCase().includes(currentUser.Email.toLowerCase());
        }
        // team-tasks - show all tasks
        return true;
      }
      
      // Stakeholder: My Tasks = assigned to me, Team Tasks = sub-stakeholder tasks + team tasks
      if (currentUser.Role === ROLE.STAKEHOLDER) {
        const assignedToMe = task.AssignedToEmail?.toLowerCase().includes(currentUser.Email.toLowerCase());
        const assignedByMe = task.AssignedByEmail?.toLowerCase() === currentUser.Email.toLowerCase();
        const assignedToSubStakeholder = task.AssignedToEmail?.toLowerCase().split(',').some(email => 
          subStakeholderEmails.includes(email.trim().toLowerCase())
        );
        const assignedToTeamMember = task.AssignedToEmail?.toLowerCase().split(',').some(email => 
          teamMemberEmails.includes(email.trim().toLowerCase())
        );
        
        if (subView === 'my-tasks') {
          return assignedToMe;
        }
        // team-tasks - show sub-stakeholder tasks and team tasks
        return assignedToSubStakeholder || assignedToTeamMember;
      }
      
      // Sub-stakeholder: My Tasks = assigned to me only
      if (currentUser.Role === ROLE.SUB_STAKEHOLDER) {
        return task.AssignedToEmail?.toLowerCase().includes(currentUser.Email.toLowerCase());
      }
      
      return false;
    });

    let filtered = roleFiltered;

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
        (t.Title && t.Title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.TaskID && t.TaskID.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.AssignedToEmail && t.AssignedToEmail.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const sorted = filtered.sort((a, b) => {
      const aOverdue = a.DueDate < today && a.Status !== 'Closed' && a.Status !== 'Reviewed';
      const bOverdue = b.DueDate < today && b.Status !== 'Closed' && b.Status !== 'Reviewed';

      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

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
                onClick={(e) => { e.preventDefault(); onTaskClick(task); }}
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
                    onClick={(e) => { e.preventDefault(); onTaskClick(task); }}
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
                          Due: {task.DueDate} &bull; Priority: {task.Priority}
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
      {/* Header with Create Task button and Content Type Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Tasks & Schedules</h2>
          <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            {taskContentType === 'tasks' 
              ? (currentUser.Role === ROLE.ADMIN ? 'Manage all tasks' : 'Manage your assigned tasks')
              : 'Manage recurring task schedules'
            }
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Content Type Toggle */}
          <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-100'}`}>
            <button
              onClick={() => setTaskContentType('tasks')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                taskContentType === 'tasks'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setTaskContentType('schedules')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                taskContentType === 'schedules'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Schedules
            </button>
          </div>
          <button
            onClick={() => onNewTask()}
            className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            <span>{taskContentType === 'schedules' ? 'Create Schedule' : 'Create Task'}</span>
          </button>
        </div>
      </div>

      {/* Task Sub-tabs for Admin and Stakeholder only - only show for tasks */}
      {taskContentType === 'tasks' && (currentUser.Role === ROLE.ADMIN || currentUser.Role === ROLE.STAKEHOLDER) && (
        <div className={`border rounded-xl p-4 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setTaskSubView('my-tasks')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                taskSubView === 'my-tasks'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                  ? 'bg-[#1E293B] text-slate-400 hover:text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              My Tasks
            </button>
            <button
              onClick={() => setTaskSubView('team-tasks')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                taskSubView === 'team-tasks'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                  ? 'bg-[#1E293B] text-slate-400 hover:text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              {currentUser.Role === ROLE.ADMIN ? 'Team Tasks' : 'Assigned by Me'}
            </button>
          </div>
        </div>
      )}
      
      {/* Show tasks content */}
      {taskContentType === 'tasks' && (
        <>
          <TaskFilters
            filterStatus={filterStatus}
            filterPriority={filterPriority}
            filterAssignee={filterAssignee}
            currentUser={currentUser}
            users={users}
            isDarkMode={isDarkMode}
            onFilterStatusChange={setFilterStatus}
            onFilterPriorityChange={setFilterPriority}
            onFilterAssigneeChange={setFilterAssignee}
          />
          <TaskList
            tasks={getFilteredTasks()}
            onTaskClick={onTaskClick}
            isDarkMode={isDarkMode}
            getPriorityColor={getPriorityColor}
            getStatusColor={getStatusColor}
            currentUser={currentUser}
            taskSubView={currentUser.Role === ROLE.SUB_STAKEHOLDER ? 'my-tasks' : taskSubView}
            onDeleteTask={onDeleteTask}
          />
        </>
      )}

      {/* Show schedules content */}
      {taskContentType === 'schedules' && (
        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
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
                        <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>&bull; Next: {template.NextGenerationDate}</span>
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
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No active schedules found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderTeam = () => {
    const teamMembers = getTeamMembers();

    const filteredTeamMembers = searchQuery
      ? teamMembers.filter(user =>
          (user.FullName && user.FullName.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (user.Email && user.Email.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : teamMembers;

    const groupedTeams: Record<string, UserType[]> = {};

    (teams || []).forEach(t => {
      groupedTeams[t.TeamName] = [];
    });

    groupedTeams['Unassigned'] = [];

    filteredTeamMembers.forEach(user => {
      if (user.TeamNames && user.TeamNames.length > 0) {
        user.TeamNames.forEach(teamName => {
          if (!groupedTeams[teamName]) {
            groupedTeams[teamName] = [];
          }
          groupedTeams[teamName].push(user);
        });
      } else {
        groupedTeams['Unassigned'].push(user);
      }
    });

    if (groupedTeams['Unassigned'].length === 0) {
      delete groupedTeams['Unassigned'];
    }

    return (
      <div className="space-y-6">
        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {currentUser.Role === ROLE.ADMIN ? 'Teams & Members' : 'Team Members'}
              </h3>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {currentUser.Role === ROLE.ADMIN ? 'Manage teams and their members' :
                 currentUser.Role === ROLE.STAKEHOLDER ? 'Your sub-stakeholders' :
                 'Your manager'}
              </p>
            </div>
            {currentUser.Role === ROLE.ADMIN && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleViewChange('admin')}
                  className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  <span>Add Member</span>
                </button>
                <button
                  onClick={() => handleViewChange('admin')}
                  className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus size={16} />
                  <span>Add Team</span>
                </button>
              </div>
            )}
          </div>

          {currentUser.Role === ROLE.ADMIN ? (
            <div className="space-y-4">
              {Object.entries(groupedTeams).map(([teamName, teamUsers]) => (
                <div key={teamName} className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{teamName}</h4>
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded border ${
                        teamUsers.filter(u => u.Active).length > 0
                          ? 'bg-green-500/10 text-green-400 border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {teamUsers.filter(u => u.Active).length} / {teamUsers.length} Active
                      </span>
                      <button
                        onClick={() => onNewTask(teamUsers.map(u => u.Email).join(', '))}
                        className="text-xs font-medium px-2 py-1 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                      >
                        Assign Task to Team
                      </button>
                    </div>
                  </div>
                  <div className={`divide-y ${isDarkMode ? 'divide-[#1E293B]' : 'divide-slate-200'}`}>
                    {teamUsers.map((member) => (
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
                              member.Role === ROLE.ADMIN ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              member.Role === ROLE.STAKEHOLDER ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                              'bg-slate-500/10 text-slate-400 border-slate-500/20'
                            }`}>
                              {member.Role}
                            </span>
                            {member.Role === ROLE.STAKEHOLDER && (
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
                    {teamUsers.length === 0 && (
                      <div className={`p-4 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        No members in this team
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {Object.keys(groupedTeams).length === 0 && (
                <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No teams found</div>
              )}
            </div>
          ) : (
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
                        member.Role === ROLE.ADMIN ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        member.Role === ROLE.STAKEHOLDER ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>
                        {member.Role}
                      </span>
                      {member.Role === ROLE.STAKEHOLDER && (
                        <button
                          onClick={() => onNewTask(member.Email)}
                          className="text-xs font-medium px-2 py-1 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        >
                          Assign Task
                        </button>
                      )}
                      <span className={`text-xs font-medium ${member.Active ? 'text-green-400' : 'text-red-400'}`}>
                        {member.Active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {currentUser.Role === ROLE.STAKEHOLDER ? 'No sub-stakeholders assigned to you' : 'No manager assigned'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderReports = () => {
    const reportTasks = tasks.filter(t => t.Status === 'Submitted' || t.Status === 'In Progress');
    const filteredReportTasks = searchQuery
      ? reportTasks.filter(t =>
          (t.Title && t.Title.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (t.TaskID && t.TaskID.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (t.AssignedToEmail && t.AssignedToEmail.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      : reportTasks;

    return (
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
            {filteredReportTasks.length > 0 ? (
              filteredReportTasks.map((task) => (
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
  };

  const renderAdmin = () => (
    <AdminPanel
      users={users}
      templates={templates}
      settings={settings}
      teams={teams}
      onAddUser={onAddUser || (() => {})}
      onToggleUserStatus={onToggleUserStatus || (() => {})}
      onAddTemplate={onAddTemplate || (() => {})}
      onToggleTemplateStatus={onToggleTemplateStatus || (() => {})}
      onUpdateSetting={onUpdateSetting || (() => {})}
      onUpdateUserRole={onUpdateUserRole || (() => {})}
      onApproveUser={onApproveUser || (() => {})}
      onAddTeam={onAddTeam || (() => {})}
      onToggleTeamStatus={onToggleTeamStatus || (() => {})}
      onUpdateUserTeams={onUpdateUserTeams || (() => {})}
      onDeleteTeam={onDeleteTeam || (() => {})}
      isDarkMode={isDarkMode}
    />
  );

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
                <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Email Integration</h4>
                <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Connect Gmail to send emails as yourself</p>
              </div>
              <div className="flex items-center space-x-2">
                {gmailConnected ? (
                  <span className="text-green-400 text-sm font-medium">Connected</span>
                ) : (
                  <span className="text-slate-400 text-sm font-medium">Not Connected</span>
                )}
                <button
                  onClick={gmailConnected ? handleDisconnectGmail : handleConnectGmail}
                  disabled={gmailLoading}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {gmailLoading ? <Loader2 size={16} className="animate-spin" /> : gmailConnected ? <Unlink size={16} /> : <Link size={16} />}
                  <span>{gmailLoading ? 'Loading...' : gmailConnected ? 'Disconnect' : 'Connect'}</span>
                </button>
              </div>
            </div>
            {connectionMessage && (
              <div className={`mt-3 p-3 rounded-md text-sm ${connectionMessage.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {connectionMessage.text}
              </div>
            )}
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
      {/* Mobile Sidebar Overlay */}
      {isSidebarVisible && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarVisible(false)}
        />
      )}

      {/* Mobile Search Modal */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden flex items-start justify-center pt-20 px-4">
          <div className={`w-full max-w-lg rounded-xl shadow-2xl p-4 ${isDarkMode ? 'bg-[#0F141F] border border-[#1E293B]' : 'bg-white border border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} size={18} />
                <input
                  type="text"
                  placeholder="Search tasks, people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className={`w-full border rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${
                    isDarkMode
                      ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-400'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Modal Backdrop Overlay - Covers entire screen including sidebar */}
      {isAnyModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 pointer-events-none" />
      )}

      {/* Sidebar */}
      <aside className={`${isSidebarVisible ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:fixed top-0 left-0 h-screen z-10 border-r flex flex-col transition-all duration-300 ease-in-out ${isAnyModalOpen ? 'opacity-40 pointer-events-none' : ''} ${isSidebarCollapsed ? 'md:w-16' : 'md:w-64'} ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
        {/* Logo */}
        <div className={`p-4 border-b flex items-center justify-center ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'} ${isSidebarCollapsed ? 'md:px-2' : 'md:px-6'}`}>
          <img src="/pw-logo.jpg" alt="PW Logo" className={`object-contain ${isSidebarCollapsed ? 'w-8 h-8' : 'w-10 h-10'}`} />
          {!isSidebarCollapsed && <span className="ml-3 font-bold text-lg hidden md:block">PMS</span>}
        </div>

        {/* Collapse Toggle Button */}
        <div className={`p-2 border-b flex justify-center ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
          <button
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* User Info - Hidden when collapsed */}
        {!isSidebarCollapsed && (
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
        )}

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto ${isSidebarCollapsed ? 'px-2 py-4' : 'p-4 space-y-6'}`} style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {/* Workspace Section */}
          <div>
            {!isSidebarCollapsed && <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Workspace</p>}
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => handleViewChange('overview')}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'overview' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title={isSidebarCollapsed ? 'Overview' : ''}
                >
                  <LayoutDashboard size={18} />
                  {!isSidebarCollapsed && <span className="font-medium text-sm">Overview</span>}
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleViewChange('tasks')}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'tasks' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title={isSidebarCollapsed ? 'Tasks' : ''}
                >
                  <div className={`flex items-center ${isSidebarCollapsed ? '' : 'space-x-3'}`}>
                    <ClipboardList size={18} />
                    {!isSidebarCollapsed && <span className="font-medium text-sm">Tasks</span>}
                  </div>
                  {!isSidebarCollapsed && <span className="bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{tasks.length}</span>}
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleViewChange('team')}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'team' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title={isSidebarCollapsed ? 'Team' : ''}
                >
                  <Users size={18} />
                  {!isSidebarCollapsed && <span className="font-medium text-sm">Team</span>}
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleViewChange('reports')}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'reports' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title={isSidebarCollapsed ? 'Reports' : ''}
                >
                  <FileText size={18} />
                  {!isSidebarCollapsed && <span className="font-medium text-sm">Reports</span>}
                </button>
              </li>
              {currentUser.Role === ROLE.ADMIN && (
                <li>
                  <button
                    onClick={() => handleViewChange('admin')}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg transition-colors ${
                      activeView === 'admin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title={isSidebarCollapsed ? 'Admin Panel' : ''}
                  >
                    <Shield size={18} />
                    {!isSidebarCollapsed && <span className="font-medium text-sm">Admin Panel</span>}
                  </button>
                </li>
              )}
            </ul>
          </div>

          {/* Account Section */}
          <div>
            {!isSidebarCollapsed && <p className={`text-xs font-bold uppercase tracking-wider mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Account</p>}
            <ul className="space-y-1">
              <li>
                <button
                  onClick={() => handleViewChange('settings')}
                  className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg transition-colors ${
                    activeView === 'settings' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                  title={isSidebarCollapsed ? 'Settings' : ''}
                >
                  <Settings size={18} />
                  {!isSidebarCollapsed && <span className="font-medium text-sm">Settings</span>}
                </button>
              </li>
            </ul>
          </div>
        </nav>

        {/* Sign Out */}
        <div className={`p-4 border-t ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
          <button
            onClick={onLogout}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors`}
            title={isSidebarCollapsed ? 'Sign out' : ''}
          >
            <LogOut size={18} />
            {!isSidebarCollapsed && <span className="font-medium text-sm">Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        {/* Header */}
        <header className={`px-4 md:px-8 py-4 md:py-5 sticky top-0 z-30 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Toggle Sidebar Button - Hamburger menu for mobile */}
              <button
                onClick={() => setIsSidebarVisible(!isSidebarVisible)}
                className={`md:hidden p-2 md:p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                <Menu size={20} />
              </button>
              <div className="block sm:hidden">
                <h2 className={`text-lg font-bold capitalize ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activeView}</h2>
              </div>
              <div className="hidden sm:block">
                <h2 className={`text-xl md:text-2xl font-bold capitalize ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activeView}</h2>
                <p className={`text-xs md:text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Welcome back, {currentUser.FullName || currentUser.Email}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Profile Button */}
              <button
                onClick={onEditProfile}
                className={`p-2 md:p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                title="Profile"
              >
                <User size={20} />
              </button>
              {/* Manual Sync Button */}
              {onSyncDatabase && (
                <button
                  onClick={onSyncDatabase}
                  disabled={isSyncing}
                  className="flex items-center space-x-1 sm:space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-2 sm:px-3 py-2 rounded-lg font-medium text-xs transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed"
                >
                  <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
                </button>
              )}
              {/* Mobile Search Toggle */}
              <button
                onClick={() => setIsMobileSearchOpen(true)}
                className={`md:hidden p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
              >
                <Search size={18} />
              </button>
              {/* Search Bar */}
              <div className="relative hidden md:block">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} size={18} />
                <input
                  type="text"
                  placeholder="Search tasks, people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-64 md:w-80 border rounded-lg pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${
                    isDarkMode
                      ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-400'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-500'
                  }`}
                />
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 md:p-8 min-h-screen">
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