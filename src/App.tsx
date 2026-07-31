import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAppModals } from './hooks/useAppModals';
import { useDatabase } from './hooks/useDatabase';
import { useTaskOperations } from './hooks/useTaskOperations';
import { useUserOperations } from './hooks/useUserOperations';
import { useTeamOperations } from './hooks/useTeamOperations';
import { useTemplateOperations } from './hooks/useTemplateOperations';
import { useTaskMetrics } from './hooks/useTaskMetrics';
import { getAllSubordinates } from './utils/userUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from './utils/logger';
import { ROLE, isAdminLevel } from './constants/status';
import {
  INITIAL_USERS,
  INITIAL_TEAMS,
  INITIAL_TEMPLATES,
  INITIAL_TASKS,
  INITIAL_REPORTS,
  INITIAL_FOLLOWUPS,
  INITIAL_SETTINGS
} from './initialData';
import { User, Team, TaskTemplate, Task, TaskReport, FollowUp, AppSetting, TaskStatus, SystemAlert, Subtask, Comment, TeamSubmission } from './types/index';
import { dbService, initializeDatabase, setOfflineSaveNotification } from './lib/dbService';
import { initAuth, sheetsApi } from './lib/sheetsService';
import { checkAndGenerateRecurringTasks, evaluateOverdueTasks } from './lib/taskEngine';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useAuth } from './contexts/AuthContext';
import { useTheme } from './contexts/ThemeContext';
import { changePassword } from './api/auth';
import { triggerReportSubmissionEmail, triggerTaskClosureEmail } from './api/emailTrigger';
import { useGmailStatus } from './hooks/useGmailStatus';
import { getVisibleSubTeamIds } from './utils/subTeamUtils';
import InstallBanner from './components/InstallBanner';
import OfflineBanner from './components/OfflineBanner';
import UpdateBanner from './components/UpdateBanner';
import { approveUser } from './api/auth';

// Icons
import {
  ClipboardList,
  Layers,
  Repeat,
  Shield,
  Code2,
  TrendingUp,
  AlertOctagon,
  CheckCircle,
  CheckSquare,
  Clock,
  UserCheck,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Calendar,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Menu,
  Sparkles,
  Info,
  LogOut,
  FileText,
  AlertTriangle,
  Mail,
  Lock,
  X
} from 'lucide-react';

// Components
import Spinner from './components/ui/Spinner';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardSkeleton from './components/DashboardSkeleton';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ROUTES } from './constants/routes';
import MainLayout from './components/layout/MainLayout';

// TECH-DEBT: Main bundle still 407kb (gzip 127kb). Run
// npx vite-bundle-visualizer and inspect index chunk for
// large deps that could be lazy loaded or replaced.

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const ScheduledReportsPage = lazy(() => import('./pages/ScheduledReportsPage'));
const SchedulesPage = lazy(() => import('./pages/SchedulesPage'));

// Lazy load modal components
const CreateTaskModal = lazy(() => import('./components/CreateTaskModal'));
const CreateReportModal = lazy(() => import('./components/CreateReportModal'));
const FollowUpModal = lazy(() => import('./components/FollowUpModal'));
const TaskDrawer = lazy(() => import('./components/features/tasks/TaskDrawer'));
const EditProfileModal = lazy(() => import('./components/EditProfileModal'));
const ChangePasswordModal = lazy(() => import('./components/ChangePasswordModal'));
const ConfigureNotificationsModal = lazy(() => import('./components/ConfigureNotificationsModal'));
const AddUserModal = lazy(() => import('./components/features/admin/AddUserModal'));
const AddTeamModal = lazy(() => import('./components/features/tasks/AddTeamModal'));


export default function App() {
  const { isDarkMode } = useTheme();

  // Database States loaded from LocalStorage - MUST be called before any conditional logic
  const {
    users,
    setUsers,
    tasks,
    setTasks,
    teams,
    setTeams,
    subTeams,
    setSubTeams,
    templates,
    setTemplates,
    audits,
    setAudits,
    settings,
    setSettings,
    reports,
    setReports,
    followUps,
    setFollowUps,
    subtasks,
    setSubtasks,
    comments,
    setComments,
    emailTemplates,
    setEmailTemplates,
    teamSubmissions,
    setTeamSubmissions,
    isLoading: dbIsLoading,
    dbConnectionStatus,
    isSyncing: dbIsSyncing,
    lastSyncTime,
    syncStatus,
    databaseSwitchMessage,
    loadDatabase,
    syncDatabase,
    silentSync,
  } = useDatabase(false); // Will be reloaded when auth initializes

  // Real-time sync â€” invalidates React Query cache on SSE events
  const { token, isAuthenticated, isLoading: authIsLoading } = useAuth();
  useRealtimeSync(token);

  // Active Simulated Session email state
  const [activeUserEmail, setActiveUserEmail] = useState<string>(() => {
    return localStorage.getItem('PMS_active_user_email') || '';
  });
  const [activeUser, setActiveUser] = useState<User | null>(null);

  // Check whether the active user has a connected Gmail account.
  // Used to gate email sends and show a connect-prompt before any send is attempted.
  const { isConnected: gmailConnected, connectGmail, recheckStatus: recheckGmailStatus } = useGmailStatus(activeUser?.Email);

  // Gmail integration state for SettingsPage
  const [gmailLoading, setGmailLoading] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleConnectGmail = async () => {
    setGmailLoading(true);
    try {
      await connectGmail();
    } catch (error) {
      setConnectionMessage({ type: 'error', text: 'Failed to connect Gmail' });
    } finally {
      setGmailLoading(false);
    }
  };

  const handleDisconnectGmail = async () => {
    setGmailLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/gmail/disconnect', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setConnectionMessage({ type: 'success', text: 'Gmail disconnected successfully' });
        await recheckGmailStatus();
      } else {
        setConnectionMessage({ type: 'error', text: 'Failed to disconnect Gmail' });
      }
    } catch (error) {
      setConnectionMessage({ type: 'error', text: 'Failed to disconnect Gmail' });
    } finally {
      setGmailLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('PMS_active_user_email');
    localStorage.removeItem('PMS_auth_token');
    localStorage.removeItem('PMS_user');
    setActiveUserEmail('');
    setActiveUser(null);
    navigate(ROUTES.LOGIN);
  };

  // React Router hooks for navigation
  const navigate = useNavigate();
  const location = useLocation();

  // Automated notification center state
  const [notifications, setNotifications] = useState<SystemAlert[]>([]);

  // Dispatches a simulated alert and email log
  const triggerNotification = (
    type: 'Delay Alert' | 'ETA Breach' | 'Task Assignment' | 'Progress Update',
    message: string,
    emailSentTo: string
  ) => {
    const alert: SystemAlert = {
      ID: `NT-${Math.floor(1000 + Math.random() * 8999)}`,
      Type: type,
      Message: message,
      EmailSentTo: emailSentTo || 'system@be-project.live',
      Timestamp: new Date().toISOString()
    };
    setNotifications(prev => {
      // Prevent duplicates in short sessions
      if (prev.some(p => p.Message === message)) return prev;
      return [alert, ...prev];
    });
  };

  // Send invite email for new user accounts
  const handleSendInviteEmail = (email: string, fullName: string, role: string) => {
    const inviteMessage = `Welcome to PMS! Your account has been created as ${role}. You can now log in with your credentials.`;
    triggerNotification('Task Assignment', inviteMessage, email);
  };

  // Replaces email template tokens with actual task details
  const formatEmailTemplate = (
    key: 'template_assigned_email' | 'template_delayed_email',
    task: Partial<Task>
  ): string => {
    const rawTemplate = settings.find(s => s.Key === key)?.Value || "";
    if (!rawTemplate) {
      if (key === 'template_assigned_email') {
        return `NEW TASK ASSIGNED: Task ${task.TaskID} ("${task.Title}") assigned to ${task.AssignedToEmail || 'assigned_owner@be.com'}. Scheduled due: ${task.DueDate}.`;
      } else {
        const titleShort = task.Title && task.Title.length > 25 ? task.Title.substring(0, 25) + '...' : (task.Title || '');
        return `DELAY ALERT: Task ${task.TaskID} ("${titleShort}") is Overdue! Due date was ${task.DueDate}.`;
      }
    }

    // Helper to get user name from email
    const getUserName = (email: string | undefined): string => {
      if (!email) return '';
      const user = users.find(u => u.Email === email);
      return user?.FullName || email;
    };

    return rawTemplate
      .replace(/{TaskID}/g, task.TaskID || '')
      .replace(/{Title}/g, task.Title || '')
      .replace(/{Description}/g, task.Description || '')
      .replace(/{Priority}/g, task.Priority || '')
      .replace(/{DueDate}/g, task.DueDate || '')
      .replace(/{AssignedToEmail}/g, task.AssignedToEmail || '')
      .replace(/{AssignedByEmail}/g, task.AssignedByEmail || '')
      .replace(/{AssignedToName}/g, getUserName(task.AssignedToEmail))
      .replace(/{AssignedByName}/g, getUserName(task.AssignedByEmail));
  };

  // Trigger Local Recurrence simulated load state
  const [isSimulatingRecurrence, setIsSimulatingRecurrence] = useState(false);

  // Dialog controlling states
  const {
    selectedTask,
    setSelectedTask,
    isDrawerOpen,
    setIsDrawerOpen,
    isTaskModalOpen,
    setIsTaskModalOpen,
    isReportModalOpen,
    setIsReportModalOpen,
    isFollowUpModalOpen,
    setIsFollowUpModalOpen,
    expandedTaskId,
    setExpandedTaskId,
    isEditProfileModalOpen,
    setIsEditProfileModalOpen,
    isChangePasswordModalOpen,
    setIsChangePasswordModalOpen,
    isConfigureNotificationsModalOpen,
    setIsConfigureNotificationsModalOpen,
    isAddUserModalOpen,
    setIsAddUserModalOpen,
    isAddTeamModalOpen,
    setIsAddTeamModalOpen,
    preSelectedAssignee,
    setPreSelectedAssignee,
    preSelectedTeamIDs,
    setPreSelectedTeamIDs,
  } = useAppModals();

  // Tasks Board Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterScope, setFilterScope] = useState<'all_visible' | 'assigned_to_me' | 'created_by_me' | 'assigned_by_me'>('all_visible');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterAssigneeNames, setFilterAssigneeNames] = useState<string[]>([]);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [simulationMessage, setSimulationMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  
  // Task view tabs
  const [taskViewTab, setTaskViewTab] = useState<'active' | 'history'>('active');
  
  // Helper function to get current local date in YYYY-MM-DD format
  const getCurrentLocalDate = (): string => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Helper function to get tomorrow's date in YYYY-MM-DD format
  const getTomorrowDate = (): string => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Collapsible sidebar state using localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('PMS_sidebar_collapsed') === 'true';
  });

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [newProfilePassword, setNewProfilePassword] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  const handleUpdatePassword = async (oldPassword: string, newPassword: string) => {
    if (!activeUser) return;
    try {
      const result = await changePassword({ oldPassword, newPassword });
      if (result.success) {
        await dbService.logAction('User', activeUser.UserID, 'Password/Security Code changed by User via Profile', activeUser.Email, null, { email: activeUser.Email });
        setPasswordChangeSuccess(true);
        setTimeout(() => {
          setPasswordChangeSuccess(false);
          setIsEditingPassword(false);
        }, 2500);
      } else {
        throw new Error(result.message || 'Failed to change password');
      }
    } catch (error) {
      logger.error('Password change error:', error);
      throw error;
    }
  };

  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);

  // Google Sheets database state triggers
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState<string | null>(null);

  // Initialize Google Sheets authentication on mount (for Sheets API access only)
  useEffect(() => {
    const cleanup = initAuth(
      (token) => {
        logger.log('Google Sheets authentication successful');
        setIsSheetsConnected(true);
      },
      (error) => {
        logger.error('Google Sheets authentication failed:', error);
        setIsSheetsConnected(false);
      }
    );
    return cleanup;
  }, []);


  // Reload database when Firebase auth initializes
  useEffect(() => {
    if (!authIsLoading && isAuthenticated) {
      loadDatabase();
    }
  }, [authIsLoading, isAuthenticated]);

  // Wire up offline save notification callback
  useEffect(() => {
    setOfflineSaveNotification((message: string) => {
      setSimulationMessage({ type: 'info', text: message });
    });
  }, []);

  // Debug logging to identify email mismatches
  useEffect(() => {
    if (tasks.length > 0 && activeUser) {
      // Debug logging removed
    }
  }, [tasks, activeUser]);

  // Simple debounce function
  function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return function executedFunction(...args: Parameters<T>) {
      const later = () => {
        timeout = null;
        func(...args);
      };
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Debounce search query with 300ms delay
  useEffect(() => {
    const debounced = debounce(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    debounced();
    return () => clearTimeout(debounced as any);
  }, [searchQuery]);

  // Manual sync function for AdminPanel - use silent sync to avoid blocking UI
  const handleManualSync = async () => {
    await silentSync();
  };

  // 2. Track Active User Session adaptation
  useEffect(() => {
    if (users.length > 0) {
      const found = users.find(u => u.Email === activeUserEmail);
      if (found) {
        // Always trust the Role from the login JWT (stored in PMS_user) rather than
        // the Firestore users array, which may be stale or have a different value.
        // This prevents a re-render after loadDatabase() from downgrading the role.
        const storedUser = localStorage.getItem('PMS_user');
        let loginRole: string | undefined;
        try {
          if (storedUser) {
            const parsed = JSON.parse(storedUser);
            const storedEmail = (parsed.Email || parsed.email || '').toLowerCase();
            if (storedEmail === activeUserEmail?.toLowerCase()) {
              loginRole = parsed.Role || parsed.role;
            }
          }
        } catch (_) { /* ignore */ }

        const resolvedUser = loginRole ? { ...found, Role: loginRole as typeof found.Role } : found;

        setActiveUser(resolvedUser);
        // Force redirect to Dashboard when switching credentials to prevent scoping bugs
        if (resolvedUser.Role === ROLE.SUB_STAKEHOLDER && location.pathname === ROUTES.ADMIN) {
          navigate(ROUTES.DASHBOARD);
        }
      } else if (activeUserEmail) {
        // If user not found in local array but email is set, try to load from localStorage
        const storedUser = localStorage.getItem('PMS_user');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            if (parsedUser.Email === activeUserEmail || parsedUser.email === activeUserEmail) {
              const normalizedUser = {
                ...parsedUser,
                Email: parsedUser.Email || parsedUser.email || activeUserEmail,
                TeamIDs: parsedUser.TeamIDs ? (Array.isArray(parsedUser.TeamIDs) ? parsedUser.TeamIDs : [parsedUser.TeamIDs]) : (parsedUser.TeamID ? [parsedUser.TeamID] : []),
                TeamNames: parsedUser.TeamNames ? (Array.isArray(parsedUser.TeamNames) ? parsedUser.TeamNames : [parsedUser.TeamNames]) : (parsedUser.TeamName ? [parsedUser.TeamName] : []),
                TeamID: parsedUser.TeamID || (parsedUser.TeamIDs && parsedUser.TeamIDs.length > 0 ? (Array.isArray(parsedUser.TeamIDs) ? parsedUser.TeamIDs[0] : parsedUser.TeamIDs) : ''),
                TeamName: parsedUser.TeamName || (parsedUser.TeamNames && parsedUser.TeamNames.length > 0 ? (Array.isArray(parsedUser.TeamNames) ? parsedUser.TeamNames[0] : parsedUser.TeamNames) : '')
              };
              setActiveUser(normalizedUser);
              // Add user to local users array if not present
              setUsers(prev => [...prev, normalizedUser]);
            }
          } catch (e) {
            logger.error('Failed to parse stored user:', e);
          }
        }
      }
    }
  }, [activeUserEmail, users, location.pathname, navigate]);

  // (Early returns moved to the bottom of the hooks section to satisfy Rules of Hooks)

  // Helpers to push state updates safely with durable persistence
  const logAudit = async (entityType: string, entityId: string, action: string, oldVal = '', newVal = '') => {
    // Audit logging disabled
  };

  // Rule 1: Task visibility filters depending on Role
  const getVisibleTasks = () => {
    return visibleTasks;
  };

  const getOverdueAndSoonTasks = () => {
    return { overdue, soon };
  };

  const getFilteredTasks = () => {
    if (!activeUser) return [];
    const today = new Date();
    today.setHours(0,0,0,0);

    // Get hierarchical subordinates for stakeholders
    const subordinateEmails = activeUser.Role === ROLE.STAKEHOLDER 
      ? getAllSubordinates(activeUser.Email, users)
      : [];

    // Get visible sub-team IDs for Sub-Team Leader visibility
    const visibleSubTeamIds = getVisibleSubTeamIds(activeUser, subTeams);

    const visible = (tasks || []).map(task => {
      // Dynamically derive Overdue state
      if (task.Status !== 'Closed' && task.Status !== 'Reviewed') {
        const dueDate = new Date(task.DueDate);
        dueDate.setHours(0,0,0,0);
        if (dueDate < today) {
          return { ...task, Status: 'Overdue' as TaskStatus };
        }
      }
      return task;
    }).filter(task => {
      // Role scope filter - Admins see everything, including inactive or deleted tasks
      if (isAdminLevel(activeUser.Role)) return true;

      if (!task.Active) return false;
      if (task.DeletedAt) return false;

      const assignees = (task.AssignedToEmail || '').split(',').map(e => e.trim().toLowerCase());
      const isAssignee = assignees.includes(activeUser.Email?.toLowerCase() || '');

      if (activeUser.Role === ROLE.STAKEHOLDER) {
        // Stakeholders see tasks assigned to them, by them, or to their hierarchical subordinates
        const hasSubordinateAssignee = assignees.some(email => 
          subordinateEmails.includes(email)
        );
        return isAssignee || task.AssignedByEmail?.toLowerCase() === activeUser.Email?.toLowerCase() || hasSubordinateAssignee;
      }
      if (activeUser.Role === ROLE.SUB_STAKEHOLDER) {
        // Sub-stakeholders see tasks assigned to them
        // Additionally, if they are a Sub-Team Leader, they see tasks for their sub-team members
        if (visibleSubTeamIds.length > 0) {
          // Check if task assignee is in any of the visible sub-teams
          const assigneeUser = users.find(u => assignees.includes(u.Email?.toLowerCase() || ''));
          if (assigneeUser && assigneeUser.SubTeamIDs) {
            const hasVisibleSubTeam = assigneeUser.SubTeamIDs.some(stId => visibleSubTeamIds.includes(stId));
            if (hasVisibleSubTeam) return true;
          }
        }
        return isAssignee;
      }
      return false;
    });

    return visible;
  };

  // useMemo: tasks list can be large, filter is O(n)
  const filteredTasks = useMemo(() => {
    if (!activeUser) return [];
    // Pre-build email-to-name map for O(1) assignee name lookup (was O(users) per task)
    const emailToNameMap = new Map(
      users.map(u => [u.Email?.toLowerCase() || '', u.FullName])
    );
    // FIX: Task has TeamID but no TeamName field — look the name up from `teams`
    // instead of referencing a property that doesn't exist on Task.
    const teamIdToNameMap = new Map(
      teams.map(t => [t.TeamID, t.TeamName])
    );
    return getFilteredTasks().filter(task => {
    const assignees = (task.AssignedToEmail || '').split(',').map(e => e.trim());
    const assigneeNames = assignees.map(email => {
      return emailToNameMap.get(email.toLowerCase()) || email;
    }).join(', ');

    // Text search - case-insensitive across all required fields
    const searchLower = debouncedSearchQuery.toLowerCase();
    const matchesSearch = !debouncedSearchQuery || (
      (task.Title?.toLowerCase().includes(searchLower) || false) ||
      (task.TaskID?.toLowerCase().includes(searchLower) || false) ||
      (task.AssignedToEmail?.toLowerCase().includes(searchLower) || false) ||
      (task.AssignedByEmail?.toLowerCase().includes(searchLower) || false) ||
      (task.Description?.toLowerCase().includes(searchLower) || false) ||
      (task.TeamID?.toLowerCase().includes(searchLower) || false) ||
      (teamIdToNameMap.get(task.TeamID || '')?.toLowerCase().includes(searchLower) || false) ||
      (assigneeNames.toLowerCase().includes(searchLower) || false)
    );

    // Assignation Tab
    const isAssignee = assignees.map(e => e.toLowerCase()).includes(activeUser.Email?.toLowerCase() || '');
    let matchesScope = true;
    if (filterScope === 'assigned_to_me') {
      matchesScope = isAssignee;
    } else if (filterScope === 'created_by_me') {
      matchesScope = task.AssignedByEmail === activeUser.Email;
    } else if (filterScope === 'assigned_by_me') {
      matchesScope = task.AssignedByEmail === activeUser.Email;
    }

    // Secondary Dropdowns
    const matchesStatus = filterStatus === 'All' || task.Status === filterStatus;
    const matchesPriority = filterPriority === 'All' || task.Priority === filterPriority;
    const matchesType = filterType === 'All' || task.TaskType === filterType;
    const matchesAssigneeSearch = filterAssigneeNames.length === 0 || 
      filterAssigneeNames.some(email => assignees.includes(email));

    return matchesSearch && matchesScope && matchesStatus && matchesPriority && matchesType && matchesAssigneeSearch;
    });
  }, [tasks, users, activeUser, debouncedSearchQuery, filterScope, filterStatus, filterPriority, filterType, filterAssigneeNames]);

  // Task operations hook
  const {
    handleCreateTaskOrTemplate,
    handleCloseTask,
    handleUpdateTask,
    handleCreateFollowUp,
    handleAddSubtask,
    handleToggleSubtask,
    handleDeleteSubtask,
    handleAddComment,
    handleDeleteTask,
    runSimulatedRecurrenceEngine,
  } = useTaskOperations({
    tasks,
    users,
    currentUser: activeUser,
    subTeams,
    syncDatabase: loadDatabase,
    silentSync,
    selectedTask,
    setSelectedTask,
    triggerNotification,
    formatEmailTemplate,
    logAudit,
    setIsSimulatingRecurrence,
    setSimulationMessage,
    setSubtasks,
    subtasks,
    gmailConnected,
    connectGmail,
  });

  // User operations hook
  const {
    handleUpdateUserTeams,
    handleAddUser,
    handleToggleUserStatus,
    handleApproveUser,
    handleUpdateUserRole,
  } = useUserOperations({
    users,
    teams,
    syncDatabase: loadDatabase,
    silentSync,
    logAudit,
  });

  // Team operations hook
  const { handleDeleteTeam, handleRenameTeam } = useTeamOperations({
    teams,
    users,
    syncDatabase: loadDatabase,
    silentSync,
    logAudit,
  });

  // Task metrics hook
  const {
    visibleTasks,
    overdue,
    soon,
    metricActiveTasks,
    metricOverdue,
    metricDueToday,
    metricCompletedThisWeek,
    metricFollowUps,
  } = useTaskMetrics({
    tasks,
    followUps,
    filters: {
      search: searchQuery,
      category: filterCategory,
      status: filterStatus,
      priority: filterPriority,
    },
    currentView: filterScope === 'assigned_to_me' ? 'my-tasks' : filterScope === 'created_by_me' ? 'assigned-by-me' : 'all',
    activeUser: activeUser || { Role: '', Email: '', TeamIDs: [], TeamNames: [] },
    users,
  });

  // useMemo: reports list can be large, filter and sort is O(n)
  const getVisibleReports = useMemo(() => {
    {/* PERF-CHECK: if list exceeds 50 items, add @tanstack/react-virtual */}
    const visibleTaskIds = new Set(visibleTasks.map(t => t.TaskID));
    return reports
      .filter(r => visibleTaskIds.has(r.TaskID))
      .sort((a, b) => new Date(b.CreatedAt || b.ReportDate).getTime() - new Date(a.CreatedAt || a.ReportDate).getTime());
  }, [visibleTasks, reports]);

  // Template operations hook
  const {
    handleAddTemplate,
    handleToggleTemplateStatus,
  } = useTemplateOperations({
    templates,
    syncDatabase: loadDatabase,
    silentSync,
    logAudit,
  });

  const handleSubmitProgressReport = async (data: any) => {
    const propId = `RP-${Math.floor(1000 + Math.random() * 8999)}`;
    const nowStr = new Date().toISOString();


    const newReport: TaskReport = {
      ReportID: propId,
      TaskID: data.TaskID,
      SubtaskID: data.SubtaskID || '',
      SubmittedByEmail: activeUser.Email,
      ReportDate: nowStr.split('T')[0],
      StatusUpdate: data.StatusUpdate,
      WorkSummary: data.WorkSummary,
      PercentComplete: data.PercentComplete,
      Blockers: data.Blockers,
      NextAction: data.NextAction,
      AttachmentLink: data.AttachmentLink || '',
      CreatedAt: nowStr
    };


    const targetTask = tasks.find(t => t.TaskID === data.TaskID);
    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        Status: data.StatusUpdate,
        PercentComplete: Number(data.PercentComplete),
        LastReportSummary: data.WorkSummary,
        AttachmentLink: data.AttachmentLink || targetTask.AttachmentLink,
        CompletionDate: data.StatusUpdate === 'Closed' ? nowStr.split('T')[0] : targetTask.CompletionDate,
        CloseRemark: data.StatusUpdate === 'Closed' ? data.WorkSummary : targetTask.CloseRemark,
        UpdatedAt: nowStr
      };

      await dbService.saveReport(newReport);
      await dbService.saveTask(updatedTask);

      triggerNotification(
        'Progress Update',
        `PROGRESS REGISTERED: Task ${targetTask.TaskID} ("${targetTask.Title}") progress report submitted. Status: "${data.StatusUpdate}".`,
        `${targetTask.AssignedByEmail}, ${targetTask.AssignedToEmail}`
      );

      try {
        if (!gmailConnected) {
          // Sender's Gmail not connected — show prompt instead of a silent send failure
          setSimulationMessage({
            type: 'error',
            text: `Gmail not connected for ${activeUser.Email}. Connect your Gmail account in Settings → Gmail to send report and closure emails.`,
          });
          connectGmail().catch(() => {});
        } else {
          // Use typed API wrappers — fire-and-forget
          triggerReportSubmissionEmail({
            submitterEmail: activeUser.Email,
            allocatorEmail: targetTask.AssignedByEmail,
            task: {
              TaskID: targetTask.TaskID,
              Title: targetTask.Title,
              Description: targetTask.Description,
            },
            reportContent: data.WorkSummary,
          }).catch(err => logger.error('Failed to trigger report email:', err));

          if (data.StatusUpdate === 'Closed') {
            triggerTaskClosureEmail({
              closedByEmail: activeUser.Email,
              assignedToEmail: targetTask.AssignedToEmail,
              allocatorEmail: targetTask.AssignedByEmail,
              task: updatedTask,
              closeRemark: data.WorkSummary,
            }).catch(err => logger.error('Failed to trigger closure email:', err));
          }
        }
      } catch (err) {
        logger.error('Failed to trigger report email:', err);
      }

      if (selectedTask && selectedTask.TaskID === data.TaskID) {
        setSelectedTask(updatedTask);
      }
    }

    await logAudit('Report', propId, 'Published Progress Report', '', JSON.stringify({ TaskID: data.TaskID, Status: data.StatusUpdate }));
    // Trigger sync after action
    handleManualSync();
    setIsReportModalOpen(false);
    setIsDrawerOpen(false);
    setSelectedTask(null);
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    const updated = settings.map(s => {
      if (s.Key === key) {
        return { ...s, Value: value };
      }
      return s;
    });
    setSettings(updated);
    await dbService.saveSettings(updated);
    await logAudit('Settings', key, `Update Config Parameter`, '', value);
    // SSE will handle sync automatically - no need to reload database
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'Not Started': return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
      case 'In Progress': return 'bg-[#DBEAFE] text-[#1E40AF] border-[#BFDBFE]';
      case 'Submitted': return 'bg-[#F3E8FF] text-[#6B21A7] border-[#E9D5FF]';
      case 'Closed': return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
      case 'Overdue': return 'bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C] animate-pulse font-bold';
      default: return 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]';
    }
  };

  if (dbIsLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="min-h-screen flex flex-col font-sans antialiased bg-app text-primary">
      
      {/* PWA Banners */}
      <InstallBanner />
      <OfflineBanner />
      <UpdateBanner />

      {/* Dynamic Toast Notification (Non-blocking alert replacement) */}
      <AnimatePresence>
        {simulationMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-5 right-5 z-[9999] max-w-sm w-full border shadow-2xl rounded-2xl p-4 flex gap-3 text-xs font-semibold leading-relaxed bg-surface border-token"
          >
            <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              simulationMessage.type === 'success' ? 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)]' :
              simulationMessage.type === 'error' ? 'bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]' : 'bg-[var(--color-info-bg)] text-[var(--color-info-fg)]'
            }`}>
              {simulationMessage.type === 'success' ? <CheckCircle size={14} /> :
               simulationMessage.type === 'error' ? <AlertTriangle size={14} /> : <Info size={14} />}
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-bold text-primary">
                {simulationMessage.type === 'success' ? 'Success Alert' :
                 simulationMessage.type === 'error' ? 'System Error' : 'System Information'}
              </div>
              <p className="leading-snug text-secondary">{simulationMessage.text}</p>
            </div>
            <button
              onClick={() => setSimulationMessage(null)}
              className="ml-1 p-1 rounded-lg transition-all h-6 w-6 flex items-center justify-center shrink-0 border-none cursor-pointer text-muted hover:text-secondary hover-surface"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
        {databaseSwitchMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-5 right-5 z-[9999] max-w-sm w-full border shadow-2xl rounded-2xl p-4 flex gap-3 text-xs font-semibold leading-relaxed bg-surface border-token"
          >
            <div className="mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 bg-[var(--color-warning-bg)] text-[var(--color-warning-fg)]">
              <AlertTriangle size={14} />
            </div>
            <div className="flex-1 space-y-1">
              <div className="font-bold text-primary">Database Status</div>
              <p className="leading-snug text-secondary">{databaseSwitchMessage}</p>
            </div>
            <button
              onClick={() => {
                // Clear the message by forcing a re-render
                // The hook will auto-clear after timeout
              }}
              className="ml-1 p-1 rounded-lg transition-all h-6 w-6 flex items-center justify-center shrink-0 border-none cursor-pointer text-muted hover:text-secondary hover-surface"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Routes>
        {/* Public route - Login */}
        <Route
          path={ROUTES.LOGIN}
          element={
            <Suspense fallback={<Spinner size="lg" />}>
              <LoginPage
                usersList={users}
                onLoginSuccess={(email, user) => {
                  const normalizedUser = {
                    ...user,
                    Email: user.Email || (user as any).email || email,
                    TeamIDs: user.TeamIDs ? (Array.isArray(user.TeamIDs) ? user.TeamIDs : [user.TeamIDs]) : (user.TeamID ? [user.TeamID] : []),
                    TeamNames: user.TeamNames ? (Array.isArray(user.TeamNames) ? user.TeamNames : [user.TeamNames]) : (user.TeamName ? [user.TeamName] : []),
                    TeamID: user.TeamID || (user.TeamIDs && user.TeamIDs.length > 0 ? (Array.isArray(user.TeamIDs) ? user.TeamIDs[0] : user.TeamIDs) : ''),
                    TeamName: user.TeamName || (user.TeamNames && user.TeamNames.length > 0 ? (Array.isArray(user.TeamNames) ? user.TeamNames[0] : user.TeamNames) : '')
                  };
                  localStorage.setItem('PMS_active_user_email', email);
                  localStorage.setItem('PMS_user', JSON.stringify(normalizedUser));
                  setActiveUserEmail(email);
                  setActiveUser(normalizedUser);
                  // Add user to local users array if not present
                  setUsers(prev => {
                    if (!prev.find(u => u.Email === email)) {
                      return [...prev, normalizedUser];
                    }
                    return prev;
                  });
                  // Navigate to dashboard after successful login
                  navigate(ROUTES.DASHBOARD);
                }}
              />
            </Suspense>
          }
        />

        {/* Root redirect - if authenticated go to dashboard, else login */}
        <Route
          path={ROUTES.ROOT}
          element={
            activeUser ? (
              <Navigate to={ROUTES.DASHBOARD} replace />
            ) : (
              <Navigate to={ROUTES.LOGIN} replace />
            )
          }
        />

        {/* Protected routes */}
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <ErrorBoundary
                  fallback={
                    <div className="flex items-center justify-center h-64 
                                    text-gray-500 dark:text-gray-400">
                      This section failed to load. 
                      <button onClick={() => window.location.reload()} 
                              className="ml-2 text-blue-600 underline">
                        Reload
                      </button>
                    </div>
                  }
                >
                  <Suspense fallback={<Spinner size="lg" />}>
                    <DashboardPage
        tasks={getVisibleTasks()}
        currentUser={activeUser}
        onNewTask={(assigneeEmail, teamIds) => {
          setPreSelectedAssignee(assigneeEmail);
          setPreSelectedTeamIDs(teamIds);
          setIsTaskModalOpen(true);
        }}
        onTaskClick={(task) => {
          setSelectedTask(task);
          setIsDrawerOpen(true);
        }}
        onLogout={() => {
          localStorage.removeItem('PMS_active_user_email');
          localStorage.removeItem('PMS_auth_token');
          localStorage.removeItem('PMS_user');
          setActiveUserEmail('');
          setActiveUser(null);
          navigate(ROUTES.LOGIN);
        }}
        templates={templates}
        users={users}
        audits={audits}
        settings={settings}
        emailTemplates={emailTemplates}
        teams={teams}
        subTeams={subTeams}
        reports={reports}
        teamSubmissions={teamSubmissions}
        syncStatus={syncStatus}
        isDrawerOpen={isDrawerOpen}
        isTaskModalOpen={isTaskModalOpen}
        isReportModalOpen={isReportModalOpen}
        isFollowUpModalOpen={isFollowUpModalOpen}
        isEditProfileModalOpen={isEditProfileModalOpen}
        isChangePasswordModalOpen={isChangePasswordModalOpen}
        isConfigureNotificationsModalOpen={isConfigureNotificationsModalOpen}
        isAddUserModalOpen={isAddUserModalOpen}
        isAddTeamModalOpen={isAddTeamModalOpen}
        onAddUser={async (userData) => {
          try {
            // Hash password before saving to ensure it's never stored in plaintext
            const bcrypt = await import('bcrypt');
            const hashedPassword = await bcrypt.hash(userData.Password || '', 12);
            const userDataWithHashedPassword = {
              ...userData,
              Password: hashedPassword
            };
            await dbService.saveUser(userDataWithHashedPassword);
            // Trigger sync after action
            handleManualSync();
          } catch (error) {
            throw error;
          }
        }}
        onAddTemplate={async (templateData) => {
          try {
            await dbService.saveTemplate(templateData);
            // Trigger sync after action
            handleManualSync();
          } catch (error) {
            throw error;
          }
        }}
        onToggleTemplateStatus={async (templateId) => {
          try {
            const template = templates.find(t => t.TemplateID === templateId);
            if (template) {
              await dbService.saveTemplate({ ...template, Active: !template.Active });
              // Trigger sync after action
              handleManualSync();
            }
          } catch (error) {
            throw error;
          }
        }}
        onAddTeam={async (teamData) => {
          try {
            await dbService.saveTeam(teamData);
            await logAudit('Team', teamData.TeamID, 'Created Team', '', JSON.stringify(teamData));
            // Trigger sync after action
            handleManualSync();
          } catch (error) {
            throw error;
          }
        }}
        onSaveSubTeam={async (subTeam) => {
          try {
            await dbService.saveSubTeam(subTeam);
          } catch (error) {
            throw error;
          }
        }}
        onDeleteSubTeam={async (subTeamId) => {
          try {
            await dbService.deleteSubTeam(subTeamId);
            // Remove subTeamId from SubTeamIDs array for any users that belonged to this sub-team.
            const affected = users.filter(u => u.SubTeamIDs?.includes(subTeamId));
            for (const u of affected) {
              const newSubTeamIDs = (u.SubTeamIDs || []).filter(id => id !== subTeamId);
              const newSubTeamNames = (u.SubTeamNames || []).filter((_, idx) => u.SubTeamIDs?.[idx] !== subTeamId);
              await dbService.saveUser({ 
                ...u, 
                SubTeamIDs: newSubTeamIDs, 
                SubTeamNames: newSubTeamNames 
              } as User);
            }
          } catch (error) {
            throw error;
          }
        }}
        onUpdateSubTeamLeaders={async (teamId, subTeamId, leaderEmails) => {
          try {
            const key = `team_${teamId}_subteam_${subTeamId}_leaders`;
            const settingExists = settings.some(s => s.Key === key);
            const updatedSettings = settingExists
              ? settings.map(s => (s.Key === key ? { ...s, Value: leaderEmails.join(',') } : s))
              : [...settings, { Key: key, Value: leaderEmails.join(',') }];
            setSettings(updatedSettings);
            await dbService.saveSettings(updatedSettings);
            // Update local subTeams state so the modal reflects new leaders immediately
            setSubTeams(prev => prev.map(st =>
              st.SubTeamID === subTeamId ? { ...st, SubTeamLeaderEmails: leaderEmails } : st
            ));
          } catch (error) {
            throw error;
          }
        }}
        onAssignUserToSubTeam={async (userEmail, subTeamId, subTeamName) => {
          try {
            const user = users.find(u => u.Email === userEmail);
            if (user) {
              // Multi-membership: add to arrays
              const currentSubTeamIDs = user.SubTeamIDs || [];
              const currentSubTeamNames = user.SubTeamNames || [];

              if (subTeamId && subTeamName) {
                // Add to sub-team (if not already present)
                if (!currentSubTeamIDs.includes(subTeamId)) {
                  await dbService.saveUser({
                    ...user,
                    SubTeamIDs: [...currentSubTeamIDs, subTeamId],
                    SubTeamNames: [...currentSubTeamNames, subTeamName],
                  } as User);
                }
              }
            }
          } catch (error) {
            throw error;
          }
        }}
        onRemoveUserFromSubTeam={async (userEmail, subTeamId) => {
          try {
            const user = users.find(u => u.Email === userEmail);
            if (user) {
              // Remove only the specified subTeamId from the user's SubTeamIDs array
              const currentSubTeamIDs = user.SubTeamIDs || [];
              const currentSubTeamNames = user.SubTeamNames || [];

              const subTeamIndex = currentSubTeamIDs.indexOf(subTeamId);
              if (subTeamIndex !== -1) {
                const newSubTeamIDs = currentSubTeamIDs.filter(id => id !== subTeamId);
                const newSubTeamNames = currentSubTeamNames.filter((_, i) => i !== subTeamIndex);
                await dbService.saveUser({
                  ...user,
                  SubTeamIDs: newSubTeamIDs,
                  SubTeamNames: newSubTeamNames,
                } as User);
              }
            }
          } catch (error) {
            throw error;
          }
        }}
        onToggleTeamStatus={async (teamId) => {
          try {
            await dbService.toggleTeamStatus(teamId);
            // Trigger sync after action
            handleManualSync();
          } catch (error) {
            throw error;
          }
        }}
        onUpdateSetting={async (key, value) => {
          try {
            const settingExists = settings.some(s => s.Key === key);
            const updatedSettings = settingExists
              ? settings.map(s => (s.Key === key ? { ...s, Value: value } : s))
              : [...settings, { Key: key, Value: value }];
            setSettings(updatedSettings);
            await dbService.saveSettings(updatedSettings);

            // If this is a team leader or stakeholder setting, update teams locally without full reload
            if (key.startsWith('team_') && (key.endsWith('_leaders') || key.endsWith('_stakeholders'))) {
              let teamId = key.replace('team_', '');
              if (teamId.endsWith('_leaders')) {
                teamId = teamId.slice(0, -'_leaders'.length);
              } else if (teamId.endsWith('_stakeholders')) {
                teamId = teamId.slice(0, -'_stakeholders'.length);
              }
              const leaderEmails = key.endsWith('_leaders')
                ? (value ? value.split(',').map(e => e.trim()).filter(Boolean) : [])
                : teams.find(t => t.TeamID === teamId)?.TeamLeaderEmails || [];
              const stakeholderEmails = key.endsWith('_stakeholders')
                ? (value ? value.split(',').map(e => e.trim()).filter(Boolean) : [])
                : teams.find(t => t.TeamID === teamId)?.StakeholderEmails || [];

              setTeams(prev => prev.map(team =>
                team.TeamID === teamId
                  ? { ...team, TeamLeaderEmails: leaderEmails, StakeholderEmails: stakeholderEmails }
                  : team
              ));
            }

            // If this is an email template setting, also update the email_templates sheet
            const emailTemplateKeys = ['template_assigned_email', 'template_completion_email', 'template_delayed_email', 'template_scheduled_reminder', 'report_submitted', 'task_closed'];
            const baseKey = key.replace('_value', '').replace('_frequency', '').replace('_sendTime', '').replace('_triggerCondition', '').replace('_active', '');
            if (emailTemplateKeys.includes(baseKey) || key.startsWith('template_')) {
              try {
                let templateName = baseKey;
                if (baseKey.startsWith('template_')) {
                  templateName = baseKey.replace('template_', '');
                }
                // Only sync the body content, not frequency/sendTime/triggerCondition/active
                if (key.endsWith('_value') || (!key.includes('_') && emailTemplateKeys.includes(baseKey))) {
                  await fetch('/api/auth/email/templates/update', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${localStorage.getItem('PMS_auth_token')}`,
                    },
                    body: JSON.stringify({
                      templateName,
                      body: value,
                    }),
                  });
                }
              } catch (emailError) {
              }
            }

            // SSE will handle syncing to other clients - no need for manual sync
          } catch (error) {
            throw error;
          }
        }}
        onEditProfile={() => setIsEditProfileModalOpen(true)}
        onChangePassword={() => setIsChangePasswordModalOpen(true)}
        onConfigureNotifications={() => setIsConfigureNotificationsModalOpen(true)}
        onToggleUserActive={(userId, active) => {
          setUsers(prev => prev.map(u => u.UserID === userId ? { ...u, Active: active } : u));
        }}
        onToggleUserStatus={handleToggleUserStatus}
        onUpdateUserRole={handleUpdateUserRole}
        onApproveUser={handleApproveUser}
        onUpdateUserTeams={handleUpdateUserTeams}
        onDeleteTeam={handleDeleteTeam}
        onRenameTeam={handleRenameTeam}
        onDeleteTask={handleDeleteTask}
        onAddTeamSubmission={async (submission) => {
          try {
            await dbService.saveTeamSubmission(submission);
            // Note: saveTeamSubmission already does optimistic update to cache
            // and notifies listeners, so we don't need to manually add to state here
            // to avoid duplicate entries
            handleManualSync();
          } catch (error) {
            throw error;
          }
        }}
        onSyncDatabase={handleManualSync}
        isSyncing={dbIsSyncing}
        lastSyncTime={lastSyncTime}
        dbConnectionStatus={dbConnectionStatus}
        onRefreshUsers={silentSync}
      />
                  </Suspense>
                </ErrorBoundary>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Tasks route - with all required props */}
        <Route
          path={ROUTES.TASKS}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <TasksPage
                  tasks={getVisibleTasks()}
                  filters={{
                    status: filterStatus === 'All' ? [] : [filterStatus],
                    priority: filterPriority,
                    assignee: filterAssigneeNames.join(','),
                    searchQuery: debouncedSearchQuery
                  }}
                  currentUser={activeUser}
                  users={users}
                  teams={teams}
                  subTeams={subTeams}
                  settings={settings}
                  isDarkMode={isDarkMode}
                  onFilterChange={(filterType, value) => {
                    if (filterType === 'status') setFilterStatus(Array.isArray(value) ? value.join(',') : value as string);
                    if (filterType === 'priority') setFilterPriority(value as string);
                    if (filterType === 'assignee') setFilterAssigneeNames(Array.isArray(value) ? value : [value as string]);
                    if (filterType === 'searchQuery') setSearchQuery(value as string);
                  }}
                  onTaskClick={(task) => {
                    setSelectedTask(task);
                    setIsDrawerOpen(true);
                  }}
                  onNewTask={() => {
                    setIsTaskModalOpen(true);
                  }}
                  getPriorityColor={(priority) => {
                    switch(priority) {
                      case 'High': return 'text-red-600 bg-red-50';
                      case 'Medium': return 'text-yellow-600 bg-yellow-50';
                      case 'Low': return 'text-green-600 bg-green-50';
                      default: return 'text-gray-600 bg-gray-50';
                    }
                  }}
                  getStatusColor={getStatusBadgeStyle}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Task detail route - opens drawer for specific task */}
        <Route
          path={ROUTES.TASK_DETAIL}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <TasksPage
                  tasks={getVisibleTasks()}
                  filters={{
                    status: filterStatus === 'All' ? [] : [filterStatus],
                    priority: filterPriority,
                    assignee: filterAssigneeNames.join(','),
                    searchQuery: debouncedSearchQuery
                  }}
                  currentUser={activeUser}
                  users={users}
                  teams={teams}
                  subTeams={subTeams}
                  settings={settings}
                  isDarkMode={isDarkMode}
                  onFilterChange={(filterType, value) => {
                    if (filterType === 'status') setFilterStatus(Array.isArray(value) ? value.join(',') : value as string);
                    if (filterType === 'priority') setFilterPriority(value as string);
                    if (filterType === 'assignee') setFilterAssigneeNames(Array.isArray(value) ? value : [value as string]);
                    if (filterType === 'searchQuery') setSearchQuery(value as string);
                  }}
                  onTaskClick={(task) => {
                    setSelectedTask(task);
                    setIsDrawerOpen(true);
                  }}
                  onNewTask={() => {
                    setIsTaskModalOpen(true);
                  }}
                  getPriorityColor={(priority) => {
                    switch(priority) {
                      case 'High': return 'text-red-600 bg-red-50';
                      case 'Medium': return 'text-yellow-600 bg-yellow-50';
                      case 'Low': return 'text-green-600 bg-green-50';
                      default: return 'text-gray-600 bg-gray-50';
                    }
                  }}
                  getStatusColor={getStatusBadgeStyle}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Admin route - Admin only with all required props */}
        <Route
          path={ROUTES.ADMIN}
          element={
            <ProtectedRoute allowedRoles={[ROLE.ADMIN]}>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <AdminPage
                  users={users}
                  templates={templates}
                  audits={audits}
                  settings={settings}
                  teams={teams}
                  onAddUser={handleAddUser}
                  onToggleUserStatus={handleToggleUserStatus}
                  onAddTemplate={handleAddTemplate}
                  onToggleTemplateStatus={handleToggleTemplateStatus}
                  onUpdateSetting={handleUpdateSetting}
                  onUpdateUserRole={handleUpdateUserRole}
                  onApproveUser={handleApproveUser}
                  onAddTeam={async (team) => {
                    await dbService.saveTeam(team);
                    handleManualSync();
                  }}
                  onToggleTeamStatus={async (teamId) => {
                    await dbService.toggleTeamStatus(teamId);
                    handleManualSync();
                  }}
                  onUpdateUserTeams={handleUpdateUserTeams}
                  onDeleteTeam={handleDeleteTeam}
                  onSyncDatabase={handleManualSync}
                  isSyncing={dbIsSyncing}
                  lastSyncTime={lastSyncTime}
                  dbConnectionStatus={dbConnectionStatus}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Team route */}
        <Route
          path={ROUTES.TEAM}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <TeamPage
                  tasks={getVisibleTasks()}
                  currentUser={activeUser}
                  users={users}
                  teams={teams}
                  subTeams={subTeams}
                  onAddTeam={async (team) => {
                    await dbService.saveTeam(team);
                    handleManualSync();
                  }}
                  onToggleTeamStatus={async (teamId) => {
                    await dbService.toggleTeamStatus(teamId);
                    handleManualSync();
                  }}
                  onUpdateUserTeams={handleUpdateUserTeams}
                  onDeleteTeam={handleDeleteTeam}
                  onRenameTeam={handleRenameTeam}
                  onSaveSubTeam={async (subTeam) => {
                    await dbService.saveSubTeam(subTeam);
                  }}
                  onDeleteSubTeam={async (subTeamId) => {
                    await dbService.deleteSubTeam(subTeamId);
                    const affected = users.filter(u => u.SubTeamIDs?.includes(subTeamId));
                    for (const u of affected) {
                      const newSubTeamIDs = (u.SubTeamIDs || []).filter(id => id !== subTeamId);
                      const newSubTeamNames = (u.SubTeamNames || []).filter((_, idx) => u.SubTeamIDs?.[idx] !== subTeamId);
                      await dbService.saveUser({ 
                        ...u, 
                        SubTeamIDs: newSubTeamIDs, 
                        SubTeamNames: newSubTeamNames 
                      } as User);
                    }
                  }}
                  onUpdateSubTeamLeaders={async (teamId, subTeamId, leaderEmails) => {
                    const key = `team_${teamId}_subteam_${subTeamId}_leaders`;
                    const settingExists = settings.some(s => s.Key === key);
                    const updatedSettings = settingExists
                      ? settings.map(s => (s.Key === key ? { ...s, Value: leaderEmails.join(',') } : s))
                      : [...settings, { Key: key, Value: leaderEmails.join(',') }];
                    setSettings(updatedSettings);
                    await dbService.saveSettings(updatedSettings);
                    setSubTeams(prev => prev.map(st =>
                      st.SubTeamID === subTeamId ? { ...st, SubTeamLeaderEmails: leaderEmails } : st
                    ));
                  }}
                  onAssignUserToSubTeam={async (userEmail, subTeamId, subTeamName) => {
                    const user = users.find(u => u.Email === userEmail);
                    if (user) {
                      const currentSubTeamIDs = user.SubTeamIDs || [];
                      const currentSubTeamNames = user.SubTeamNames || [];
                      if (subTeamId && subTeamName) {
                        if (!currentSubTeamIDs.includes(subTeamId)) {
                          await dbService.saveUser({
                            ...user,
                            SubTeamIDs: [...currentSubTeamIDs, subTeamId],
                            SubTeamNames: [...currentSubTeamNames, subTeamName],
                          } as User);
                        }
                      }
                    }
                  }}
                  onRemoveUserFromSubTeam={async (userEmail, subTeamId) => {
                    const user = users.find(u => u.Email === userEmail);
                    if (user) {
                      const currentSubTeamIDs = user.SubTeamIDs || [];
                      const currentSubTeamNames = user.SubTeamNames || [];
                      const subTeamIndex = currentSubTeamIDs.indexOf(subTeamId);
                      if (subTeamIndex !== -1) {
                        const newSubTeamIDs = currentSubTeamIDs.filter(id => id !== subTeamId);
                        const newSubTeamNames = currentSubTeamNames.filter((_, i) => i !== subTeamIndex);
                        await dbService.saveUser({
                          ...user,
                          SubTeamIDs: newSubTeamIDs,
                          SubTeamNames: newSubTeamNames,
                        } as User);
                      }
                    }
                  }}
                  onNewTask={handleCreateTaskOrTemplate}
                  isDarkMode={isDarkMode}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Reports route */}
        <Route
          path={ROUTES.REPORTS}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <ReportsPage
                  tasks={getVisibleTasks()}
                  currentUser={activeUser}
                  users={users}
                  teams={teams}
                  subTeams={subTeams}
                  reports={reports}
                  settings={settings}
                  onTaskClick={(task) => {
                    setSelectedTask(task);
                    setIsDrawerOpen(true);
                  }}
                  isDarkMode={isDarkMode}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Weekly Reports route */}
        <Route
          path={ROUTES.WEEKLY_REPORTS}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <ScheduledReportsPage
                  tasks={getVisibleTasks()}
                  currentUser={activeUser}
                  users={users}
                  teams={teams}
                  subTeams={subTeams}
                  teamSubmissions={teamSubmissions}
                  settings={settings}
                  onAddTeamSubmission={async (submission) => {
                    await dbService.saveTeamSubmission(submission);
                    handleManualSync();
                  }}
                  isDarkMode={isDarkMode}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Schedules route */}
        <Route
          path={ROUTES.SCHEDULES}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <SchedulesPage
                  tasks={getVisibleTasks()}
                  currentUser={activeUser}
                  users={users}
                  templates={templates}
                  onAddTemplate={async (template) => {
                    await dbService.saveTemplate(template);
                    handleManualSync();
                  }}
                  onToggleTemplateStatus={async (templateId) => {
                    const template = templates.find(t => t.TemplateID === templateId);
                    if (template) {
                      await dbService.saveTemplate({ ...template, Active: !template.Active });
                      handleManualSync();
                    }
                  }}
                  isDarkMode={isDarkMode}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />

        {/* Settings route */}
        <Route
          path={ROUTES.SETTINGS}
          element={
            <ProtectedRoute>
              <MainLayout
                currentUser={activeUser}
                onLogout={() => {
                  localStorage.removeItem('PMS_active_user_email');
                  localStorage.removeItem('PMS_auth_token');
                  localStorage.removeItem('PMS_user');
                  setActiveUserEmail('');
                  setActiveUser(null);
                  navigate(ROUTES.LOGIN);
                }}
              >
                <Suspense fallback={<Spinner size="lg" />}>
                  <SettingsPage
                  currentUser={activeUser}
                  settings={settings}
                  emailTemplates={emailTemplates}
                  onUpdateSetting={handleUpdateSetting}
                  onEditProfile={() => setIsEditProfileModalOpen(true)}
                  onChangePassword={() => setIsChangePasswordModalOpen(true)}
                  onConfigureNotifications={() => setIsConfigureNotificationsModalOpen(true)}
                  onLogout={handleLogout}
                  gmailConnected={gmailConnected}
                  gmailLoading={gmailLoading}
                  connectionMessage={connectionMessage}
                  onConnectGmail={handleConnectGmail}
                  onDisconnectGmail={handleDisconnectGmail}
                />
                </Suspense>
              </MainLayout>
            </ProtectedRoute>
          }
        />
      </Routes>

      {/* Global modals - outside Routes so they work on any page */}
      <Suspense fallback={<Spinner size="lg" />}>
        <AnimatePresence>
          
          {/* Create Task modal */}
          {isTaskModalOpen && (
            <CreateTaskModal
            currentUser={activeUser}
            usersList={users}
            teamsList={teams}
            subTeamsList={subTeams}
            isOpen={isTaskModalOpen}
            onClose={() => {
              setIsTaskModalOpen(false);
              setPreSelectedAssignee(undefined);
              setPreSelectedTeamIDs(undefined);
            }}
            onSubmit={async (data) => {
              setIsTaskModalOpen(false);
              setPreSelectedAssignee(undefined);
              setPreSelectedTeamIDs(undefined);
              await handleCreateTaskOrTemplate(data);
            }}
            preSelectedAssignee={preSelectedAssignee}
            preSelectedTeamIDs={preSelectedTeamIDs}
          />
        )}

        {/* Task Details Drawer */}
        {isDrawerOpen && selectedTask && activeUser && (
          <TaskDrawer
            task={selectedTask}
            isOpen={isDrawerOpen}
            onClose={() => {
              setIsDrawerOpen(false);
              setSelectedTask(null);
            }}
            currentUser={activeUser}
            reports={reports}
            subtasks={subtasks}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenFollowUpModal={() => setIsFollowUpModalOpen(true)}
            onCloseTask={async (taskId, remark, attachmentLink) => {
                 setIsDrawerOpen(false);
                 setSelectedTask(null);
                 handleCloseTask(taskId, remark, attachmentLink);
               }}
            onUpdateTask={handleUpdateTask}
            onAddSubtask={handleAddSubtask}
            onToggleSubtask={handleToggleSubtask}
            onDeleteSubtask={handleDeleteSubtask}
            usersList={users}
            teamsList={teams}
            subTeamsList={subTeams}
          />
        )}

        {/* Create Report modal */}
        {isReportModalOpen && selectedTask && (
          <CreateReportModal
            task={selectedTask}
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            onSubmit={handleSubmitProgressReport}
            currentUser={activeUser}
            subtasks={subtasks.filter(s => s.TaskID === selectedTask.TaskID)}
          />
        )}

        {/* Follow Up modal */}
        {isFollowUpModalOpen && selectedTask && (
          <FollowUpModal
            task={selectedTask}
            isOpen={isFollowUpModalOpen}
            onClose={() => setIsFollowUpModalOpen(false)}
            onSubmit={async (parentTaskId, reason) => {
              await handleCreateFollowUp(parentTaskId, reason);
              setIsFollowUpModalOpen(false);
              setIsDrawerOpen(false);
              setSelectedTask(null);
            }}
          />
        )}

        {/* Edit Profile Modal */}
        {isEditProfileModalOpen && activeUser && (
          <EditProfileModal
            isOpen={isEditProfileModalOpen}
            onClose={() => setIsEditProfileModalOpen(false)}
            currentUser={activeUser}
            onSave={(updatedUser) => {
              setUsers(prev => prev.map(u => u.UserID === activeUser.UserID ? { ...u, ...updatedUser } : u));
              setActiveUser(prev => prev ? { ...prev, ...updatedUser } : null);
            }}
            onChangePassword={() => {
              setIsEditProfileModalOpen(false);
              setIsChangePasswordModalOpen(true);
            }}
          />
        )}

        {/* Change Password Modal */}
        {isChangePasswordModalOpen && (
          <ChangePasswordModal
            isOpen={isChangePasswordModalOpen}
            onClose={() => setIsChangePasswordModalOpen(false)}
            onSave={async (oldPassword, newPassword) => {
              try {
                const result = await changePassword({ oldPassword, newPassword });
                if (result.success) {
                  logger.log('Password changed successfully');
                  setSimulationMessage({ type: 'success', text: 'Password changed successfully' });
                } else {
                  setSimulationMessage({ type: 'error', text: result.message || 'Failed to change password' });
                }
              } catch (error) {
                logger.error('Password change error:', error);
                setSimulationMessage({ type: 'error', text: 'Failed to change password. Please try again.' });
              }
            }}
          />
        )}

        {/* Configure Notifications Modal */}
        {isConfigureNotificationsModalOpen && (
          <ConfigureNotificationsModal
            isOpen={isConfigureNotificationsModalOpen}
            onClose={() => setIsConfigureNotificationsModalOpen(false)}
            onSave={(settings) => {
              // In a real implementation, this would save the notification settings
            }}
          />
        )}

        {/* Add User Modal */}
        {isAddUserModalOpen && (
          <AddUserModal
            isOpen={isAddUserModalOpen}
            onClose={() => setIsAddUserModalOpen(false)}
            onSave={async (userData) => {
              const bcrypt = await import('bcrypt');
              const hashedPassword = await bcrypt.hash(userData.Password || '', 12);
              const newUser: User = {
                UserID: `USR-${Date.now()}`,
                FullName: userData.FullName,
                Email: userData.Email,
                Role: userData.Role,
                ManagerEmail: userData.ManagerEmail,
                TeamIDs: [`TM-${Date.now()}`],
                TeamNames: [userData.TeamName || 'Default Team'],
                Active: true,
                CanCreateFollowUp: isAdminLevel(userData.Role) || userData.Role === ROLE.STAKEHOLDER,
                CanCloseTask: isAdminLevel(userData.Role) || userData.Role === ROLE.STAKEHOLDER,
                CreatedAt: new Date().toISOString(),
                UpdatedAt: new Date().toISOString(),
                Password: hashedPassword,
              };
              setUsers(prev => [...prev, newUser]);
            }}
            existingUsers={users}
          />
        )}

        {/* Add Team Modal */}
        {isAddTeamModalOpen && (
          <AddTeamModal
            isOpen={isAddTeamModalOpen}
            onClose={() => setIsAddTeamModalOpen(false)}
            users={users}
            onSave={async (teamData) => {
              const newTeam: Team = {
                TeamID: `T-${Date.now()}`,
                TeamName: teamData.TeamName,
                Description: teamData.Description,
                StakeholderEmails: teamData.StakeholderEmails,
                Active: true,
                CreatedAt: new Date().toISOString(),
                UpdatedAt: new Date().toISOString(),
              };
              await dbService.saveTeam(newTeam);
              // SSE will handle sync automatically - no need to reload database
            }}
          />
        )}

      </AnimatePresence>
      </Suspense>
    </div>
  );
}