                                                                          import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllSubordinates } from '../../../utils/userUtils';
import { generateReportWithAttachments, AttachmentInfo } from '../../../utils/pdfGenerator';
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
  CheckCircle2,
  AlertCircle,
  Bell,
  Activity,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
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
  Loader2,
  Download,
  Upload,
  File
} from 'lucide-react';
import { Task, User as UserType, TaskTemplate, AppSetting, Team, TaskReport, AuditLog, EmailTemplate, TeamSubmission } from '../../../types';
import { ROLE, isAdminLevel } from '../../../constants/status';
import AdminPanel from '../../AdminPanel';
import TaskList from '../tasks/TaskList';
import TaskFilters from '../tasks/TaskFilters';
import MultiselectDropdown from '../../shared/MultiselectDropdown';
import BulkActionBar from '../../shared/BulkActionBar';
import { useRowSelection } from '../../../hooks/useRowSelection';
import { uploadFile } from '../../../api/upload';

interface DashboardProps {
  tasks: Task[];
  currentUser: UserType;
  onNewTask: (assigneeEmail?: string, teamIds?: string[]) => void;
  onTaskClick: (task: Task) => void;
  onLogout: () => void;
  templates?: TaskTemplate[];
  onViewChange?: (view: 'overview' | 'tasks' | 'team' | 'reports' | 'admin' | 'settings' | 'scheduled-tasks') => void;
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
  audits?: AuditLog[];
  settings?: AppSetting[];
  emailTemplates?: EmailTemplate[];
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
  reports?: TaskReport[];
  syncStatus?: 'synced' | 'syncing' | 'error';
  teamSubmissions?: TeamSubmission[];
  onAddTeamSubmission?: (submission: TeamSubmission) => void;
  triggerNotification?: (type: string, message: string, emailSentTo: string) => void;
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
  emailTemplates = [],
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
  reports = [],
  syncStatus = 'synced',
  teamSubmissions = [],
  onAddTeamSubmission = () => {},
  triggerNotification = () => {},
}: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'overview' | 'tasks' | 'team' | 'reports' | 'admin' | 'settings' | 'scheduled-tasks'>('overview');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState<string[]>([]);
  const [filterTeamIDs, setFilterTeamIDs] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [taskSubView, setTaskSubView] = useState<'my-tasks' | 'team-tasks' | 'assigned-by-me'>('my-tasks');
  const [taskContentType, setTaskContentType] = useState<'tasks' | 'schedules'>('tasks');
  const [lastActionTime, setLastActionTime] = useState(Date.now());
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [selectedReportTaskId, setSelectedReportTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [showFlatView, setShowFlatView] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Scheduled Tasks submission state
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [submissionTeamId, setSubmissionTeamId] = useState<string | null>(null);
  const [submissionNote, setSubmissionNote] = useState('');
  const [submissionFiles, setSubmissionFiles] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Row selection for reports - MUST be at top level, not inside renderReports
  const [dateFilteredReports, setDateFilteredReports] = useState<TaskReport[]>([]);

  // Compute filtered reports when dependencies change - NOT during render
  useEffect(() => {
    if (!reports || reports.length === 0) {
      setDateFilteredReports([]);
      return;
    }

    const taskReports = reports.filter(r => {
      const task = tasks?.find(t => t.TaskID === r.TaskID);
      return task && (task.Status === 'Submitted' || task.Status === 'In Progress');
    });

    // Apply team filter to reports
    const teamFilteredReports = filterTeamIDs.length > 0
      ? taskReports.filter(r => {
          const task = tasks?.find(t => t.TaskID === r.TaskID);
          return task && filterTeamIDs.some(teamId =>
            task.AssignedToTeamIDs?.includes(teamId) || task.TeamID === teamId
          );
        })
      : taskReports;

    // Apply stakeholder/assignee filter to reports
    const assigneeFilteredReports = filterAssignee.length > 0
      ? teamFilteredReports.filter(r => {
          const task = tasks?.find(t => t.TaskID === r.TaskID);
          return task && filterAssignee.some(email =>
            task.AssignedToEmail?.toLowerCase().includes(email.toLowerCase()) ||
            task.AssignedByEmail?.toLowerCase() === email.toLowerCase() ||
            r.SubmittedByEmail?.toLowerCase() === email.toLowerCase()
          );
        })
      : teamFilteredReports;

    // Apply date range filter to reports
    const newDateFilteredReports = assigneeFilteredReports.filter(r => {
      if (filterDateFrom && r.ReportDate < filterDateFrom) return false;
      if (filterDateTo && r.ReportDate > filterDateTo) return false;
      return true;
    });

    setDateFilteredReports(newDateFilteredReports);
  }, [reports, tasks, filterTeamIDs, filterAssignee, filterDateFrom, filterDateTo]);

  const {
    selectedIds: selectedReportIds,
    selectedCount: selectedReportCount,
    allSelected: allReportsSelected,
    someSelected: someReportsSelected,
    toggleSelection: toggleReportSelection,
    toggleSelectAll: toggleSelectAllReports,
    clearSelection: clearReportSelection,
    isSelected: isReportSelected,
  } = useRowSelection<TaskReport>({
    items: dateFilteredReports,
    getItemId: (report) => report.ReportID,
  });

  // Bulk download handler - MUST be at top level, not inside renderReports
  const handleBulkDownload = async () => {
    for (const reportId of selectedReportIds) {
      const report = dateFilteredReports.find(r => r.ReportID === reportId);
      if (report) {
        await handleDownloadReportWithAttachments(report.TaskID);
      }
    }
    clearReportSelection();
  };

  // Handle file upload for team submission
  const handleSubmissionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    const newUploadedFiles: Array<{ name: string; type: string; data: string }> = [];

    for (const file of files) {
      try {
        const reader = new FileReader();
        const data = await new Promise<string>((resolve, reject) => {
          reader.onload = (event) => resolve(event.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newUploadedFiles.push({
          name: file.name,
          type: file.type,
          data
        });
      } catch (error) {
        console.error('Error reading file:', error);
      }
    }

    setSubmissionFiles(prev => [...prev, ...newUploadedFiles]);
  };

  const removeSubmissionFile = (index: number) => {
    setSubmissionFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Handle team submission
  const handleTeamSubmission = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!submissionTeamId || (!submissionNote.trim() && submissionFiles.length === 0)) {
      setSubmissionError('Please provide a note or upload at least one file');
      setTimeout(() => setSubmissionError(null), 3000);
      return;
    }

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      // FIX: generate the submission ID up front so it can be used both for
      // the Cloudinary upload folder path and the submission record itself.
      // Previously no id was passed to uploadFile() at all here, which caused
      // uploads to land in "TaskReports/undefined/undefined/..." on the backend
      // (that endpoint always expected a taskId+reportId or teamId+submissionId
      // pair; team submissions were never passing either).
      const submissionId = `SUB-${Math.floor(Math.random() * 10000)}`;

      // Upload files if any
      let attachmentLinks = '';
      if (submissionFiles.length > 0) {
        const uploadedUrls: string[] = [];

        for (const file of submissionFiles) {
          try {
            const uploadResult = await uploadFile({
              fileName: file.name,
              fileData: file.data,
              mimeType: file.type,
              teamId: submissionTeamId,
              submissionId: submissionId,
            });
            uploadedUrls.push(uploadResult.webViewLink);
          } catch (error) {
            console.error('Error uploading file:', error);
          }
        }

        if (uploadedUrls.length > 0) {
          attachmentLinks = uploadedUrls.join(',');
        }
      }

      // Create submission
      const newSubmission: TeamSubmission = {
        SubmissionID: submissionId,
        TeamID: submissionTeamId,
        SubmittedBy: currentUser.Email,
        SubmittedAt: new Date().toISOString(),
        Note: submissionNote.trim() || undefined,
        AttachmentLinks: attachmentLinks || undefined,
      };

      onAddTeamSubmission(newSubmission);

      // Reset state
      setSubmissionNote('');
      setSubmissionFiles([]);
      setSubmissionSuccess(true);
      setTimeout(() => setSubmissionSuccess(false), 3000);
      setSubmissionModalOpen(false);
      setSubmissionTeamId(null);

    } catch (error) {
      console.error('Error submitting report:', error);
      setSubmissionError('Failed to submit report. Please try again.');
      setTimeout(() => setSubmissionError(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if any modal is open
  const isAnyModalOpen = isDrawerOpen || isTaskModalOpen || isReportModalOpen || 
    isFollowUpModalOpen || isEditProfileModalOpen || isChangePasswordModalOpen ||
    isConfigureNotificationsModalOpen || isAddUserModalOpen || isAddTeamModalOpen;

  // Check if current user is a team leader for any team
  const isUserTeamLeader = () => {
    if (isAdminLevel(currentUser.Role)) return true;
    return teams.some(team => team.TeamLeaderEmails?.includes(currentUser.Email));
  };

  // Persist sidebar collapse state
  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', isSidebarCollapsed ? 'true' : 'false');
  }, [isSidebarCollapsed]);

  // Sync filters with URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status');
    const priorityParam = params.get('priority');
    const assigneesParam = params.get('assignees');
    const teamsParam = params.get('teams');
    const dateFromParam = params.get('dateFrom');
    const dateToParam = params.get('dateTo');

    if (statusParam) setFilterStatus(statusParam);
    if (priorityParam) setFilterPriority(priorityParam);
    if (assigneesParam) setFilterAssignee(assigneesParam.split(','));
    if (teamsParam) setFilterTeamIDs(teamsParam.split(','));
    if (dateFromParam) setFilterDateFrom(dateFromParam);
    if (dateToParam) setFilterDateTo(dateToParam);
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (filterStatus !== 'All') params.set('status', filterStatus);
    else params.delete('status');
    if (filterPriority !== 'All') params.set('priority', filterPriority);
    else params.delete('priority');
    if (filterAssignee.length > 0) params.set('assignees', filterAssignee.join(','));
    else params.delete('assignees');
    if (filterTeamIDs.length > 0) params.set('teams', filterTeamIDs.join(','));
    else params.delete('teams');
    if (filterDateFrom) params.set('dateFrom', filterDateFrom);
    else params.delete('dateFrom');
    if (filterDateTo) params.set('dateTo', filterDateTo);
    else params.delete('dateTo');

    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newUrl);
  }, [filterStatus, filterPriority, filterAssignee, filterTeamIDs, filterDateFrom, filterDateTo]);

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
    view: 'overview' | 'tasks' | 'team' | 'reports' | 'admin' | 'settings' | 'scheduled-tasks',
    filterStatus?: string,
    filterType?: 'status' | 'dueDate' | 'completedThisWeek'
  ) => {
    if (activeView !== view) {
      // Push to browser history
      window.history.pushState({ view: activeView }, '', `#${view}`);
    }
    setActiveView(view);
    setIsSidebarVisible(false);
    
    // Reset filters first
    setFilterStatus('All');
    setFilterPriority('All');
    setFilterAssignee([]);
    setFilterTeamIDs([]);
    setFilterDateFrom('');
    setFilterDateTo('');
    
    if (filterStatus && filterType === 'status') {
      setFilterStatus(filterStatus);
    } else if (filterStatus && filterType === 'dueDate') {
      const today = new Date().toISOString().split('T')[0];
      if (filterStatus === 'today') {
        setFilterDateFrom(today);
        setFilterDateTo(today);
      }
    } else if (filterStatus && filterType === 'completedThisWeek') {
      // Set status to Closed and date range to last 7 days
      setFilterStatus('Closed');
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const today = new Date().toISOString().split('T')[0];
      setFilterDateFrom(oneWeekAgo.toISOString().split('T')[0]);
      setFilterDateTo(today);
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

  // Get team members based on user role with hierarchical visibility
  const getTeamMembers = () => {
    if (isAdminLevel(currentUser.Role)) {
      return users || [];
    } else if (currentUser.Role === ROLE.STAKEHOLDER) {
      // Stakeholders see themselves and all hierarchical subordinates
      const subordinateEmails = getAllSubordinates(currentUser.Email, users || []);
      return (users || []).filter(u =>
        u.Email === currentUser.Email ||
        subordinateEmails.includes(u.Email)
      );
    } else {
      // Sub-stakeholders see only themselves
      return (users || []).filter(u => u.Email === currentUser.Email);
    }
  };

  const getFilteredTasks = () => {
    // First apply role-based filtering using taskSubView
    const subView = currentUser.Role === ROLE.SUB_STAKEHOLDER ? 'my-tasks' : taskSubView;
    
    // Get hierarchical subordinates for the current user (if they are a stakeholder)
    const subStakeholderEmails = currentUser.Role === ROLE.STAKEHOLDER 
      ? getAllSubordinates(currentUser.Email, users || [])
      : [];
    
    // Get team members for the current user
    const myTeamMembers = currentUser.TeamIDs && currentUser.TeamIDs.length > 0
      ? (users || []).filter(u => u.TeamIDs.some(teamId => currentUser.TeamIDs.includes(teamId)))
      : [];
    
    const teamMemberEmails = myTeamMembers.map(u => u.Email.toLowerCase());
    
    const roleFiltered = (tasks || []).filter(task => {
      // Admin: My Tasks = assigned to me, Team Tasks = all tasks, Assigned by Me = tasks I assigned
      if (isAdminLevel(currentUser.Role)) {
        if (subView === 'my-tasks') {
          return task.AssignedToEmail?.toLowerCase().includes(currentUser.Email.toLowerCase());
        }
        if (subView === 'assigned-by-me') {
          return task.AssignedByEmail?.toLowerCase() === currentUser.Email.toLowerCase();
        }
        // team-tasks - show all tasks
        return true;
      }
      
      // Stakeholder: My Tasks = assigned to me, Team Tasks = hierarchical sub-stakeholder tasks
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
        // team-tasks / assigned-by-me - show hierarchical sub-stakeholder tasks
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
      // Handle comma-separated status values
      const statusValues = filterStatus.split(',').map(s => s.trim());
      filtered = filtered.filter(t => statusValues.includes(t.Status));
    }
    if (filterPriority !== 'All') {
      filtered = filtered.filter(t => t.Priority === filterPriority);
    }
    if (filterAssignee.length > 0) {
      filtered = filtered.filter(t =>
        filterAssignee.some(email => t.AssignedToEmail?.includes(email))
      );
    }
    if (filterTeamIDs.length > 0) {
      filtered = filtered.filter(t =>
        filterTeamIDs.some(teamId => t.AssignedToTeamIDs?.includes(teamId) || t.TeamID === teamId)
      );
    }
    if (filterDateFrom) {
      filtered = filtered.filter(t => {
        // For completed tasks, use CompletionDate; otherwise use DueDate
        if (t.Status === 'Closed' || t.Status === 'Reviewed') {
          return t.CompletionDate && t.CompletionDate >= filterDateFrom;
        }
        return t.DueDate >= filterDateFrom;
      });
    }
    if (filterDateTo) {
      filtered = filtered.filter(t => {
        // For completed tasks, use CompletionDate; otherwise use DueDate
        if (t.Status === 'Closed' || t.Status === 'Reviewed') {
          return t.CompletionDate && t.CompletionDate <= filterDateTo;
        }
        return t.DueDate <= filterDateTo;
      });
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
    <div className="space-y-6 sm:space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => handleViewChange('tasks', 'In Progress,Submitted', 'status')}
          className={`border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-blue-500/50' : 'bg-white border-[#E5E7EB]'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <ClipboardList className="text-blue-400" size={16} />
            </div>
            <span className={`text-[9px] sm:text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Open & in progress</span>
          </div>
          <p className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{activeTasks}</p>
          <p className={`text-[10px] sm:text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active Tasks</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => handleViewChange('tasks', 'Overdue', 'status')}
          className={`border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-red-500/50' : 'bg-white border-[#E5E7EB]'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-red-400" size={16} />
            </div>
            <span className={`text-[9px] sm:text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Past due date</span>
          </div>
          <p className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{overdueTasks}</p>
          <p className={`text-[10px] sm:text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Overdue</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={() => handleViewChange('tasks', 'today', 'dueDate')}
          className={`border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-yellow-500/50' : 'bg-white border-[#E5E7EB]'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <Clock className="text-yellow-400" size={16} />
            </div>
            <span className={`text-[9px] sm:text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Deadline today</span>
          </div>
          <p className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{dueToday}</p>
          <p className={`text-[10px] sm:text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Due Today</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={() => handleViewChange('tasks', 'Closed', 'completedThisWeek')}
          className={`border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B] hover:border-green-500/50' : 'bg-white border-[#E5E7EB]'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-400" size={16} />
            </div>
            <span className={`text-[9px] sm:text-[10px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Last 7 days</span>
          </div>
          <p className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{completedThisWeek}</p>
          <p className={`text-[10px] sm:text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Completed This Week</p>
        </motion.div>
      </div>

      {/* Needs Attention Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className={`border rounded-xl ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}
      >
        <div className={`p-4 sm:p-6 border-b flex items-center justify-between border-[#E5E7EB] ${isDarkMode ? 'border-[#1E293B]' : ''}`}>
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Bell className="text-orange-400" size={18} />
            <h3 className={`font-semibold text-sm sm:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Needs attention</h3>
            <span className="bg-orange-500/10 text-orange-400 text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-orange-500/20">
              {needsAttention.length} items
            </span>
          </div>
          <button onClick={() => handleViewChange('tasks')} className="text-blue-400 text-[10px] sm:text-sm font-medium hover:text-blue-300 flex items-center space-x-1">
            <span className="hidden sm:inline">View all active</span>
            <span className="sm:hidden">View all</span>
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
                className={`p-4 sm:p-6 transition-colors cursor-pointer ${isDarkMode ? 'hover:bg-[#1E293B]/30' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                      <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border ${getPriorityColor(task.Priority)}`}>
                        {task.Priority}
                      </span>
                      <span className={`text-[10px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border ${getStatusColor(task.Status)}`}>
                        {task.Status}
                      </span>
                    </div>
                    <h4 className={`font-medium text-sm sm:text-base mb-2 line-clamp-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {task.Title.length > 30 ? task.Title.substring(0, 30) + '...' : task.Title}
                    </h4>
                    <div className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      <span>Due: {task.DueDate} {daysUntil > 0 && `(${dueText})`}</span>
                      <span>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-[10px] sm:text-xs font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{task.TaskID}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Alerts and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className={`border rounded-xl ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}
        >
          <div className={`p-4 sm:p-6 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <AlertTriangle className="text-red-400" size={18} />
              <h3 className={`font-semibold text-sm sm:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Alerts</h3>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-3 sm:space-y-4">
            {alerts.length > 0 ? (
              alerts.map((task) => {
                const isOverdue = task.DueDate < today;
                return (
                  <div
                    key={task.TaskID}
                    onClick={(e) => { e.preventDefault(); onTaskClick(task); }}
                    className={`${isOverdue ? 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20' : 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20'} border rounded-lg p-3 sm:p-4 cursor-pointer transition-colors`}
                  >
                    <div className="flex items-start space-x-2 sm:space-x-3">
                      {isOverdue ? (
                        <AlertTriangle className="text-red-400 mt-0.5" size={16} />
                      ) : (
                        <Bell className="text-yellow-400 mt-0.5" size={16} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-xs sm:text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                          {isOverdue ? 'Overdue task' : 'High priority task'}
                        </p>
                        <p className={`text-[10px] sm:text-xs mt-1 line-clamp-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {task.TaskID}: {task.Title.length > 50 ? task.Title.substring(0, 50) + '...' : task.Title}
                        </p>
                        <p className={`text-[10px] sm:text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          Due: {task.DueDate} &bull; Priority: {task.Priority}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={`text-center py-6 sm:py-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <CheckCircle className="mx-auto mb-2 text-green-400" size={24} />
                <p className="text-xs sm:text-sm">No alerts at this time</p>
                <p className="text-[10px] sm:text-xs mt-1">All tasks are on track</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className={`border rounded-xl ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}
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
              ? (isAdminLevel(currentUser.Role) ? 'Manage all tasks' : 'Manage your assigned tasks')
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
      {taskContentType === 'tasks' && (isAdminLevel(currentUser.Role) || currentUser.Role === ROLE.STAKEHOLDER) && (
        <div className={`border rounded-xl p-4 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
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
              {isAdminLevel(currentUser.Role) ? 'Team Tasks' : 'Assigned by Me'}
            </button>
            {/* Admin-only: Assigned by Me filter option */}
            {isAdminLevel(currentUser.Role) && (
              <button
                onClick={() => setTaskSubView('assigned-by-me')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  taskSubView === 'assigned-by-me'
                    ? 'bg-blue-500 text-white'
                    : isDarkMode
                    ? 'bg-[#1E293B] text-slate-400 hover:text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                Assigned by Me
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Show tasks content */}
      {taskContentType === 'tasks' && (
        <>
          <TaskFilters
            filterStatus={filterStatus}
            filterPriority={filterPriority}
            filterAssigneeNames={filterAssignee}
            filterTeamIDs={filterTeamIDs}
            filterDateFrom={filterDateFrom}
            filterDateTo={filterDateTo}
            currentUser={currentUser}
            users={users}
            teams={teams}
            isDarkMode={isDarkMode}
            onFilterStatusChange={setFilterStatus}
            onFilterPriorityChange={setFilterPriority}
            onFilterAssigneeNamesChange={setFilterAssignee}
            onFilterTeamIDsChange={setFilterTeamIDs}
            onFilterDateFromChange={setFilterDateFrom}
            onFilterDateToChange={setFilterDateTo}
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
        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
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
                        className={`px-3 py-1 text-xs font-bold tracking-wider rounded-lg transition-colors ${
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
        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {isAdminLevel(currentUser.Role) ? 'Teams & Members' : 'Team Members'}
              </h3>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {isAdminLevel(currentUser.Role) ? 'Manage teams and their members' :
                 currentUser.Role === ROLE.STAKEHOLDER ? 'Your sub-stakeholders' :
                 'Your manager'}
              </p>
            </div>
            {isAdminLevel(currentUser.Role) && (
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

          {isAdminLevel(currentUser.Role) ? (
            <div className="space-y-4">
              {Object.entries(groupedTeams).map(([teamName, teamUsers]) => (
                <div key={teamName} className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-[#E5E7EB]'}`}>
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
                        onClick={() => {
                          const teamObj = (teams || []).find(t => t.TeamName === teamName);
                          onNewTask(teamUsers.map(u => u.Email).join(', '), teamObj ? [teamObj.TeamID] : undefined);
                        }}
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

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleDownloadReportWithAttachments = async (taskId: string) => {
    setIsGeneratingPdf(true);
    try {
      const task = tasks?.find(t => t.TaskID === taskId);
      const taskReports = reports?.filter(r => r.TaskID === taskId);
      
      if (!task || !taskReports || taskReports.length === 0) {
        console.error('Task or reports not found');
        setIsGeneratingPdf(false);
        return;
      }

      // Build report content
      let reportContent = `Task: ${task.Title}\n`;
      reportContent += `Task ID: ${task.TaskID}\n`;
      reportContent += `Status: ${task.Status}\n`;
      reportContent += `Priority: ${task.Priority}\n`;
      reportContent += `Due Date: ${task.DueDate}\n`;
      reportContent += `Assigned To: ${task.AssignedToEmail}\n\n`;
      
      taskReports.forEach((report, index) => {
        reportContent += `--- Report ${index + 1} ---\n`;
        reportContent += `Submitted By: ${report.SubmittedByEmail}\n`;
        reportContent += `Date: ${report.ReportDate}\n`;
        reportContent += `Status: ${report.StatusUpdate}\n`;
        reportContent += `Progress: ${report.PercentComplete}%\n\n`;
        reportContent += `Work Summary:\n${report.WorkSummary}\n\n`;
        if (report.Blockers) {
          reportContent += `Blockers:\n${report.Blockers}\n\n`;
        }
        if (report.NextAction) {
          reportContent += `Next Action:\n${report.NextAction}\n\n`;
        }
      });

      // Extract attachments
      const attachments: AttachmentInfo[] = [];
      taskReports.forEach(report => {
        if (report.AttachmentLink) {
          const links = report.AttachmentLink.split(',').map(l => l.trim()).filter(l => l);
          links.forEach((link, idx) => {
            const fileName = `attachment-${idx + 1}`;
            const fileType = getFileTypeFromUrl(link);
            attachments.push({
              url: link,
              name: fileName,
              type: fileType
            });
          });
        }
      });

      // Generate PDF
      const pdfBlob = await generateReportWithAttachments(
        reportContent,
        attachments,
        `Report-${task.TaskID}-${task.Title.replace(/[^a-zA-Z0-9]/g, '-')}`
      );

      // Download the PDF
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Report-${task.TaskID}-${task.Title.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const getFileTypeFromUrl = (url: string): string => {
    if (url.includes('.pdf')) return 'application/pdf';
    if (url.includes('.doc') || url.includes('.docx')) return 'application/msword';
    if (url.includes('.xls') || url.includes('.xlsx')) return 'application/vnd.ms-excel';
    if (url.match(/\.(jpg|jpeg|png|gif)$/i)) return 'image/jpeg';
    if (url.includes('.mp4') || url.includes('.mov')) return 'video/mp4';
    return 'application/octet-stream';
  };

  const handleDownloadTeamSubmission = async (submission: TeamSubmission, teamName: string) => {
    setIsGeneratingPdf(true);
    try {
      const submitter = users.find(u => u.Email === submission.SubmittedBy);
      let reportContent = `Team: ${teamName}\n`;
      reportContent += `Submitted By: ${submitter?.FullName || submission.SubmittedBy}\n`;
      reportContent += `Email: ${submission.SubmittedBy}\n`;
      reportContent += `Date: ${new Date(submission.SubmittedAt).toLocaleString()}\n\n`;
      if (submission.Note) {
        reportContent += `Note:\n${submission.Note}\n\n`;
      }

      const attachments: AttachmentInfo[] = [];
      if (submission.AttachmentLinks) {
        submission.AttachmentLinks.split(',').map(l => l.trim()).filter(l => l).forEach((link, idx) => {
          attachments.push({
            url: link,
            name: `attachment-${idx + 1}`,
            type: getFileTypeFromUrl(link),
          });
        });
      }

      const safeTeamName = teamName.replace(/[^a-zA-Z0-9]/g, '-');
      const pdfBlob = await generateReportWithAttachments(
        reportContent,
        attachments,
        `TeamReport-${safeTeamName}`
      );

      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `TeamReport-${safeTeamName}-${submission.SubmissionID.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating team submission PDF:', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderReports = () => {
    if (!reports || reports.length === 0) {
      return (
        <div className="space-y-6">
          <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
            <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              No reports found
            </div>
          </div>
        </div>
      );
    }

    const taskReports = reports.filter(r => {
      const task = tasks?.find(t => t.TaskID === r.TaskID);
      return task && (task.Status === 'Submitted' || task.Status === 'In Progress');
    });

    // Apply team filter to reports
    const teamFilteredReports = filterTeamIDs.length > 0
      ? taskReports.filter(r => {
          const task = tasks?.find(t => t.TaskID === r.TaskID);
          return task && filterTeamIDs.some(teamId => 
            task.AssignedToTeamIDs?.includes(teamId) || task.TeamID === teamId
          );
        })
      : taskReports;

    // Apply stakeholder/assignee filter to reports
    const assigneeFilteredReports = filterAssignee.length > 0
      ? teamFilteredReports.filter(r => {
          const task = tasks?.find(t => t.TaskID === r.TaskID);
          return task && filterAssignee.some(email => 
            task.AssignedToEmail?.toLowerCase().includes(email.toLowerCase()) ||
            task.AssignedByEmail?.toLowerCase() === email.toLowerCase() ||
            r.SubmittedByEmail?.toLowerCase() === email.toLowerCase()
          );
        })
      : teamFilteredReports;

    // Apply date range filter to reports
    const newDateFilteredReports = assigneeFilteredReports.filter(r => {
      if (filterDateFrom && r.ReportDate < filterDateFrom) return false;
      if (filterDateTo && r.ReportDate > filterDateTo) return false;
      return true;
    });

    // Group reports by task
    const reportsByTask = new Map<string, { task: Task | undefined, reports: TaskReport[] }>();
    newDateFilteredReports.forEach(report => {
      const task = tasks?.find(t => t.TaskID === report.TaskID);
      if (!reportsByTask.has(report.TaskID)) {
        reportsByTask.set(report.TaskID, { task, reports: [] });
      }
      reportsByTask.get(report.TaskID)!.reports.push(report);
    });

    // Filter by search query
    const filteredTasks = Array.from(reportsByTask.entries()).filter(([taskId, { task }]) => {
      if (!searchQuery) return true;
      if (!task) return false;
      return (
        (task.Title && task.Title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (task.TaskID && task.TaskID.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (task.AssignedToEmail && task.AssignedToEmail.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    });

    return (
      <div className="space-y-6">
        <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Progress Reports</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowFlatView(!showFlatView)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                  !showFlatView
                    ? 'bg-blue-500 text-white'
                    : isDarkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {showFlatView ? 'Grouped View' : 'Flat View'}
              </button>
              <button
                onClick={() => {
                  // Download all visible reports
                  const visibleTaskIds = Array.from(reportsByTask.keys());
                  if (visibleTaskIds.length > 0) {
                    handleDownloadReportWithAttachments(visibleTaskIds[0]);
                  }
                }}
                disabled={isGeneratingPdf || newDateFilteredReports.length === 0}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 ${
                  isDarkMode
                    ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isGeneratingPdf ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span>Download with Attachments</span>
              </button>
            </div>
          </div>

          {/* Report Filters */}
          <div className={`border border-[#E5E7EB] bg-white rounded-xl p-4 flex flex-wrap gap-4 items-center mb-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : ''}`}>
            <div className={`flex items-center space-x-2 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <Filter size={16} />
              <span>Filters:</span>
            </div>

            {/* Team Filter for Reports */}
            <MultiselectDropdown
              label="Teams"
              options={teams.filter(t => t.Active).map(team => ({ value: team.TeamID, label: team.TeamName }))}
              selectedValues={filterTeamIDs}
              onSelectionChange={setFilterTeamIDs}
              isDarkMode={isDarkMode}
              badgeColor="emerald"
            />

            {/* Stakeholder Filter for Reports */}
            <MultiselectDropdown
              label="Stakeholders"
              options={getTeamMembers().filter(u => u.Active).map(user => ({ value: user.Email, label: user.FullName }))}
              selectedValues={filterAssignee}
              onSelectionChange={setFilterAssignee}
              isDarkMode={isDarkMode}
              showSearch={true}
              badgeColor="blue"
            />

            {/* Date Range Filter for Reports */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                <Calendar size={16} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className={`bg-transparent focus:outline-none text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                  placeholder="From"
                />
              </div>
              <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>to</span>
              <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                <Calendar size={16} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className={`bg-transparent focus:outline-none text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                  placeholder="To"
                />
              </div>
            </div>

            {(filterTeamIDs.length > 0 || filterDateFrom || filterDateTo) && (
              <button
                onClick={() => {
                  setFilterTeamIDs([]);
                  setFilterDateFrom('');
                  setFilterDateTo('');
                }}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                  isDarkMode 
                    ? 'text-slate-400 hover:text-white hover:bg-[#334155]/50' 
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Clear Filters
              </button>
            )}
          </div>

          {showFlatView ? (
            // Flat view - all reports in one list
            <div className="space-y-3">
              {/* Select All Header for Flat View */}
              {newDateFilteredReports.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 dark:bg-[#1E293B] rounded-t-lg border-b border-slate-200 dark:border-[#334155]">
                  <input
                    type="checkbox"
                    checked={allReportsSelected}
                    ref={input => {
                      if (input) input.indeterminate = someReportsSelected;
                    }}
                    onChange={toggleSelectAllReports}
                    className="w-4 h-4 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-sm text-muted">Select all reports</span>
                </div>
              )}
              {newDateFilteredReports.length > 0 ? (
                newDateFilteredReports.map((report) => {
                  const task = tasks?.find(t => t.TaskID === report.TaskID);
                  if (!task) return null;
                  return (
                    <div
                      key={report.ReportID}
                      className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isReportSelected(report.ReportID)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleReportSelection(report.ReportID);
                          }}
                          className="w-4 h-4 mt-1 rounded border-slate-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className={`text-xs font-mono mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                Report ID: {report.ReportID || 'N/A'}
                              </div>
                              <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                Submitted by: {report.SubmittedByEmail || 'Unknown'}
                              </div>
                              <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                Date: {report.ReportDate || 'N/A'}
                              </div>
                            </div>
                        <span className={`text-xs font-bold px-2 py-1 rounded border ${
                          report.StatusUpdate === 'Submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                          report.StatusUpdate === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                        }`}>
                          {report.StatusUpdate || 'Unknown'}
                        </span>
                      </div>
                      <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Work summary</div>
                        <p className="text-sm">{report.WorkSummary || 'No work summary provided'}</p>
                      </div>
                      {report.Blockers && (
                        <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Blockers</div>
                          <p className="text-sm">{report.Blockers}</p>
                        </div>
                      )}
                      {report.NextAction && (
                        <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                          <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Next action</div>
                          <p className="text-sm">{report.NextAction}</p>
                        </div>
                      )}
                      {report.AttachmentLink && (
                        <div className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                          <a href={report.AttachmentLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                            <Link size={14} />
                            <span>View Attachment</span>
                          </a>
                        </div>
                      )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No reports found</div>
              )}
            </div>
          ) : (
            // Grouped view - by task
            <div className="space-y-4">
              {filteredTasks.length > 0 ? (
                filteredTasks.map(([taskId, { task, reports: taskReports }]) => {
                  if (!task) return null;
                  const isExpanded = expandedTaskIds.has(taskId);
                  return (
                    <div key={taskId} className={`border rounded-lg ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                      {/* Task header - clickable to expand/collapse */}
                      <button
                        onClick={() => toggleTaskExpansion(taskId)}
                        className="w-full p-4 flex items-center justify-between hover:bg-slate-100/50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <div className="flex-1 text-left">
                          <h4 className={`font-medium mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{task.Title || 'Untitled Task'}</h4>
                          <div className={`flex items-center space-x-4 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            <span>Task: {task.TaskID || 'N/A'}</span>
                            <span>Due: {task.DueDate || 'N/A'}</span>
                            <span>{taskReports.length} report{taskReports.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadReportWithAttachments(taskId);
                            }}
                            disabled={isGeneratingPdf}
                            className={`p-2 rounded-lg transition-colors ${
                              isDarkMode
                                ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title="Download with Attachments"
                          >
                            {isGeneratingPdf ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                          <span className={`text-xs font-bold px-2 py-1 rounded border ${
                            task.Status === 'Submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                          }`}>
                            {task.Status || 'Unknown'}
                          </span>
                          <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                      
                      {/* Reports - shown when expanded */}
                      {isExpanded && (
                        <div className="p-4 pt-0 space-y-3">
                          {taskReports.map((report) => (
                            <div
                              key={report.ReportID}
                              className={`border border-[#E5E7EB] bg-white rounded-lg p-4 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : ''}`}
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div className={`text-xs font-mono mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Report ID: {report.ReportID || 'N/A'}
                                  </div>
                                  <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Submitted by: {report.SubmittedByEmail || 'Unknown'}
                                  </div>
                                  <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    Date: {report.ReportDate || 'N/A'}
                                  </div>
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded border ${
                                  report.StatusUpdate === 'Submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                  report.StatusUpdate === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                }`}>
                                  {report.StatusUpdate || 'Unknown'}
                                </span>
                              </div>
                              <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Work summary</div>
                                <p className="text-sm">{report.WorkSummary || 'No work summary provided'}</p>
                              </div>
                              {report.Blockers && (
                                <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                  <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Blockers</div>
                                  <p className="text-sm">{report.Blockers}</p>
                                </div>
                              )}
                              {report.NextAction && (
                                <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                  <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Next action</div>
                                  <p className="text-sm">{report.NextAction}</p>
                                </div>
                              )}
                              {report.AttachmentLink && (
                                <div className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                  <a href={report.AttachmentLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                    <Link size={14} />
                                    <span>View Attachment</span>
                                  </a>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className={`p-12 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No reports found</div>
              )}
            </div>
          )}

          {/* Bulk Action Bar for Reports */}
          <BulkActionBar
            selectedCount={selectedReportCount}
            actions={[
              {
                label: 'Download with Attachments',
                icon: <Download size={16} />,
                onClick: handleBulkDownload,
                variant: 'primary',
              },
            ]}
            onClear={clearReportSelection}
          />
        </div>
      </div>
    );
  };

  const renderAdmin = () => (
    <AdminPanel
      users={users}
      templates={templates}
      settings={settings}
      emailTemplates={emailTemplates}
      teams={teams}
      currentUserEmail={currentUser.Email}
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
      onSendInviteEmail={(email, fullName, role) => {
        const inviteMessage = `Welcome to PMS! Your account has been created as ${role}. You can now log in with your credentials.`;
        triggerNotification('Task Assignment', inviteMessage, email);
      }}
      isDarkMode={isDarkMode}
    />
  );

  const renderScheduledTasks = () => {
    // Filter teams based on user role - Admin sees all, Team Leader or Stakeholder see their own
    const visibleTeams = isAdminLevel(currentUser.Role)
      ? teams.filter(t => t.Active)
      : teams.filter(t => 
          (t.TeamLeaderEmails?.includes(currentUser.Email) && t.Active) ||
          (t.StakeholderEmails?.includes(currentUser.Email) && t.Active)
        );

    return (
      <div className="space-y-4 sm:space-y-6">
        <div className={`border rounded-xl p-4 sm:p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <h3 className={`font-semibold text-base sm:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Scheduled Tasks</h3>
              <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Weekly report submissions by team
              </p>
            </div>
            {submissionSuccess && (
              <div className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium ${isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'}`}>
                Report submitted successfully!
              </div>
            )}
          </div>

          {visibleTeams.length === 0 ? (
            <div className={`p-8 sm:p-12 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {isAdminLevel(currentUser.Role) ? 'No teams available' : 'You are not assigned as a team leader to any team'}
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {visibleTeams.map(team => {
                const teamMembers = users.filter(u => u.TeamIDs.includes(team.TeamID));
                const isTeamLeader = team.TeamLeaderEmails?.includes(currentUser.Email);
                const canPost = isTeamLeader || isAdminLevel(currentUser.Role);
                const filteredSubmissions = teamSubmissions.filter(s => s.TeamID === team.TeamID);

                return (
                  <div key={team.TeamID} className={`border rounded-xl p-3 sm:p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                          <Users size={14} className={`shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                        </div>
                        <div className="min-w-0">
                          <h4 className={`font-medium text-sm sm:text-base truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{team.TeamName}</h4>
                          <p className={`text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {teamMembers.length} member{teamMembers.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      {canPost && (
                        <button
                          onClick={() => {
                            setSubmissionTeamId(team.TeamID);
                            setSubmissionModalOpen(true);
                          }}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors flex items-center gap-1 shrink-0"
                        >
                          <Plus size={12} className="shrink-0" />
                          <span>Submit report</span>
                        </button>
                      )}
                    </div>

                    {/* Thread */}
                    <div className={`border-t pt-3 sm:pt-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                      {filteredSubmissions.length === 0 ? (
                        <div className={`p-3 sm:p-4 rounded-lg ${isDarkMode ? 'bg-[#0F141F]' : 'bg-white'}`}>
                          <p className={`text-xs sm:text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} text-center`}>
                            No submissions yet for this team
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 sm:space-y-3">
                          {filteredSubmissions.map(submission => {
                            const submitter = users.find(u => u.Email === submission.SubmittedBy);
                            return (
                              <div key={submission.SubmissionID} className={`p-3 sm:p-4 rounded-lg ${isDarkMode ? 'bg-[#0F141F]' : 'bg-white'}`}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                                      <User size={12} className={`shrink-0 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} />
                                    </div>
                                    <div className="min-w-0">
                                      <p className={`text-xs sm:text-sm font-medium truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                        {submitter?.FullName || submission.SubmittedBy}
                                      </p>
                                      <p className={`text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {new Date(submission.SubmittedAt).toLocaleString()}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleDownloadTeamSubmission(submission, team.TeamName)}
                                    disabled={isGeneratingPdf}
                                    title="Download report"
                                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'hover:bg-[#1E293B] text-slate-400 hover:text-blue-400' : 'hover:bg-slate-100 text-slate-500 hover:text-blue-600'} disabled:opacity-50`}
                                  >
                                    {isGeneratingPdf ? (
                                      <Loader2 size={14} className="animate-spin shrink-0" />
                                    ) : (
                                      <Download size={14} className="shrink-0" />
                                    )}
                                  </button>
                                </div>
                                {submission.Note && (
                                  <p className={`text-xs sm:text-sm mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                    {submission.Note}
                                  </p>
                                )}
                                {submission.AttachmentLinks && (
                                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                    {submission.AttachmentLinks.split(',').map((link, idx) => (
                                      <a
                                        key={idx}
                                        href={link.trim()}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`inline-link-pill text-[10px] sm:text-xs px-2 py-0.5 sm:py-1 rounded border flex items-center gap-1 ${isDarkMode ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'}`}
                                      >
                                        <Link size={10} className="shrink-0" />
                                        <span>Attachment {idx + 1}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Submission Modal */}
        {submissionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.2 }}
              className={`w-full max-w-lg rounded-xl p-4 sm:p-6 shadow-2xl border max-h-[90vh] overflow-y-auto ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}
            >
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className={`font-semibold text-base sm:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Submit Weekly Report
                </h3>
                <button
                  onClick={() => {
                    setSubmissionModalOpen(false);
                    setSubmissionNote('');
                    setSubmissionFiles([]);
                    setSubmissionTeamId(null);
                    setSubmissionError(null);
                  }}
                  className={`p-1 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'hover:bg-[#1E293B] text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                >
                  <X size={16} className="shrink-0" />
                </button>
              </div>

              <form onSubmit={handleTeamSubmission} className="space-y-4">
                {submissionError && (
                  <div className={`p-3 rounded-lg text-xs sm:text-sm ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>
                    {submissionError}
                  </div>
                )}

                <div>
                  <label className={`block text-xs sm:text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Note (optional)
                  </label>
                  <textarea
                    value={submissionNote}
                    onChange={(e) => setSubmissionNote(e.target.value)}
                    placeholder="Add any notes about your weekly report..."
                    rows={3}
                    className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                  />
                </div>

                <div>
                  <label className={`block text-xs sm:text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Attachments (optional)
                  </label>
                  <div className="border-2 border-dashed rounded-lg p-3 sm:p-4 hover:border-blue-500 transition-colors">
                    <input
                      type="file"
                      multiple
                      onChange={handleSubmissionFileUpload}
                      accept="*/*"
                      className="hidden"
                      id="submission-file-upload"
                    />
                    <label
                      htmlFor="submission-file-upload"
                      className="flex flex-col items-center justify-center cursor-pointer"
                    >
                      <Upload size={18} className={`shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                      <p className={`text-xs sm:text-sm font-medium mt-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Click to upload files
                      </p>
                      <p className={`text-[10px] sm:text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} text-center mt-1`}>
                        PPT, Doc, PDF, or any file type
                      </p>
                    </label>
                  </div>

                  {submissionFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {submissionFiles.map((file, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-2 rounded-lg ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <File size={12} className={`shrink-0 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                            <span className={`text-xs sm:text-sm truncate ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{file.name}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeSubmissionFile(index)}
                            className="text-red-500 hover:text-red-600 transition-colors shrink-0 p-0.5"
                          >
                            <X size={12} className="shrink-0" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 sm:gap-3 pt-2 sm:pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setSubmissionModalOpen(false);
                      setSubmissionNote('');
                      setSubmissionFiles([]);
                      setSubmissionTeamId(null);
                      setSubmissionError(null);
                    }}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${isDarkMode ? 'bg-[#1E293B] text-slate-300 hover:bg-[#334155]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || (!submissionNote.trim() && submissionFiles.length === 0)}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${isSubmitting || (!submissionNote.trim() && submissionFiles.length === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'} bg-blue-500 text-white`}
                  >
                    {isSubmitting ? 'Submitting...' : 'Submit report'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </div>
    );
  };

  const renderSettings = () => (
    <div className="space-y-6">
      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
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

      <div className={`border rounded-xl p-6 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
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
      <aside className={`${isSidebarVisible ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:fixed top-0 left-0 h-screen z-50 border-r flex flex-col transition-all duration-300 ease-in-out ${isAnyModalOpen ? 'opacity-40 pointer-events-none' : ''} ${isSidebarCollapsed ? 'md:w-16' : 'md:w-64'} ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
        {/* Logo */}
        <div className={`p-4 border-b flex items-center justify-center ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'} ${isSidebarCollapsed ? 'md:px-2' : 'md:px-6'} flex-shrink-0`}>
          <img src="/pw-logo.jpg" alt="PW Logo" className={`object-contain ${isSidebarCollapsed ? 'w-8 h-8' : 'w-10 h-10'}`} />
          {!isSidebarCollapsed && <span className="ml-3 font-bold text-lg hidden md:block">PMS</span>}
        </div>

        {/* Collapse Toggle Button */}
        <div className={`p-2 border-b flex justify-center ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'} flex-shrink-0`}>
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
          <div className={`p-4 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'} flex-shrink-0`}>
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
        <nav className={`flex-1 overflow-y-auto overflow-x-hidden ${isSidebarCollapsed ? 'px-2 py-4' : 'p-4 space-y-6'}`}>
          {/* Workspace Section */}
          <div>
            {!isSidebarCollapsed && <p className={`text-xs font-bold tracking-wider mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Workspace</p>}
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
              {(isAdminLevel(currentUser.Role) || isUserTeamLeader()) && (
                <li>
                  <button
                    onClick={() => handleViewChange('scheduled-tasks')}
                    className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg transition-colors ${
                      activeView === 'scheduled-tasks' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : isDarkMode ? 'text-slate-400 hover:bg-slate-800/50 hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title={isSidebarCollapsed ? 'Scheduled Tasks' : ''}
                  >
                    <Calendar size={18} />
                    {!isSidebarCollapsed && <span className="font-medium text-sm">Scheduled Tasks</span>}
                  </button>
                </li>
              )}
              {isAdminLevel(currentUser.Role) && (
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
            {!isSidebarCollapsed && <p className={`text-xs font-bold tracking-wider mb-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Account</p>}
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
        <div className={`p-4 border-t ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'} flex-shrink-0`}>
          <button
            onClick={onLogout}
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${isDarkMode ? 'bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300' : 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800'}`}
            title={isSidebarCollapsed ? 'Sign out' : ''}
          >
            <LogOut size={18} />
            {!isSidebarCollapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        {/* Header */}
        <header className={`px-4 md:px-8 py-4 md:py-5 sticky top-0 z-30 border-b ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
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
              {/* Sync Status Indicator */}
              <button
                onClick={onSyncDatabase}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${
                  syncStatus === 'synced'
                    ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : syncStatus === 'syncing'
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}
                title={`Sync status: ${syncStatus}`}
              >
                {syncStatus === 'synced' && <CheckCircle2 size={14} />}
                {syncStatus === 'syncing' && <RefreshCw size={14} className="animate-spin" />}
                {syncStatus === 'error' && <AlertCircle size={14} />}
                <span className="hidden sm:inline">
                  {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Sync Failed'}
                </span>
              </button>
              {/* Profile Button */}
              <button
                onClick={onEditProfile}
                className={`p-2 md:p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'}`}
                title="Profile"
              >
                <User size={20} />
              </button>
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
              {activeView === 'scheduled-tasks' && renderScheduledTasks()}
              {activeView === 'admin' && renderAdmin()}
              {activeView === 'settings' && renderSettings()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}