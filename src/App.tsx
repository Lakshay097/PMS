import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useAppModals } from './hooks/useAppModals';
import { useAppEvents } from './hooks/useAppEvents';
import { useDatabase } from './hooks/useDatabase';
import { useTaskOperations } from './hooks/useTaskOperations';
import { useUserOperations } from './hooks/useUserOperations';
import { useTeamOperations } from './hooks/useTeamOperations';
import { useTemplateOperations } from './hooks/useTemplateOperations';
import { useTaskMetrics } from './hooks/useTaskMetrics';
import { getAllSubordinates } from './utils/userUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { logger } from './utils/logger';
import { ROLE } from './constants/status';
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
import { dbService, initializeDatabase } from './lib/dbService';
import { initAuth, sheetsApi } from './lib/sheetsService';
import { checkAndGenerateRecurringTasks, evaluateOverdueTasks } from './lib/taskEngine';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { useAuth } from './contexts/AuthContext';
import { changePassword } from './api/auth';
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
import Spinner from './components/ui/Spinner';
import ErrorBoundary from './components/ErrorBoundary';
import DashboardSkeleton from './components/DashboardSkeleton';

// TECH-DEBT: Main bundle still 407kb (gzip 127kb). Run
// npx vite-bundle-visualizer and inspect index chunk for
// large deps that could be lazy loaded or replaced.

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

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

type ActiveView = 'dashboard' | 'tasks' | 'templates' | 'admin';

export default function App() {
  // Database States loaded from LocalStorage - MUST be called before any conditional logic
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
  const { token } = useAuth();
  useRealtimeSync(token);

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
  const [isAuthInitialized, setIsAuthInitialized] = useState<boolean>(false);

  // Google Sheets database state triggers
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState<string | null>(null);

  // Initialize Google Sheets authentication on mount
  useEffect(() => {
    const cleanup = initAuth(
      (token) => {
        logger.log('Google Sheets authentication successful');
        setIsAuthInitialized(true);
      },
      (error) => {
        logger.error('Google Sheets authentication failed:', error);
        setIsAuthInitialized(false);
      }
    );
    return cleanup;
  }, []);

  // Migration trigger for Firestore seeding
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('migrate') === 'true') {
      import('./lib/migrationScript').then(({ migrateFromSheets }) => {
        migrateFromSheets().then(() => console.log('Migration complete'));
      });
    }
  }, []);

  // Firestore → Sheets sync worker (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      import('./lib/sheetsSyncWorker').then(({ syncFirestoreToSheets }) => {
        syncFirestoreToSheets().catch(err => console.error('Sync worker error:', err));
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Reload database when auth initializes
  useEffect(() => {
    if (isAuthInitialized) {
      loadDatabase();
    }
  }, [isAuthInitialized]);

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

  // Debounced version of loadDatabase for post-action syncs
  const debouncedLoadDatabase = useMemo(
    () => debounce(() => loadDatabase(), 2000),
    [loadDatabase]
  );

  // Manual sync function for AdminPanel - use silent sync to avoid blocking UI
  const handleManualSync = async () => {
    await silentSync();
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
        if (found.Role === ROLE.SUB_STAKEHOLDER && activeView === 'admin') {
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
            logger.error('Failed to parse stored user:', e);
          }
        }
      }
    }
  }, [activeUserEmail, users, activeView]);

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
      if (activeUser.Role === ROLE.ADMIN) return true;

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
        return isAssignee;
      }
      return false;
    });

    return visible;
  };

  // useMemo: tasks list can be large, filter is O(n)
  const filteredTasks = useMemo(() => {
    if (!activeUser) return [];
    return getFilteredTasks().filter(task => {
    const assignees = (task.AssignedToEmail || '').split(',').map(e => e.trim());
    const assigneeNames = assignees.map(email => {
      const found = users.find(u => u.Email?.toLowerCase() === email.toLowerCase());
      return found ? found.FullName : email;
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
      (task.TeamName?.toLowerCase().includes(searchLower) || false) ||
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
  const { handleDeleteTeam } = useTeamOperations({
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

    console.log('App.handleSubmitProgressReport: Received data:', data);
    console.log('App.handleSubmitProgressReport: UploadedFiles:', data.UploadedFiles);

    // Handle file uploads to Google Drive
    const uploadedFiles = data.UploadedFiles || [];
    const uploadedFileUrls: string[] = [];

    for (const file of uploadedFiles) {
      try {
        console.log(`App: Uploading file ${file.name}, data length: ${file.data?.length}`);
        const token = localStorage.getItem('PMS_auth_token');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const uploadData = await uploadFile({
          fileName: file.name,
          fileData: file.data,
          mimeType: file.type,
          taskId: data.TaskID,
          reportId: propId
        });
        console.log(`App: File uploaded successfully: ${uploadData.webViewLink}`);
        uploadedFileUrls.push(uploadData.webViewLink);
      } catch (error) {
        console.error('App: Error uploading file:', error);
        logger.error('Error uploading file:', error);
      }
    }

    const attachmentLinks = [...uploadedFileUrls];
    if (data.AttachmentLink) {
      attachmentLinks.push(data.AttachmentLink);
    }

    console.log('App: Final attachment links:', attachmentLinks);

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
      AttachmentLink: attachmentLinks.length > 0 ? attachmentLinks.join(', ') : '',
      CreatedAt: nowStr
    };

    console.log('App: Saving report:', newReport);

    const targetTask = tasks.find(t => t.TaskID === data.TaskID);
    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        Status: data.StatusUpdate,
        PercentComplete: Number(data.PercentComplete),
        LastReportSummary: data.WorkSummary,
        AttachmentLink: attachmentLinks.length > 0 ? attachmentLinks.join(', ') : targetTask.AttachmentLink,
        CompletionDate: data.StatusUpdate === 'Closed' ? nowStr.split('T')[0] : targetTask.CompletionDate,
        UpdatedAt: nowStr
      };

      await dbService.saveReport(newReport);
      await dbService.saveTask(updatedTask);
      console.log('App: Report saved successfully');

      triggerNotification(
        'Progress Update',
        `PROGRESS REGISTERED: Task ${targetTask.TaskID} ("${targetTask.Title}") progress report submitted. Status: "${data.StatusUpdate}".`,
        `${targetTask.AssignedByEmail}, ${targetTask.AssignedToEmail}`
      );

      try {
        const token = localStorage.getItem('PMS_auth_token');
        await fetch('/api/email/trigger/report-submission', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            submitterEmail: activeUser.Email,
            allocatorEmail: targetTask.AssignedByEmail,
            task: targetTask,
            reportContent: data.WorkSummary,
          }),
        });
      } catch (err) {
        console.error('Email trigger FAILED:', err); 
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
    return <DashboardSkeleton isDarkMode={isDarkMode} />;
  }

  if (!activeUser) {
    return (
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
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col font-sans antialiased ${isDarkMode ? 'bg-[#0F141F] text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
      
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
            className={`fixed top-5 right-5 z-[9999] max-w-sm w-full border shadow-2xl rounded-2xl p-4 flex gap-3 text-xs font-semibold leading-relaxed ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
          >
            <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              simulationMessage.type === 'success' ? (isDarkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-800') :
              simulationMessage.type === 'error' ? (isDarkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-800') : (isDarkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-800')
            }`}>
              {simulationMessage.type === 'success' ? <CheckCircle size={14} /> :
               simulationMessage.type === 'error' ? <AlertTriangle size={14} /> : <Info size={14} />}
            </div>
            <div className="flex-1 space-y-1">
              <div className={`font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                {simulationMessage.type === 'success' ? 'Success Alert' :
                 simulationMessage.type === 'error' ? 'System Error' : 'System Information'}
              </div>
              <p className={`leading-snug ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{simulationMessage.text}</p>
            </div>
            <button
              onClick={() => setSimulationMessage(null)}
              className={`ml-1 p-1 rounded-lg transition-all h-6 w-6 flex items-center justify-center shrink-0 border-none cursor-pointer ${isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
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
            className={`fixed top-5 right-5 z-[9999] max-w-sm w-full border shadow-2xl rounded-2xl p-4 flex gap-3 text-xs font-semibold leading-relaxed ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
          >
            <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-amber-900/30 text-amber-400' : 'bg-amber-100 text-amber-800'}`}>
              <AlertTriangle size={14} />
            </div>
            <div className="flex-1 space-y-1">
              <div className={`font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Database Status</div>
              <p className={`leading-snug ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{databaseSwitchMessage}</p>
            </div>
            <button
              onClick={() => {
                // Clear the message by forcing a re-render
                // The hook will auto-clear after timeout
              }}
              className={`ml-1 p-1 rounded-lg transition-all h-6 w-6 flex items-center justify-center shrink-0 border-none cursor-pointer ${isDarkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NEW UI - Dashboard handles all views */}
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
        emailTemplates={emailTemplates}
        teams={teams}
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
            await dbService.saveUser(userData);
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
            console.log('[onUpdateSetting] Saving setting:', key, 'value:', value);
            const updatedSettings = settings.map(s =>
              s.Key === key ? { ...s, Value: value } : s
            );
            setSettings(updatedSettings);
            await dbService.saveSettings(updatedSettings);
            console.log('[onUpdateSetting] Setting saved successfully to Firestore');

            // If this is a team leader or stakeholder setting, update teams locally without full reload
            if (key.startsWith('team_') && (key.endsWith('_leaders') || key.endsWith('_stakeholders'))) {
              const teamId = key.replace('team_', '').replace('_leaders', '').replace('_stakeholders', '');
              console.log('[onUpdateSetting] Updating team local state for:', teamId);
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
              console.log('[onUpdateSetting] Team local state updated:', { leaderEmails, stakeholderEmails });
            }

            // If this is an email template setting, also update the email_templates sheet
            if (key.startsWith('template_')) {
              try {
                await fetch('/api/auth/email/templates/update', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('PMS_auth_token')}`,
                  },
                  body: JSON.stringify({
                    templateName: key.replace('template_', ''),
                    body: value,
                  }),
                });
              } catch (emailError) {
                console.error('Failed to sync email template to sheet:', emailError);
              }
            }

            // SSE will handle syncing to other clients - no need for manual sync
          } catch (error) {
            console.error('[onUpdateSetting] Error saving setting:', error);
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
        onDeleteTask={handleDeleteTask}
        onAddTeamSubmission={async (submission) => {
          try {
            await dbService.saveTeamSubmission(submission);
            setTeamSubmissions(prev => [...prev, submission]);
            handleManualSync();
          } catch (error) {
            throw error;
          }
        }}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onSyncDatabase={handleManualSync}
        isSyncing={dbIsSyncing}
        lastSyncTime={lastSyncTime}
        dbConnectionStatus={dbConnectionStatus}
      />
        </Suspense>
      </ErrorBoundary>

      <Suspense fallback={<Spinner size="lg" />}>
        <AnimatePresence>
          
          {/* Create Task modal */}
          {isTaskModalOpen && (
            <CreateTaskModal
            currentUser={activeUser}
            usersList={users}
            teamsList={teams}
            isOpen={isTaskModalOpen}
            onClose={() => {
              setIsTaskModalOpen(false);
              setPreSelectedAssignee(undefined);
            }}
            onSubmit={async (data) => {
              setIsTaskModalOpen(false);
              setPreSelectedAssignee(undefined);
              await handleCreateTaskOrTemplate(data);
            }}
            preSelectedAssignee={preSelectedAssignee}
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
            subtasks={subtasks}
            onOpenReportModal={() => setIsReportModalOpen(true)}
            onOpenFollowUpModal={() => setIsFollowUpModalOpen(true)}
           onCloseTask={async (taskId, remark) => {
                setIsDrawerOpen(false);
                setSelectedTask(null);
                handleCloseTask(taskId, remark);
              }}
            onUpdateTask={handleUpdateTask}
            onAddSubtask={handleAddSubtask}
            onToggleSubtask={handleToggleSubtask}
            onDeleteSubtask={handleDeleteSubtask}
            usersList={users}
            teamsList={teams}
            isDarkMode={isDarkMode}
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
            isDarkMode={isDarkMode}
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
                CanCreateFollowUp: userData.Role === ROLE.ADMIN || userData.Role === ROLE.STAKEHOLDER,
                CanCloseTask: userData.Role === ROLE.ADMIN || userData.Role === ROLE.STAKEHOLDER,
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




