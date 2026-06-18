import React, { useState, useEffect } from 'react';
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
import { User, Team, TaskTemplate, Task, TaskReport, FollowUp, AuditLog, AppSetting, TaskStatus, SystemAlert, Subtask, Comment } from './types';
import { dbService, initializeDatabase } from './lib/dbService';
import { initAuth, getAccessToken, sheetsApi } from './lib/sheetsService';
import { checkAndGenerateRecurringTasks, evaluateOverdueTasks } from './lib/taskEngine';

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
import TaskDrawer from './components/TaskDrawer';
import AdminPanel from './components/AdminPanel';
import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';
import EditProfileModal from './components/EditProfileModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import ConfigureNotificationsModal from './components/ConfigureNotificationsModal';
import AddUserModal from './components/AddUserModal';

type ActiveView = 'dashboard' | 'tasks' | 'templates' | 'admin';

export default function App() {
  // Database States loaded from LocalStorage
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reports, setReports] = useState<TaskReport[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [audits, setAudits] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  // Active Simulated Session email state
  const [activeUserEmail, setActiveUserEmail] = useState<string>(() => {
    return localStorage.getItem('trustgrid_active_user_email') || '';
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
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isConfigureNotificationsModalOpen, setIsConfigureNotificationsModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [preSelectedAssignee, setPreSelectedAssignee] = useState<string | undefined>(undefined);

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
    return localStorage.getItem('trustgrid_sidebar_collapsed') === 'true';
  });

  // Theme state with localStorage persistence
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const savedTheme = localStorage.getItem('trustgrid_theme');
    return savedTheme === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    localStorage.setItem('trustgrid_theme', isDarkMode ? 'dark' : 'light');
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
    await loadDatabase();
  };

  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Google Sheets database state triggers
  const [isSheetsConnected, setIsSheetsConnected] = useState(false);
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [sheetsSpreadsheetId, setSheetsSpreadsheetId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [dbConnectionStatus, setDbConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('connected');

  // Manual sync function for AdminPanel
  const handleManualSync = async () => {
    await loadDatabase();
  };

  // Consolidated Database Sync and Reloader Function
  const loadDatabase = async () => {
    try {
      setIsSyncingSheets(true);
      setDbConnectionStatus('connected');
      
      // Initialize Google Sheets database (seeds if empty)
      await initializeDatabase();
      setIsBackendConnected(true);

      const [u, t, tm, tk, rp, fl, ad, st, sb, cm] = await Promise.all([
        dbService.getUsers(),
        dbService.getTeams(),
        dbService.getTemplates(),
        dbService.getTasks(),
        dbService.getReports(),
        dbService.getFollowups(),
        dbService.getAuditLogs(),
        dbService.getSettings(),
        dbService.getSubtasks(),
        dbService.getComments()
      ]);

      const evaluatedTasks = await evaluateOverdueTasks(tk, activeUserEmail);

      // Analyze and raise delay and ETA alerts for email simulation logging
      const overdueTasks = evaluatedTasks.filter(tsk => tsk.Status === 'Overdue' && tsk.Active);
      const bootstrappedAlerts: SystemAlert[] = overdueTasks.map(tsk => {
        const rawTemplate = st.find(s => s.Key === 'template_delayed_email')?.Value || "";
        const finalMessage = rawTemplate
          ? rawTemplate
              .replace(/{TaskID}/g, tsk.TaskID || '')
              .replace(/{Title}/g, tsk.Title || '')
              .replace(/{Category}/g, tsk.Category || '')
              .replace(/{Priority}/g, tsk.Priority || '')
              .replace(/{DueDate}/g, tsk.DueDate || '')
              .replace(/{AssignedToEmail}/g, tsk.AssignedToEmail || '')
              .replace(/{AssignedByEmail}/g, tsk.AssignedByEmail || '')
          : `DELAY ALERT: Task ${tsk.TaskID} ("${tsk.Title.length > 25 ? tsk.Title.substring(0, 25) + '...' : tsk.Title}") is Overdue! Due date was ${tsk.DueDate}.`;

        return {
          ID: `NT-DL-${tsk.TaskID}`,
          Type: 'Delay Alert',
          Message: finalMessage,
          EmailSentTo: `${tsk.AssignedToEmail}, ${tsk.AssignedByEmail}`,
          Timestamp: new Date().toISOString()
        };
      });

      if (bootstrappedAlerts.length > 0) {
        setNotifications(prev => {
          const filtered = prev.filter(p => !p.ID.startsWith('NT-DL-'));
          return [...bootstrappedAlerts, ...filtered];
        });
      }

      setUsers(u);
      setTeams(t);
      setTemplates(tm);
      setTasks(evaluatedTasks);
      setReports(rp);
      setFollowUps(fl);
      setAudits(ad);
      setSettings(st);
      setSubtasks(sb);
      setComments(cm);
      
      // Update sync time and status
      setLastSyncTime(new Date().toISOString());
      setDbConnectionStatus('connected');
    } catch (e) {
      console.error("Critical State Load Warning:", e);
      setDbConnectionStatus('error');
    } finally {
      setIsSyncingSheets(false);
      setIsLoading(false);
    }
  };

  // 1. Initial Storage bootstrap
  useEffect(() => {
    // Initialize Google Sheets authentication first
    const cleanup = initAuth(
      () => {
        // On success, load the database
        loadDatabase();
      },
      (error) => {
        console.error("Google Sheets authentication failed:", error);
        setIsLoading(false);
      }
    );

    return cleanup;
  }, []);

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
        const storedUser = localStorage.getItem('trustgrid_user');
        if (storedUser) {
          try {
            const parsedUser = JSON.parse(storedUser);
            if (parsedUser.Email === activeUserEmail) {
              setActiveUser(parsedUser);
              // Add user to local users array if not present
              setUsers(prev => [...prev, parsedUser]);
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
          <p className="text-sm font-semibold text-slate-300">Syncing TrustGrid Platform State...</p>
          <div className="text-[10px] text-slate-500 font-mono">Verifying Cloud Database Connections &amp; Security Roles</div>
        </div>
      </div>
    );
  }

  if (!activeUser) {
    return (
      <LoginScreen
        usersList={users}
        onLoginSuccess={(email, user) => {
          console.log('App.tsx onLoginSuccess called', { email, user });
          localStorage.setItem('trustgrid_active_user_email', email);
          localStorage.setItem('trustgrid_user', JSON.stringify(user));
          console.log('localStorage set');
          setActiveUserEmail(email);
          console.log('setActiveUserEmail called');
          setActiveUser(user);
          console.log('setActiveUser called');
          // Add user to local users array if not present
          setUsers(prev => {
            if (!prev.find(u => u.Email === email)) {
              return [...prev, user];
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
    await dbService.logAction(
      entityType,
      entityId,
      action,
      activeUser.Email,
      oldVal ? JSON.parse(oldVal) : null,
      newVal ? JSON.parse(newVal) : null
    );
    await loadDatabase();
  };

  // Rule 1: Task visibility filters depending on Role
  const getVisibleTasks = () => {
    const today = new Date();
    today.setHours(0,0,0,0);

    const visible = tasks.map(task => {
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
      if (!task.Active) return false;
      if (task.DeletedAt) return false;
      
      const assignees = task.AssignedToEmail.split(',').map(e => e.trim().toLowerCase());
      const isAssignee = assignees.includes(activeUser.Email.toLowerCase());

      // Role scope filter
      if (activeUser.Role === 'Admin') return true;
      if (activeUser.Role === 'Stakeholder') {
        // Stakeholders see tasks assigned to them, by them, or to their subordinates
        const hasManagedAssignee = assignees.some(email => {
          const u = users.find(usr => usr.Email.toLowerCase() === email);
          return u && u.ManagerEmail.toLowerCase() === activeUser.Email.toLowerCase();
        });
        return isAssignee || task.AssignedByEmail.toLowerCase() === activeUser.Email.toLowerCase() || hasManagedAssignee;
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
    const assignees = task.AssignedToEmail.split(',').map(e => e.trim());
    const assigneeNames = assignees.map(email => {
      const found = users.find(u => u.Email.toLowerCase() === email.toLowerCase());
      return found ? found.FullName : email;
    }).join(', ');

    // Text search
    const matchesSearch = task.Title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          task.TaskID.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          task.AssignedToEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          assigneeNames.toLowerCase().includes(searchQuery.toLowerCase());
    
    // Assignation Tab
    const isAssignee = assignees.map(e => e.toLowerCase()).includes(activeUser.Email.toLowerCase());
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
  const metricActiveTasks = visibleTasksForMetrics.filter(t => t.Status !== 'Closed' && t.Status !== 'Reviewed').length;
  
  // Overdue: Active tasks whose due date is less than today's date
  const metricOverdue = visibleTasksForMetrics.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate < today;
  }).length;
  
  // Due Today: Active tasks whose due date is today's date
  const metricDueToday = visibleTasksForMetrics.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate === today;
  }).length;
  
  // Completed This Week: Closed/Reviewed tasks with a CompletionDate within the last 7 days
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const metricCompletedThisWeek = visibleTasksForMetrics.filter(t => {
    if (t.Status !== 'Closed' && t.Status !== 'Reviewed') return false;
    if (!t.CompletionDate) return false;
    const completionDate = new Date(t.CompletionDate);
    return completionDate >= oneWeekAgo;
  }).length;
  
  const metricFollowUps = followUps.filter(f => {
    if (f.Status !== 'Active' && f.Status !== 'Pending') return false;
    if (activeUser.Role === 'Admin') return true;
    return f.CreatedByEmail === activeUser.Email;
  }).length;

  // Actions implementation
  const handleCreateTaskOrTemplate = async (data: any) => {
    const isTemplate = data.TaskType === 'Recurring';
    const nowStr = new Date().toISOString();

    if (isTemplate) {
      // 1. Create schedule template row
      const tempId = `TMP-${Math.floor(500 + Math.random() * 499)}`;
      const firstEmail = data.AssignedToEmail.split(',')[0]?.trim() || '';
      const recipient = users.find(u => u.Email === firstEmail);
      const newTemplate: TaskTemplate = {
        TemplateID: tempId,
        Title: data.Title,
        Description: data.Description,
        Category: data.Category,
        Priority: data.Priority,
        RecurrenceType: data.RecurrenceType,
        StartDate: data.StartDate,
        NextGenerationDate: data.StartDate, // first cycle runs on StartDate
        LastGeneratedDate: '',
        AssignedByEmail: activeUser.Email,
        AssignedToEmail: data.AssignedToEmail,
        AssignedToRole: recipient?.Role || 'Stakeholder',
        TeamID: activeUser.Role === 'Admin' ? 'T-ALL' : activeUser.TeamID,
        Active: true,
        CreatedAt: nowStr,
        UpdatedAt: nowStr
      };

      await dbService.saveTemplate(newTemplate);
      await logAudit('Template', tempId, 'Created Schedule Template', '', JSON.stringify(data));
      triggerNotification(
        'Task Assignment',
        `SCHEDULE ACTIVE: Recurring schedule ${tempId} ("${newTemplate.Title}") created for ${newTemplate.AssignedToEmail}.`,
        `${newTemplate.AssignedToEmail}`
      );
    } else {
      // 2. Create one-time task
      const newId = `TSK-${Math.floor(1000 + Math.random() * 8999)}`;
      const firstEmail = data.AssignedToEmail.split(',')[0]?.trim() || '';
      const recipient = users.find(u => u.Email === firstEmail);
      
      const newTask: Task = {
        TaskID: newId,
        TemplateID: null,
        ParentTaskID: null,
        Title: data.Title,
        Description: data.Description,
        Category: data.Category,
        Priority: data.Priority,
        TaskType: 'One-time',
        RecurrenceType: 'One-time',
        CycleKey: null,
        StartDate: data.StartDate,
        DueDate: data.DueDate,
        AssignedByEmail: activeUser.Email,
        AssignedToEmail: data.AssignedToEmail,
        AssignedToRole: recipient ? recipient.Role : 'Stakeholder',
        TeamID: recipient ? recipient.TeamID : activeUser.TeamID,
        Status: 'Not Started',
        PercentComplete: 0,
        LastReportSummary: '',
        RequiresFollowUp: 'No',
        FollowUpCount: 0,
        CompletionDate: null,
        CloseRemark: null,
        AttachmentLink: data.AttachmentLink || '',
        CreatedAt: nowStr,
        UpdatedAt: nowStr,
        Active: true,
        DeletedAt: null
      };

      await dbService.saveTask(newTask);
      await logAudit('Task', newId, 'Created One-time Task Allocation', '', JSON.stringify(data));
      const alertMsg = formatEmailTemplate('template_assigned_email', newTask);
      triggerNotification(
        'Task Assignment',
        alertMsg,
        `${newTask.AssignedToEmail}`
      );
    }
    await loadDatabase();
  };

  const handleSubmitProgressReport = async (data: any) => {
    const propId = `RP-${Math.floor(1000 + Math.random() * 8999)}`;
    const nowStr = new Date().toISOString();

    // Handle file uploads to Google Drive
    const uploadedFiles = data.UploadedFiles || [];
    const uploadedFileUrls: string[] = [];

    for (const file of uploadedFiles) {
      try {
        const token = localStorage.getItem('trustgrid_auth_token');
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const uploadRes = await fetch('/api/upload-file', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            fileName: file.name,
            fileData: file.data, // Base64 encoded file data
            mimeType: file.type,
            taskId: data.TaskID,
            reportId: propId
          }),
        });

        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          uploadedFileUrls.push(uploadData.webViewLink);
          console.log('File uploaded successfully:', uploadData);
        } else {
          console.error('File upload failed:', await uploadRes.text());
          // Continue with other files even if one fails
        }
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
    await loadDatabase();
  };

  const handleCloseTask = async (taskId: string, remark: string) => {
    const nowStr = new Date().toISOString();
    const targetTask = tasks.find(t => t.TaskID === taskId);

    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        Status: 'Closed' as TaskStatus,
        PercentComplete: 100,
        CompletionDate: nowStr.split('T')[0],
        CloseRemark: remark,
        UpdatedAt: nowStr
      };

      await dbService.saveTask(updatedTask);

      if (selectedTask && selectedTask.TaskID === taskId) {
        setSelectedTask(updatedTask);
      }
    }

    await logAudit('Task', taskId, 'Task Cleared & Closed', '', JSON.stringify({ Remark: remark }));
    await loadDatabase();
  };

  const handleUpdateTask = async (taskId: string, fields: Partial<Task>) => {
    const nowStr = new Date().toISOString();
    const targetTask = tasks.find(t => t.TaskID === taskId);

    if (targetTask) {
      const updatedTask: Task = {
        ...targetTask,
        ...fields,
        UpdatedAt: nowStr
      };

      if (fields.DueDate && fields.DueDate !== targetTask.DueDate) {
        triggerNotification(
          'ETA Breach',
          `ETA EXTENSION: Task ${targetTask.TaskID} ("${targetTask.Title}") ETA shifted to ${fields.DueDate} (Total requests: ${fields.EtaRequestCount || 1}/3).`,
          `${targetTask.AssignedToEmail || 'stakeholder@be.com'}, ${targetTask.AssignedByEmail}`
        );
      }

      await dbService.saveTask(updatedTask);

      if (selectedTask && selectedTask.TaskID === taskId) {
        setSelectedTask(updatedTask);
      }
      
      await logAudit('Task', taskId, 'Updated Task Properties', '', JSON.stringify(fields));
      await loadDatabase();
    }
  };

  const handleCreateFollowUp = async (parentTaskId: string, reason: string) => {
    const nowStr = new Date().toISOString();
    const parent = tasks.find(t => t.TaskID === parentTaskId);
    if (!parent) return;

    // Increment parent follow up count
    const nextFCount = parent.FollowUpCount + 1;
    const updatedParent: Task = {
      ...parent,
      RequiresFollowUp: 'Yes',
      FollowUpCount: nextFCount,
      UpdatedAt: nowStr
    };

    // Create new Task matching parent's details
    const newTaskId = `TSK-${Math.floor(1000 + Math.random() * 8999)}`;
    const firstEmail = parent.AssignedToEmail.split(',')[0]?.trim() || '';
    const recipient = users.find(u => u.Email === firstEmail);
    const today = new Date();
    const due = new Date();
    due.setDate(today.getDate() + 7); // 7 days offset default
    
    const newFollowUpTask: Task = {
      TaskID: newTaskId,
      TemplateID: null,
      ParentTaskID: parentTaskId,
      Title: `Follow-up #${nextFCount}: ${parent.Title.replace(/\s-\s\[Cycle.*\]/g, "")}`,
      Description: `REASON FOR FOLLOW-UP: ${reason}\n\nORIGINAL PARENT WORK SCOPE: ${parent.Description}`,
      Category: parent.Category,
      Priority: 'Medium',
      TaskType: 'One-time',
      RecurrenceType: 'One-time',
      CycleKey: null,
      StartDate: today.toISOString().split('T')[0],
      DueDate: due.toISOString().split('T')[0],
      AssignedByEmail: activeUser.Email,
      AssignedToEmail: parent.AssignedToEmail,
      AssignedToRole: recipient ? recipient.Role : 'Stakeholder',
      TeamID: parent.TeamID,
      Status: 'Not Started',
      PercentComplete: 0,
      LastReportSummary: '',
      RequiresFollowUp: 'No',
      FollowUpCount: 0,
      CompletionDate: null,
      CloseRemark: null,
      AttachmentLink: '',
      CreatedAt: nowStr,
      UpdatedAt: nowStr,
      Active: true,
      DeletedAt: null
    };

    // Insert follow up record
    const followId = `FLW-${Math.floor(100 + Math.random() * 899)}`;
    const newFollowUpRecord: FollowUp = {
      FollowUpID: followId,
      ParentTaskID: parentTaskId,
      NewTaskID: newTaskId,
      FollowUpNumber: nextFCount,
      CreatedByEmail: activeUser.Email,
      Reason: reason,
      CreatedAt: nowStr,
      Status: 'Active'
    };

    await dbService.saveTask(updatedParent);
    await dbService.saveTask(newFollowUpTask);
    await dbService.saveFollowup(newFollowUpRecord);

    if (selectedTask && selectedTask.TaskID === parentTaskId) {
      setSelectedTask(updatedParent);
    }

    await logAudit('FollowUp', followId, 'Follow-Up Sparked & Linked', '', JSON.stringify({ ParentID: parentTaskId, ChildID: newTaskId }));
    await loadDatabase();
  };

  // Administration interactions
  const handleAddUser = async (newUser: User) => {
    await dbService.saveUser(newUser);
    await logAudit('User', newUser.UserID, 'Account Authorized', '', JSON.stringify(newUser));
    await loadDatabase();
  };

  const handleToggleUserStatus = async (email: string) => {
    const foundUser = users.find(u => u.Email === email);
    if (foundUser) {
      const updatedUser = { ...foundUser, Active: !foundUser.Active, UpdatedAt: new Date().toISOString() };
      await dbService.saveUser(updatedUser);
      await logAudit('User', foundUser.UserID, `Toggle Active State : ${updatedUser.Active}`, `Active: ${foundUser.Active}`, `Active: ${updatedUser.Active}`);
      await loadDatabase();
    }
  };

  const handleAcceptUserRegistration = async (email: string) => {
    const foundUser = users.find(u => u.Email === email);
    if (foundUser) {
      const updatedUser = { ...foundUser, Active: true, UpdatedAt: new Date().toISOString() };
      await dbService.saveUser(updatedUser);
      await dbService.logAction('User', foundUser.UserID, 'Registration Accepted & Activated', foundUser.Email, null, updatedUser);
      await loadDatabase();
    }
  };

  const handleUpdateUserRole = async (email: string, newRole: 'Admin' | 'Stakeholder' | 'Sub-stakeholder') => {
    const foundUser = users.find(u => u.Email === email);
    if (foundUser) {
      const updatedUser = { ...foundUser, Role: newRole, UpdatedAt: new Date().toISOString() };
      await dbService.saveUser(updatedUser);
      await dbService.logAction('User', foundUser.UserID, `Role updated to ${newRole}`, foundUser.Email, null, updatedUser);
      await loadDatabase();
    }
  };

  const handleAddTemplate = async (newTemplate: TaskTemplate) => {
    await dbService.saveTemplate(newTemplate);
    await logAudit('Template', newTemplate.TemplateID, 'Template Structured', '', JSON.stringify(newTemplate));
    await loadDatabase();
  };

  const handleToggleTemplateStatus = async (tempId: string) => {
    const found = templates.find(t => t.TemplateID === tempId);
    if (found) {
      const updated = { ...found, Active: !found.Active, UpdatedAt: new Date().toISOString() };
      await dbService.saveTemplate(updated);
      await logAudit('Template', found.TemplateID, `Toggle Schedule Active State : ${updated.Active}`, `Active: ${found.Active}`, `Active: ${updated.Active}`);
      await loadDatabase();
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
    await loadDatabase();
  };

  // Subtask handlers
  const handleAddSubtask = async (taskId: string, title: string) => {
    const newSubtask: Subtask = {
      SubtaskID: `SUB-${Math.floor(1000 + Math.random() * 8999)}`,
      TaskID: taskId,
      Title: title,
      IsDone: false,
      CreatedAt: new Date().toISOString(),
      CreatedBy: activeUser.Email,
      UpdatedAt: new Date().toISOString()
    };
    await dbService.saveSubtask(newSubtask);
    await loadDatabase();
  };

  const handleToggleSubtask = async (subtaskId: string, isDone: boolean) => {
    const subtask = subtasks.find(s => s.SubtaskID === subtaskId);
    if (subtask) {
      await dbService.saveSubtask({ ...subtask, IsDone: isDone });
      await loadDatabase();
    }
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    const updated = subtasks.filter(s => s.SubtaskID !== subtaskId);
    setSubtasks(updated);
    const token = getAccessToken();
    if (token) {
      try {
        await sheetsApi.saveCollection('subtasks', updated);
      } catch (error) {
        console.error("Failed to delete subtask from Google Sheets:", error);
      }
    }
  };

  // Comment handlers
  const handleAddComment = async (taskId: string, comment: string) => {
    const newComment: Comment = {
      CommentID: `CMT-${Math.floor(1000 + Math.random() * 8999)}`,
      TaskID: taskId,
      Comment: comment,
      CreatedAt: new Date().toISOString(),
      CreatedBy: activeUser.Email
    };
    await dbService.saveComment(newComment);
    await loadDatabase();
  };


  // Simulated Recurrence engine running from thread trigger
  const runSimulatedRecurrenceEngine = async () => {
    setIsSimulatingRecurrence(true);
    try {
      const result = await checkAndGenerateRecurringTasks(templates, tasks);
      if (result.generatedCount > 0) {
        await loadDatabase();
        
        // Fire custom template based emails for every generated task card
        for (const t of result.newTasks) {
          const alertMsg = formatEmailTemplate('template_assigned_email', t);
          triggerNotification(
            'Task Assignment',
            alertMsg,
            t.AssignedToEmail
          );
        }

        setSimulationMessage({
          type: 'success',
          text: `Recurrence Scheduler simulation completed! Generated ${result.generatedCount} new due task instances successfully.`
        });
      } else {
        setSimulationMessage({
          type: 'info',
          text: "Recurrence Scheduler simulation completed. All recurring profiles are already synthesized and up-to-date for their active cycle."
        });
      }
    } catch (e) {
      console.error(e);
      setSimulationMessage({
        type: 'error',
        text: "Error executing recurrence checks: " + (e instanceof Error ? e.message : String(e))
      });
    } finally {
      setIsSimulatingRecurrence(false);
    }
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
      <Dashboard
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
          localStorage.removeItem('trustgrid_active_user_email');
          setActiveUserEmail('');
          setActiveUser(null);
        }}
        templates={templates}
        users={users}
        onAddUser={() => setIsAddUserModalOpen(true)}
        onEditProfile={() => setIsEditProfileModalOpen(true)}
        onChangePassword={() => setIsChangePasswordModalOpen(true)}
        onConfigureNotifications={() => setIsConfigureNotificationsModalOpen(true)}
        onToggleUserActive={(userId, active) => {
          setUsers(prev => prev.map(u => u.UserID === userId ? { ...u, Active: active } : u));
        }}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onSyncDatabase={handleManualSync}
        isSyncing={isSyncingSheets}
        lastSyncTime={lastSyncTime}
        dbConnectionStatus={dbConnectionStatus}
      />

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
                TeamID: `TM-${Date.now()}`,
                TeamName: userData.TeamName,
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

      </AnimatePresence>
    </div>
  );
}

