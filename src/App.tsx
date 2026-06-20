import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useAppModals } from './hooks/useAppModals';
import { useAppEvents } from './hooks/useAppEvents';
import { useDatabase } from './hooks/useDatabase';
import { useTaskOperations } from './hooks/useTaskOperations';
import { useUserOperations } from './hooks/useUserOperations';
import { useTeamOperations } from './hooks/useTeamOperations';
import { motion, AnimatePresence } from 'framer-motion';
import {
  INITIAL_USERS,
  INITIAL_TEAMS,
  INITIAL_TEMPLATES,
  INITIAL_TASKS,
  INITIAL_REPORTS,
  INITIAL_FOLLOWUPS,
  INITIAL_AUDITS,
  INITIAL_SETTINGS
} from './initialData';
import { User, Team, TaskTemplate, Task, TaskReport, FollowUp, AuditLog, AppSetting, TaskStatus, SystemAlert, Subtask, Comment } from './types/index';
import { dbService, initializeDatabase } from './lib/dbService';
import { initAuth, getAccessToken, sheetsApi } from './lib/sheetsService';
import { checkAndGenerateRecurringTasks, evaluateOverdueTasks } from './lib/taskEngine';
import { initSSEClient, disconnectSSEClient, ConnectionStatus } from './lib/sseClient';
import InstallBanner from './components/InstallBanner';
import OfflineBanner from './components/OfflineBanner';
import UpdateBanner from './components/UpdateBanner';
import { approveUser } from './api/auth';
import { uploadFile } from './api/upload';

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
import CreateTaskModal from './components/CreateTaskModal';
import CreateReportModal from './components/CreateReportModal';
import FollowUpModal from './components/FollowUpModal';
import TaskDrawer from './components/features/tasks/TaskDrawer';
import Spinner from './components/ui/Spinner';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
import EditProfileModal from './components/EditProfileModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import ConfigureNotificationsModal from './components/ConfigureNotificationsModal';
import AddUserModal from './components/features/admin/AddUserModal';
import AddTeamModal from './components/features/tasks/AddTeamModal';

type ActiveView = 'dashboard' | 'tasks' | 'templates' | 'admin';

export default function App() {
  // Database States loaded from LocalStorage
  const {
    users,
    setUsers,
    tasks,
    setTasks,
    teams,
    setTeams,
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
    isLoading: dbIsLoading,
    dbConnectionStatus,
    isSyncing: dbIsSyncing,
    lastSyncTime,
    loadDatabase,
    syncDatabase,
  } = useDatabase();

  // Active Simulated Session email state
  const [activeUserEmail, setActiveUserEmail] = useState<string>(() => {
    return localStorage.getItem('PMS_active_user_email') || '';
  });
  const [activeUser, setActiveUser] = useState<User | null>(null);

  // Active Route/View
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');

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

    return rawTemplate
      .replace(/{TaskID}/g, task.TaskID || '')
      .replace(/{Title}/g, task.Title || '')
      .replace(/{Category}/g, task.Category || '')
      .replace(/{Priority}/g, task.Priority || '')
      .replace(/{DueDate}/g, task.DueDate || '')
      .replace(/{AssignedToEmail}/g, task.AssignedToEmail || '')
      .replace(/{AssignedByEmail}/g, task.AssignedByEmail || '');
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
  } = useAppModals();

  // Tasks Board Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterScope, setFilterScope] = useState<'all_visible' | 'assigned_to_me' | 'created_by_me'>('all_visible');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterAssigneeName, setFilterAssigneeName] = useState<string>('All');
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

  // Theme state with localStorage persistence
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('PMS_theme');
    return savedTheme === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('PMS_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [newProfilePassword, setNewProfilePassword] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false);

  const handleUpdatePassword = async (newPass: string) => {
    if (!activeUser) return;
    const updatedUser = { ...activeUser, Password: newPass, UpdatedAt: new Date().toISOString() };
    await dbService.saveUser(updatedUser);
    await dbService.logAction('User', activeUser.UserID, 'Password/Security Code changed by User via Profile', activeUser.Email, null, { email: activeUser.Email });
    setPasswordChangeSuccess(true);
    setTimeout(() => {
      setPasswordChangeSuccess(false);
      setIsEditingPassword(false);
    }, 2500);
    debouncedLoadDatabase();
  };

  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Google Sheets database state triggers
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState<string | null>(null);
  
  // SSE connection status
  const [sseConnectionStatus, setSseConnectionStatus] = useState<ConnectionStatus>('disconnected');

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

  // Debounced version of loadDatabase for post-action syncs
  const debouncedLoadDatabase = useMemo(
    () => debounce(() => loadDatabase(), 2000),
    [loadDatabase]
  );

  // Manual sync function for AdminPanel
  const handleManualSync = async () => {
    await loadDatabase();
  };

  // SSE connection for real-time sync
  useEffect(() => {
    setIsBackendConnected(true);

    const sseClient = initSSEClient({
      onConnected: (lastModified) => {
        console.log('SSE connected, lastModified:', lastModified);
      },
      onChange: async (changedCollections, lastModified) => {
        console.log('SSE change detected:', changedCollections);
        await handleSSEChange(changedCollections);
      },
      onStatusChange: (status) => {
        setSseConnectionStatus(status);
      }
    });

    sseClient.connect();

    return () => {
      disconnectSSEClient();
    };
  }, [isBackendConnected]);

  // Handle SSE changes by syncing specific collections
  const handleSSEChange = async (collections: string[]) => {
    try {
      setIsSyncingSheets(true);
      
      // Sync only the changed collections
      await dbService.syncCollections(collections);
      
      // Reload the affected collections into state
      const collectionMap: Record<string, () => Promise<any>> = {
        users: () => dbService.getUsers(),
        teams: () => dbService.getTeams(),
        templates: () => dbService.getTemplates(),
        tasks: () => dbService.getTasks(),
        reports: () => dbService.getReports(),
        followups: () => dbService.getFollowups(),
        auditlogs: () => dbService.getAuditLogs(),
        settings: () => dbService.getSettings(),
        subtasks: () => dbService.getSubtasks(),
        comments: () => dbService.getComments()
      };

      const updates = await Promise.allSettled(
        collections.map(col => collectionMap[col]?.())
      );

      // Update state for successfully fetched collections
      collections.forEach((col, idx) => {
        if (updates[idx].status === 'fulfilled' && updates[idx].value) {
          switch (col) {
            case 'users':
              setUsers(updates[idx].value);
              break;
            case 'teams':
              setTeams(updates[idx].value);
              break;
            case 'templates':
              setTemplates(updates[idx].value);
              break;
            case 'tasks':
              setTasks(updates[idx].value);
              break;
            case 'reports':
              setReports(updates[idx].value);
              break;
            case 'followups':
              setFollowUps(updates[idx].value);
              break;
            case 'auditlogs':
              setAudits(updates[idx].value);
              break;
            case 'settings':
              setSettings(updates[idx].value);
              break;
            case 'subtasks':
              setSubtasks(updates[idx].value);
              break;
            case 'comments':
              setComments(updates[idx].value);
              break;
          }
        }
      });
    } catch (error) {
      console.error('Error handling SSE change:', error);
    } finally {
      setIsSyncingSheets(false);
    }
  };

  // Handle mobile back button and keyboard shortcuts
  useAppEvents(activeView, setActiveView);

  // 2. Track Active User Session adaptation
  useEffect(() => {
    if (users.length > 0) {
      const found = users.find(u => u.Email === activeUserEmail);
      if (found) {
        setActiveUser(found);
        // Force redirect to Dashboard when switching credentials to prevent scoping bugs
        if (found.Role === 'Sub-stakeholder' && activeView === 'admin') {
          setActiveView('dashboard');
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
            console.error('Failed to parse stored user:', e);
          }
        }
      }
    }
  }, [activeUserEmail, users, activeView]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center font-sans px-4">
        <div className="text-center space-y-4 text-white">
          <RefreshCw className="animate-spin text-blue-500 mx-auto" size={40} />
          <p className="text-sm font-semibold text-slate-300">Syncing PMS Platform State...</p>
          <div className="text-[10px] text-slate-500 font-mono">Verifying Cloud Database Connections &amp; Security Roles</div>
        </div>
      </div>
    );
  }

  if (!activeUser) {
    return (
      <LoginPage
        usersList={users}
        onLoginSuccess={(email, user) => {
          console.log('App.tsx onLoginSuccess called', { email, user });
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
          console.log('localStorage set');
          setActiveUserEmail(email);
          console.log('setActiveUserEmail called');
          setActiveUser(normalizedUser);
          console.log('setActiveUser called');
          // Add user to local users array if not present
          setUsers(prev => {
            if (!prev.find(u => u.Email === email)) {
              return [...prev, normalizedUser];
            }
            return prev;
          });
          console.log('onLoginSuccess completed');
        }}
      />
    );
  }

  // Helpers to push state updates safely with durable persistence
  const logAudit = async (entityType: AuditLog['EntityType'], entityId: string, action: string, oldVal = '', newVal = '') => {
    // Safely parse JSON values with guard for plain strings
    const parseSafely = (value: string): any => {
      if (!value) return null;
      if (typeof value !== 'string') return value;
      // Check if it looks like JSON
      if (value.startsWith('{') || value.startsWith('[')) {
        try {
          return JSON.parse(value);
        } catch {
          return value; // Return as string if parse fails
        }
      }
      return value; // Return plain string as-is
    };

    await dbService.logAction(
      entityType,
      entityId,
      action,
      activeUser.Email,
      parseSafely(oldVal),
      parseSafely(newVal)
    );
    // SSE will handle sync automatically - no need to reload database
  };

  // Rule 1: Task visibility filters depending on Role
  const getVisibleTasks = () => {
    const today = new Date();
    today.setHours(0,0,0,0);

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
      if (activeUser.Role === 'Admin') return true;

      if (!task.Active) return false;
      if (task.DeletedAt) return false;

      const assignees = (task.AssignedToEmail || '').split(',').map(e => e.trim().toLowerCase());
      const isAssignee = assignees.includes(activeUser.Email?.toLowerCase() || '');

      if (activeUser.Role === 'Stakeholder') {
        // Stakeholders see tasks assigned to them, by them, or to their subordinates
        const hasManagedAssignee = assignees.some(email => {
          const u = users.find(usr => usr.Email?.toLowerCase() === email);
          return u && u.ManagerEmail?.toLowerCase() === activeUser.Email?.toLowerCase();
        });
        return isAssignee || task.AssignedByEmail?.toLowerCase() === activeUser.Email?.toLowerCase() || hasManagedAssignee;
      }
      if (activeUser.Role === 'Sub-stakeholder') {
        // Sub-stakeholders see tasks assigned to them
        return isAssignee;
      }
      return false;
    });

    return visible;
  };

  const getOverdueAndSoonTasks = () => {
    const visible = getVisibleTasks();
    const today = new Date();
    today.setHours(0,0,0,0);

    return visible.filter(t => {
      if (t.Status === 'Closed') return false;
      if (t.Status === 'Overdue' || t.Priority === 'Critical') return true;
      
      try {
        const dDate = new Date(t.DueDate);
        dDate.setHours(0,0,0,0);
        const diffTime = dDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
        return diffDays >= 0 && diffDays <= 3; // within 3 days is indeed "soon to overdue"
      } catch (e) {
        return false;
      }
    });
  };

  const getVisibleReports = () => {
    const visibleTaskIds = new Set(getVisibleTasks().map(t => t.TaskID));
    return reports
      .filter(r => visibleTaskIds.has(r.TaskID))
      .sort((a, b) => new Date(b.CreatedAt || b.ReportDate).getTime() - new Date(a.CreatedAt || a.ReportDate).getTime());
  };

  // Filter & Search pipeline for the tasks board
  const getFilteredTasks = () => {
    let tasks = getVisibleTasks();
    
    // Filter by tab (Active vs History)
    if (taskViewTab === 'active') {
      tasks = tasks.filter(t => t.Status !== 'Closed' && t.Status !== 'Reviewed');
    } else {
      tasks = tasks.filter(t => t.Status === 'Closed' || t.Status === 'Reviewed');
    }
    
    // Sort by urgency
    tasks = tasks.sort((a, b) => {
      const today = getCurrentLocalDate();
      
      // Overdue tasks first
      const aOverdue = a.Status !== 'Closed' && a.Status !== 'Reviewed' && a.DueDate < today;
      const bOverdue = b.Status !== 'Closed' && b.Status !== 'Reviewed' && b.DueDate < today;
      
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      
      // Due today next
      const aDueToday = a.Status !== 'Closed' && a.Status !== 'Reviewed' && a.DueDate === today;
      const bDueToday = b.Status !== 'Closed' && b.Status !== 'Reviewed' && b.DueDate === today;
      
      if (aDueToday && !bDueToday) return -1;
      if (!aDueToday && bDueToday) return 1;
      
      // Then by closest deadline
      if (a.DueDate !== b.DueDate) {
        return a.DueDate.localeCompare(b.DueDate);
      }
      
      return 0;
    });
    
    return tasks;
  };
  
  const filteredTasks = getFilteredTasks().filter(task => {
    const assignees = (task.AssignedToEmail || '').split(',').map(e => e.trim());
    const assigneeNames = assignees.map(email => {
      const found = users.find(u => u.Email?.toLowerCase() === email.toLowerCase());
      return found ? found.FullName : email;
    }).join(', ');

    // Text search
    const matchesSearch = (task.Title?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
                          (task.TaskID?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
                          (task.AssignedToEmail?.toLowerCase().includes(searchQuery.toLowerCase()) || false) ||
                          (assigneeNames.toLowerCase().includes(searchQuery.toLowerCase()) || false);

    // Assignation Tab
    const isAssignee = assignees.map(e => e.toLowerCase()).includes(activeUser.Email?.toLowerCase() || '');
    let matchesScope = true;
    if (filterScope === 'assigned_to_me') {
      matchesScope = isAssignee;
    } else if (filterScope === 'created_by_me') {
      matchesScope = task.AssignedByEmail === activeUser.Email;
    }

    // Secondary Dropdowns
    const matchesStatus = filterStatus === 'All' || task.Status === filterStatus;
    const matchesPriority = filterPriority === 'All' || task.Priority === filterPriority;
    const matchesType = filterType === 'All' || task.TaskType === filterType;
    const matchesAssigneeSearch = filterAssigneeName === 'All' || assignees.includes(filterAssigneeName);

    return matchesSearch && matchesScope && matchesStatus && matchesPriority && matchesType && matchesAssigneeSearch;
  });

  // Calculate Dashboard Home Metrics
  const visibleTasksForMetrics = getVisibleTasks();
  const today = getCurrentLocalDate();

  // Active Tasks: Count of tasks with status other than Closed/Reviewed
  const metricActiveTasks = (visibleTasksForMetrics || []).filter(t => t.Status !== 'Closed' && t.Status !== 'Reviewed').length;

  // Overdue: Active tasks whose due date is less than today's date
  const metricOverdue = (visibleTasksForMetrics || []).filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate < today;
  }).length;

  // Due Today: Active tasks whose due date is today's date
  const metricDueToday = (visibleTasksForMetrics || []).filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate === today;
  }).length;

  // Completed This Week: Closed/Reviewed tasks with a CompletionDate within the last 7 days
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const metricCompletedThisWeek = (visibleTasksForMetrics || []).filter(t => {
    if (t.Status !== 'Closed' && t.Status !== 'Reviewed') return false;
    if (!t.CompletionDate) return false;
    const completionDate = new Date(t.CompletionDate);
    return completionDate >= oneWeekAgo;
  }).length;

  const metricFollowUps = (followUps || []).filter(f => {
    if (f.Status !== 'Active' && f.Status !== 'Pending') return false;
    if (activeUser.Role === 'Admin') return true;
    return f.CreatedByEmail === activeUser.Email;
  }).length;

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
    runSimulatedRecurrenceEngine,
  } = useTaskOperations({
    tasks,
    users,
    currentUser: activeUser,
    syncDatabase: loadDatabase,
    selectedTask,
    setSelectedTask,
    triggerNotification,
    formatEmailTemplate,
    logAudit,
    setIsSimulatingRecurrence,
    setSimulationMessage,
    setSubtasks,
    subtasks,
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
    logAudit,
  });

  // Team operations hook
  const { handleDeleteTeam } = useTeamOperations({
    teams,
    users,
    syncDatabase: loadDatabase,
    logAudit,
  });

  // Actions implementation
  const handleSubmitProgressReport = async (data: any) => {
    const propId = `RP-${Math.floor(1000 + Math.random() * 8999)}`;
    const nowStr = new Date().toISOString();

    // Handle file uploads to Google Drive
    const uploadedFiles = data.UploadedFiles || [];
    const uploadedFileUrls: string[] = [];

    for (const file of uploadedFiles) {
      try {
        const token = localStorage.getItem('PMS_auth_token');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const uploadData = await uploadFile({
          fileName: file.name,
          fileData: file.data, // Base64 encoded file data
          mimeType: file.type,
          taskId: data.TaskID,
          reportId: propId
        });
        uploadedFileUrls.push(uploadData.webViewLink);
        console.log('File uploaded successfully:', uploadData);
      } catch (error) {
        console.error('Error uploading file:', error);
        // Continue with other files even if one fails
      }
    }

    // Combine uploaded file URLs with any existing attachment link
    const attachmentLinks = [...uploadedFileUrls];
    if (data.AttachmentLink) {
      attachmentLinks.push(data.AttachmentLink);
    }

    const newReport: TaskReport = {
      ReportID: propId,
      TaskID: data.TaskID,
      SubmittedByEmail: activeUser.Email,
      ReportDate: nowStr.split('T')[0],
      StatusUpdate: data.StatusUpdate,
      WorkSummary: data.WorkSummary,
      PercentComplete: data.PercentComplete,
      Blockers: data.Blockers,
      NextAction: data.NextAction,
      AttachmentLink: attachmentLinks.length > 0 ? attachmentLinks.join(', ') : '',
      CreatedAt: nowStr
    };

    // Sync state onto task row
    const targetTask = tasks.find(t => t.TaskID === data.TaskID);
    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        Status: data.StatusUpdate,
        PercentComplete: Number(data.PercentComplete),
        LastReportSummary: data.WorkSummary,
        AttachmentLink: data.AttachmentLink || targetTask.AttachmentLink,
        UpdatedAt: nowStr
      };

      await dbService.saveReport(newReport);
      await dbService.saveTask(updatedTask);

      triggerNotification(
        'Progress Update',
        `PROGRESS REGISTERED: Task ${targetTask.TaskID} ("${targetTask.Title}") progress report submitted. Status: "${data.StatusUpdate}".`,
        `${targetTask.AssignedByEmail}, ${targetTask.AssignedToEmail}`
      );

      if (selectedTask && selectedTask.TaskID === data.TaskID) {
        setSelectedTask(updatedTask);
      }
    }

    await logAudit('Report', propId, 'Published Progress Report', '', JSON.stringify({ TaskID: data.TaskID, Status: data.StatusUpdate }));
    // SSE will handle sync automatically - no need to reload database
  };

  const handleAddTemplate = async (newTemplate: TaskTemplate) => {
    await dbService.saveTemplate(newTemplate);
    await logAudit('Template', newTemplate.TemplateID, 'Template Structured', '', JSON.stringify(newTemplate));
    // SSE will handle sync automatically - no need to reload database
  };

  const handleToggleTemplateStatus = async (tempId: string) => {
    const found = templates.find(t => t.TemplateID === tempId);
    if (found) {
      const updated = { ...found, Active: !found.Active, UpdatedAt: new Date().toISOString() };
      await dbService.saveTemplate(updated);
      await logAudit('Template', found.TemplateID, `Toggle Schedule Active State : ${updated.Active}`, `Active: ${found.Active}`, `Active: ${updated.Active}`);
      // SSE will handle sync automatically - no need to reload database
    }
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans antialiased text-slate-800">
      
      {/* PWA Banners */}
      <InstallBanner />
      <OfflineBanner />
      <UpdateBanner />
      
      {/* SSE Connection Status Indicator */}
      <div className="fixed top-5 right-5 z-[9998] flex items-center gap-2 bg-white border border-slate-200 shadow-lg rounded-full px-3 py-1.5 text-xs font-medium">
        <div className={`h-2 w-2 rounded-full ${
          sseConnectionStatus === 'connected' ? 'bg-emerald-500' :
          sseConnectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' :
          sseConnectionStatus === 'error' ? 'bg-red-500' : 'bg-slate-400'
        }`} />
        <span className="text-slate-600">
          {sseConnectionStatus === 'connected' ? 'Live' :
           sseConnectionStatus === 'connecting' ? 'Connecting…' :
           sseConnectionStatus === 'error' ? 'Disconnected' : 'Offline'}
        </span>
      </div>

      {/* Dynamic Toast Notification (Non-blocking alert replacement) */}
      <AnimatePresence>
        {simulationMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed top-5 right-5 z-[9999] max-w-sm w-full bg-white border border-slate-200 shadow-2xl rounded-2xl p-4 flex gap-3 text-xs font-semibold leading-relaxed"
          >
            <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              simulationMessage.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
              simulationMessage.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {simulationMessage.type === 'success' ? <CheckCircle size={14} /> :
               simulationMessage.type === 'error' ? <AlertTriangle size={14} /> : <Info size={14} />}
            </div>
            <div className="flex-1 space-y-1">
              <div className="text-slate-900 font-bold">
                {simulationMessage.type === 'success' ? 'Success Alert' :
                 simulationMessage.type === 'error' ? 'System Error' : 'System Information'}
              </div>
              <p className="text-slate-600 leading-snug">{simulationMessage.text}</p>
            </div>
            <button
              onClick={() => setSimulationMessage(null)}
              className="text-slate-400 hover:text-slate-600 ml-1 hover:bg-slate-100 p-1 rounded-lg transition-all h-6 w-6 flex items-center justify-center shrink-0 border-none cursor-pointer"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NEW UI - Dashboard handles all views */}
      <Suspense fallback={<Spinner size="lg" />}>
        <DashboardPage
        tasks={getVisibleTasks()}
        currentUser={activeUser}
        onNewTask={(assigneeEmail) => {
          setPreSelectedAssignee(assigneeEmail);
          setIsTaskModalOpen(true);
        }}
        onTaskClick={(task) => {
          setSelectedTask(task);
          setIsDrawerOpen(true);
        }}
        onLogout={() => {
          localStorage.removeItem('PMS_active_user_email');
          setActiveUserEmail('');
          setActiveUser(null);
        }}
        templates={templates}
        users={users}
        audits={audits}
        settings={settings}
        teams={teams}
        onAddUser={async (userData) => {
          try {
            console.log('Saving user to database:', userData);
            await dbService.saveUser(userData);
            console.log('User saved successfully');
            // SSE will handle sync automatically - no need to reload database
          } catch (error) {
            console.error('Failed to save user to database:', error);
            throw error;
          }
        }}
        onAddTemplate={async (templateData) => {
          try {
            console.log('Saving template to database:', templateData);
            await dbService.saveTemplate(templateData);
            console.log('Template saved successfully');
            // SSE will handle sync automatically - no need to reload database
          } catch (error) {
            console.error('Failed to save template to database:', error);
            throw error;
          }
        }}
        onToggleTemplateStatus={async (templateId) => {
          try {
            const template = templates.find(t => t.TemplateID === templateId);
            if (template) {
              console.log('Toggling template status:', templateId, !template.Active);
              await dbService.saveTemplate({ ...template, Active: !template.Active });
              console.log('Template status toggled successfully');
              // SSE will handle sync automatically - no need to reload database
            }
          } catch (error) {
            console.error('Failed to toggle template status:', error);
            throw error;
          }
        }}
        onAddTeam={async (teamData) => {
          try {
            console.log('Saving team to database:', teamData);
            await dbService.saveTeam(teamData);
            console.log('Team saved successfully');
            await logAudit('Team', teamData.TeamID, 'Created Team', '', JSON.stringify(teamData));
            // SSE will handle sync automatically - no need to reload database
          } catch (error) {
            console.error('Failed to save team to database:', error);
            throw error;
          }
        }}
        onToggleTeamStatus={async (teamId) => {
          try {
            console.log('Toggling team status:', teamId);
            await dbService.toggleTeamStatus(teamId);
            console.log('Team status toggled successfully');
            // SSE will handle sync automatically - no need to reload database
          } catch (error) {
            console.error('Failed to toggle team status:', error);
            throw error;
          }
        }}
        onUpdateSetting={async (key, value) => {
          try {
            console.log('Updating setting:', key, value);
            const updatedSettings = settings.map(s => 
              s.Key === key ? { ...s, Value: value } : s
            );
            await dbService.saveSettings(updatedSettings);
            console.log('Setting updated successfully');
            // SSE will handle sync automatically - no need to reload database
          } catch (error) {
            console.error('Failed to update setting:', error);
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
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onSyncDatabase={handleManualSync}
        isSyncing={isSyncingSheets}
        lastSyncTime={lastSyncTime}
        dbConnectionStatus={dbConnectionStatus}
      />
      </Suspense>

      <AnimatePresence>
        
        {/* Create Task modal */}
        {isTaskModalOpen && (
          <CreateTaskModal
            currentUser={activeUser}
            usersList={users}
            isOpen={isTaskModalOpen}
            onClose={() => {
              setIsTaskModalOpen(false);
              setPreSelectedAssignee(undefined);
            }}
            onSubmit={handleCreateTaskOrTemplate}
            preSelectedAssignee={preSelectedAssignee}
          />
        )}

        {/* Create Report modal */}
        {isReportModalOpen && selectedTask && (
          <CreateReportModal
            task={selectedTask}
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            onSubmit={handleSubmitProgressReport}
          />
        )}

        {/* Follow Up modal */}
        {isFollowUpModalOpen && selectedTask && (
          <FollowUpModal
            task={selectedTask}
            isOpen={isFollowUpModalOpen}
            onClose={() => setIsFollowUpModalOpen(false)}
            onSubmit={handleCreateFollowUp}
          />
        )}

        {/* Task Details Drawer */}
        {isDrawerOpen && selectedTask && (
          <TaskDrawer
            task={selectedTask}
            isOpen={isDrawerOpen}
            onClose={() => {
              setIsDrawerOpen(false);
              setSelectedTask(null);
            }}
            currentUser={activeUser}
            reports={reports}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenFollowUpModal={() => setIsFollowUpModalOpen(true)}
            onCloseTask={handleCloseTask}
            onUpdateTask={handleUpdateTask}
            usersList={users}
            teamsList={teams}
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
            onChangePassword={() => setIsChangePasswordModalOpen(true)}
            isDarkMode={isDarkMode}
            onToggleTheme={() => setIsDarkMode(!isDarkMode)}
          />
        )}

        {/* Change Password Modal */}
        {isChangePasswordModalOpen && (
          <ChangePasswordModal
            isOpen={isChangePasswordModalOpen}
            onClose={() => setIsChangePasswordModalOpen(false)}
            onSave={(oldPassword, newPassword) => {
              // In a real implementation, this would call an API to change the password
              console.log('Password change:', { oldPassword, newPassword });
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
              console.log('Notification settings:', settings);
            }}
          />
        )}

        {/* Add User Modal */}
        {isAddUserModalOpen && (
          <AddUserModal
            isOpen={isAddUserModalOpen}
            onClose={() => setIsAddUserModalOpen(false)}
            onSave={(userData) => {
              const newUser: User = {
                UserID: `USR-${Date.now()}`,
                FullName: userData.FullName,
                Email: userData.Email,
                Role: userData.Role,
                ManagerEmail: userData.ManagerEmail,
                TeamIDs: [`TM-${Date.now()}`],
                TeamNames: [userData.TeamName || 'Default Team'],
                Active: true,
                CanCreateFollowUp: userData.Role === 'Admin' || userData.Role === 'Stakeholder',
                CanCloseTask: userData.Role === 'Admin' || userData.Role === 'Stakeholder',
                CreatedAt: new Date().toISOString(),
                UpdatedAt: new Date().toISOString(),
                Password: userData.Password,
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
            onSave={async (teamData) => {
              const newTeam: Team = {
                TeamID: `T-${Date.now()}`,
                TeamName: teamData.TeamName,
                Description: teamData.Description,
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
    </div>
  );
}


