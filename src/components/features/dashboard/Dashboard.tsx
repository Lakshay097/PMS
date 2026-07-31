import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getAllSubordinates } from '../../../utils/userUtils';
import { getVisibleSubTeamIds, isSubTeamLeader, isTeamLeader } from '../../../utils/subTeamUtils';
import { generateReportWithAttachments, AttachmentInfo } from '../../../utils/pdfGenerator';
import { getUserRoles, getTeamTasksScope, splitEmails, shouldShowTeamTasksTab, shouldShowAssignedByMeTab } from '../../../utils/roleUtils';
import { ROUTES } from '../../../constants/routes';
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
  File,
  Inbox
} from 'lucide-react';
import { Task, User as UserType, TaskTemplate, AppSetting, Team, SubTeam, TaskReport, AuditLog, EmailTemplate, TeamSubmission } from '../../../types';
import { ROLE, isAdminLevel } from '../../../constants/status';
import AdminPanel from '../../AdminPanel';
import TaskList from '../tasks/TaskList';
import TaskFilters from '../tasks/TaskFilters';
import MultiselectDropdown from '../../shared/MultiselectDropdown';
import BulkActionBar from '../../shared/BulkActionBar';
import DashboardSettings from '../../settings/DashboardSettings';
import { useRowSelection } from '../../../hooks/useRowSelection';
import { uploadFile } from '../../../api/upload';
import { sendProofEmail } from '../../../api/teamReminder';
import ReportExportModal from '../../ReportExportModal';
import { getVisibleReports } from '../../../utils/taskUtils';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useTheme } from '../../../contexts/ThemeContext';

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
  onSyncDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  dbConnectionStatus?: 'connected' | 'disconnected' | 'error';
  audits?: AuditLog[];
  settings?: AppSetting[];
  emailTemplates?: EmailTemplate[];
  teams?: Team[];
  subTeams?: SubTeam[];
  onToggleUserStatus?: (email: string) => void;
  onUpdateUserRole?: (email: string, role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder') => void;
  onApproveUser?: (email: string) => void;
  onAddTeam?: (team: Team) => void;
  onToggleTeamStatus?: (teamId: string) => void;
  onUpdateUserTeams?: (email: string, teamIDs: string[], teamNames: string[]) => Promise<void>;
  onDeleteTeam?: (teamId: string) => Promise<void>;
  onRenameTeam?: (teamId: string, newName: string) => Promise<void>;
  onSaveSubTeam?: (subTeam: SubTeam) => Promise<void>;
  onDeleteSubTeam?: (subTeamId: string) => Promise<void>;
  onUpdateSubTeamLeaders?: (teamId: string, subTeamId: string, leaderEmails: string[]) => Promise<void>;
  onAssignUserToSubTeam?: (userEmail: string, subTeamId: string | null, subTeamName: string | null) => Promise<void>;
  onRemoveUserFromSubTeam?: (userEmail: string, subTeamId: string) => Promise<void>;
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
  onRefreshUsers?: () => Promise<void>;
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
  onSyncDatabase,
  isSyncing = false,
  lastSyncTime,
  dbConnectionStatus = 'connected',
  audits = [],
  settings = [],
  emailTemplates = [],
  teams = [],
  subTeams = [],
  onToggleUserStatus,
  onUpdateUserRole,
  onApproveUser,
  onAddTeam,
  onToggleTeamStatus,
  onUpdateUserTeams,
  onDeleteTeam,
  onRenameTeam,
  onSaveSubTeam,
  onDeleteSubTeam,
  onUpdateSubTeamLeaders,
  onAssignUserToSubTeam,
  onRemoveUserFromSubTeam,
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
  onAddTeamSubmission = () => { },
  triggerNotification = () => { },
  onRefreshUsers,
}: DashboardProps) {
  const navigate = useNavigate();
  const { isDarkMode } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>(['All']);
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState<string[]>([]);
  const [filterTeamIDs, setFilterTeamIDs] = useState<string[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
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
  const [submissionSubTeamId, setSubmissionSubTeamId] = useState<string | null>(null);
  const [submissionNote, setSubmissionNote] = useState('');
  const [submissionFiles, setSubmissionFiles] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Row selection for reports - MUST be at top level, not inside renderReports
  const [dateFilteredReports, setDateFilteredReports] = useState<TaskReport[]>([]);

  // Compute user roles once per render - used for both tab visibility and data queries
  const userRoles = useMemo(() => {
    return getUserRoles(currentUser, teams || [], subTeams || [], settings || []);
  }, [currentUser, teams, subTeams, settings]);

  // Compute filtered reports when dependencies change - NOT during render
  useEffect(() => {
    if (!reports || reports.length === 0) {
      setDateFilteredReports([]);
      return;
    }

    // Guard against null currentUser
    if (!currentUser) {
      setDateFilteredReports([]);
      return;
    }

    // First apply role-based visibility filter
    const roleFilteredReports = getVisibleReports(reports, currentUser, tasks || [], users || [], teams || [], subTeams || [], settings || []);

    // Filter for tasks with appropriate status
    const taskReports = roleFilteredReports.filter(r => {
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

    // Permission check: sub-team leaders can only submit for their own sub-team
    if (submissionSubTeamId) {
      const subTeam = subTeams.find(st => st.SubTeamID === submissionSubTeamId);
      const isSubTeamLeader = subTeam?.SubTeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase());
      const team = teams.find(t => t.TeamID === submissionTeamId);
      const isTeamLeader = team?.TeamLeaderEmails?.includes(currentUser.Email);
      if (!isSubTeamLeader && !isTeamLeader && !isAdminLevel(currentUser.Role)) {
        setSubmissionError('You can only submit reports for your own sub-team');
        setTimeout(() => setSubmissionError(null), 3000);
        return;
      }
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
          } catch (error: any) {
            const errorMessage = error?.response?.data?.error || error?.message || `Failed to upload ${file.name}`;
            setSubmissionError(errorMessage);
            setIsSubmitting(false);
            return; // Stop submission if any file upload fails
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
        SubTeamID: submissionSubTeamId || undefined,
        SubmittedBy: currentUser.Email,
        SubmittedAt: new Date().toISOString(),
        Note: submissionNote.trim() || undefined,
        AttachmentLinks: attachmentLinks || undefined,
      };

      onAddTeamSubmission(newSubmission);

      // Send proof email with threading
      try {
        const team = teams.find(t => t.TeamID === submissionTeamId);
        const teamName = team?.TeamName || 'Unknown Team';

        // Get leader emails
        let leaderEmails: string[] = [];
        if (submissionSubTeamId) {
          const subTeam = subTeams?.find(st => st.SubTeamID === submissionSubTeamId);
          leaderEmails = subTeam?.SubTeamLeaderEmails || [];
          if (leaderEmails.length === 0) {
            leaderEmails = team?.TeamLeaderEmails || [];
          }
        } else {
          leaderEmails = team?.TeamLeaderEmails || [];
        }

        if (leaderEmails.length > 0) {
          const subTeamName = submissionSubTeamId
            ? subTeams?.find(st => st.SubTeamID === submissionSubTeamId)?.SubTeamName
            : undefined;

          await sendProofEmail({
            teamId: submissionTeamId,
            subTeamId: submissionSubTeamId,
            teamName,
            subTeamName,
            leaderEmails,
            attachmentLinks: attachmentLinks || '',
            note: submissionNote.trim() || undefined,
            submittedBy: currentUser.Email
          });
        }
      } catch (emailError) {
        // Don't fail the submission if email fails
      }

      // Reset state
      setSubmissionNote('');
      setSubmissionFiles([]);
      setSubmissionSuccess(true);
      setTimeout(() => setSubmissionSuccess(false), 3000);
      setSubmissionModalOpen(false);
      setSubmissionTeamId(null);
      setSubmissionSubTeamId(null);

    } catch (error) {
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
    if (!currentUser) return false;
    if (isAdminLevel(currentUser.Role)) return true;
    const isTeamLeader = teams.some(team => team.TeamLeaderEmails?.includes(currentUser.Email));
    // Also check if user is a sub-team leader for any sub-team
    const isSubTeamLeader = subTeams?.some(st =>
      st.SubTeamLeaderEmails?.some(e => e.toLowerCase() === currentUser.Email.toLowerCase())
    );
    return isTeamLeader || isSubTeamLeader;
  };

  // Sync filters with URL query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statusParam = params.get('status');
    const priorityParam = params.get('priority');
    const assigneesParam = params.get('assignees');
    const teamsParam = params.get('teams');
    const dateFromParam = params.get('dateFrom');
    const dateToParam = params.get('dateTo');

    if (statusParam) setFilterStatus(statusParam.split(','));
    if (priorityParam) setFilterPriority(priorityParam);
    if (assigneesParam) setFilterAssignee(assigneesParam.split(','));
    if (teamsParam) setFilterTeamIDs(teamsParam.split(','));
    if (dateFromParam) setFilterDateFrom(dateFromParam);
    if (dateToParam) setFilterDateTo(dateToParam);
  }, []);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (filterStatus.length > 0 && !filterStatus.includes('All')) params.set('status', filterStatus.join(','));
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

  const visibleTasksForOverview = useMemo(() => {
    // Return empty array if currentUser is null
    if (!currentUser) {
      return [];
    }

    // Use the new role-based approach with union logic
    const userEmail = currentUser.Email?.toLowerCase() || '';

    // Get the Team Tasks scope filter function based on user roles
    const teamTasksFilter = getTeamTasksScope(currentUser, userRoles, users || []);

    return (tasks || []).filter(task => {
      // Admin sees all tasks
      if (userRoles.some(r => r.type === 'Admin')) return true;

      // Apply union-based visibility
      const assignedToMe = splitEmails(task.AssignedToEmail).some(email =>
        email.toLowerCase() === userEmail
      );
      const assignedByMe = task.AssignedByEmail?.toLowerCase() === userEmail;
      const inTeamScope = teamTasksFilter(task);

      return assignedToMe || assignedByMe || inTeamScope;
    });
  }, [tasks, currentUser, userRoles, users]);

  // Calculate metrics — scoped to what this user can see
  const allTasks = visibleTasksForOverview.length;
  const activeTasks = visibleTasksForOverview.filter(t => t.Status !== 'Closed' && t.Status !== 'Reviewed').length;
  const overdueTasks = visibleTasksForOverview.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    const today = new Date().toISOString().split('T')[0];
    return t.DueDate < today;
  }).length;
  const today = new Date().toISOString().split('T')[0];
  const dueToday = visibleTasksForOverview.filter(t => {
    if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
    return t.DueDate === today;
  }).length;
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const completedThisWeek = visibleTasksForOverview.filter(t => {
    if (t.Status !== 'Closed' && t.Status !== 'Reviewed') return false;
    if (!t.CompletionDate) return false;
    const completionDate = new Date(t.CompletionDate);
    return completionDate >= oneWeekAgo;
  }).length;

  // Get tasks needing attention (overdue or high priority), scoped to this user
  const priorityTasks = visibleTasksForOverview
    .filter(t => {
      if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
      const isOverdue = t.DueDate < today;
      const isHighPriority = t.Priority === 'High' || t.Priority === 'Critical';
      return isOverdue || isHighPriority;
    })
    .slice(0, 5);

  // Chart data for Task Insights
  const completionStatusData = useMemo(() => {
    const completed = visibleTasksForOverview.filter(t => t.Status === 'Closed' || t.Status === 'Reviewed').length;
    const inProgress = visibleTasksForOverview.filter(t => t.Status === 'In Progress' || t.Status === 'Submitted').length;
    const overdue = visibleTasksForOverview.filter(t => {
      if (t.Status === 'Closed' || t.Status === 'Reviewed') return false;
      return t.DueDate < today;
    }).length;
    
    return [
      { name: 'Completed', value: completed, color: '#22c55e' },
      { name: 'In progress', value: inProgress, color: '#3b82f6' },
      { name: 'Overdue', value: overdue, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [visibleTasksForOverview, today]);

  const userActivityData = useMemo(() => {
    // Return empty array if currentUser is null
    if (!currentUser) {
      return [];
    }

    // Only show for roles that see more than one person's tasks
    const canSeeMultipleUsers = isAdminLevel(currentUser.Role) ||
      teams?.some(t => isTeamLeader(currentUser.Email, t)) ||
      subTeams?.some(st => isSubTeamLeader(currentUser.Email, st)) ||
      userRoles.some(r => r.type === 'Stakeholder');

    if (!canSeeMultipleUsers) {
      // For sub-stakeholders, show only their own data
      const userEmail = currentUser.Email.toLowerCase();
      const assigned = visibleTasksForOverview.filter(t =>
        splitEmails(t.AssignedToEmail).some(e => e.toLowerCase() === userEmail)
      ).length;
      const completed = visibleTasksForOverview.filter(t =>
        splitEmails(t.AssignedToEmail).some(e => e.toLowerCase() === userEmail) &&
        (t.Status === 'Closed' || t.Status === 'Reviewed')
      ).length;
      return [{
        name: currentUser.Email.split('@')[0],
        assigned,
        completed,
      }].filter(d => d.assigned > 0 || d.completed > 0);
    }

    // For other roles, aggregate by user
    const userMap = new Map<string, { assigned: number; completed: number }>();

    visibleTasksForOverview.forEach(task => {
      const assignees = splitEmails(task.AssignedToEmail);
      assignees.forEach(email => {
        const key = email.toLowerCase();
        if (!userMap.has(key)) {
          userMap.set(key, { assigned: 0, completed: 0 });
        }
        const data = userMap.get(key)!;
        data.assigned++;
        if (task.Status === 'Closed' || task.Status === 'Reviewed') {
          data.completed++;
        }
      });
    });

    const data = Array.from(userMap.entries())
      .map(([email, counts]) => ({
        name: email.split('@')[0],
        assigned: counts.assigned,
        completed: counts.completed,
      }))
      .filter(d => d.assigned > 0 || d.completed > 0)
      .sort((a, b) => (b.assigned + b.completed) - (a.assigned + a.completed));

    return data.slice(0, 10); // Limit to top 10 users
  }, [visibleTasksForOverview, currentUser, teams, subTeams, userRoles]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'High': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Medium': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Low': return 'bg-green-500/10 text-green-400 border-green-500/20';
      default: return 'bg-slate-500/10 text-secondary border-slate-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Overdue': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'In progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Submitted': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Not Started': return 'bg-slate-500/10 text-secondary border-slate-500/20';
      default: return 'bg-slate-500/10 text-secondary border-slate-500/20';
    }
  };

  const getDaysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };


  // Helper function to extract filename from URL
  const getFileNameFromUrl = (url: string): string => {
    try {
      // For Google Drive URLs, try to extract filename from URL parameters
      if (url.includes('drive.google.com')) {
        const urlObj = new URL(url);
        // Check for filename in URL parameters
        const filename = urlObj.searchParams.get('filename') || urlObj.searchParams.get('name');
        if (filename) return filename;
      }

      // Extract from path
      const pathname = new URL(url).pathname;
      const parts = pathname.split('/');
      const lastPart = parts[parts.length - 1];

      // Remove query parameters and decode
      if (lastPart) {
        const cleanName = lastPart.split('?')[0];
        const decoded = decodeURIComponent(cleanName);
        // Remove file extension if needed
        return decoded;
      }

      // Fallback: generate a name from the URL
      return 'Attachment';
    } catch (error) {
      return 'Attachment';
    }
  };

  // Get team members based on user role with hierarchical visibility
  const getTeamMembers = () => {
    if (!currentUser) return [];
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

  const filteredTasks = useMemo(() => {
    // Return empty array if currentUser is null
    if (!currentUser) {
      return [];
    }

    // Use the new role-based approach with union logic
    const userEmail = currentUser.Email?.toLowerCase() || '';

    // Get the Team Tasks scope filter function based on user roles
    const teamTasksFilter = getTeamTasksScope(currentUser, userRoles, users || []);

    const roleFiltered = (tasks || []).filter(task => {
      // Apply view-based filtering using the new role-based approach
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

    let filtered = roleFiltered;

    if (filterStatus.length > 0 && !filterStatus.includes('All')) {
      // Special handling for "Overdue" status (computed status, not stored in database)
      if (filterStatus.includes('Overdue')) {
        const today = new Date().toISOString().split('T')[0];
        filtered = filtered.filter(t => {
          return t.Status !== 'Closed' && t.Status !== 'Reviewed' && t.DueDate < today;
        });
        // If only "Overdue" is selected, we're done
        if (filterStatus.length === 1 && filterStatus[0] === 'Overdue') {
          // Continue with other filters
        } else {
          // If "Overdue" is combined with other statuses, filter out the non-overdue ones
          const otherStatuses = filterStatus.filter(s => s !== 'Overdue');
          filtered = filtered.filter(t => otherStatuses.includes(t.Status));
        }
      } else {
        // Normal status filtering
        filtered = filtered.filter(t => filterStatus.includes(t.Status));
      }
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
        const dateToCheck = (t.Status === 'Closed' || t.Status === 'Reviewed') ? t.CompletionDate : t.DueDate;
        if (!dateToCheck) return false;
        // Normalize both dates to YYYY-MM-DD format
        const normalizedDateToCheck = dateToCheck.includes('T') ? dateToCheck.split('T')[0] : dateToCheck;
        const normalizedFilterDate = filterDateFrom.includes('T') ? filterDateFrom.split('T')[0] : filterDateFrom;

        // Special handling for overdue tasks with date filter
        // When filtering by date for overdue tasks, check if DueDate falls within the range
        const isOverdue = t.Status !== 'Closed' && t.Status !== 'Reviewed' && t.DueDate < new Date().toISOString().split('T')[0];
        if (isOverdue && filterStatus.includes('Overdue')) {
          const normalizedDueDate = t.DueDate.includes('T') ? t.DueDate.split('T')[0] : t.DueDate;
          return normalizedDueDate >= normalizedFilterDate;
        }

        return normalizedDateToCheck >= normalizedFilterDate;
      });
    }
    if (filterDateTo) {
      filtered = filtered.filter(t => {
        // For completed tasks, use CompletionDate; otherwise use DueDate
        const dateToCheck = (t.Status === 'Closed' || t.Status === 'Reviewed') ? t.CompletionDate : t.DueDate;
        if (!dateToCheck) return false;
        // Normalize both dates to YYYY-MM-DD format
        const normalizedDateToCheck = dateToCheck.includes('T') ? dateToCheck.split('T')[0] : dateToCheck;
        const normalizedFilterDate = filterDateTo.includes('T') ? filterDateTo.split('T')[0] : filterDateTo;

        // Special handling for overdue tasks with date filter
        // When filtering by date for overdue tasks, check if DueDate falls within the range
        const isOverdue = t.Status !== 'Closed' && t.Status !== 'Reviewed' && t.DueDate < new Date().toISOString().split('T')[0];
        if (isOverdue && filterStatus.includes('Overdue')) {
          const normalizedDueDate = t.DueDate.includes('T') ? t.DueDate.split('T')[0] : t.DueDate;
          return normalizedDueDate <= normalizedFilterDate;
        }

        return normalizedDateToCheck <= normalizedFilterDate;
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
  }, [tasks, currentUser, users, subTeams, taskSubView, filterStatus, filterPriority, filterAssignee, filterTeamIDs, filterDateFrom, filterDateTo, searchQuery]);

  // Broadest set of tasks the current user is allowed to see, independent of
  // the Tasks-page tab (taskSubView). Used for Overview summary cards, alerts,
  // and Needs Attention — these should reflect the user's own scope, not the
  // whole org, unless they're an admin.


  // Recent Activity, derived from audit logs (AuditLog: LogID, EntityType,
  // EntityID, Action, OldValueJSON, NewValueJSON, ActionByEmail, ActionDateTime).
  // Known EntityType values: 'Task', 'User', 'Team', 'Template', 'Report',
  // 'Settings', 'FollowUp'. For 'Task' entries, EntityID === TaskID, so we
  // can scope those to tasks the user can see. Everything else is scoped to
  // activity the user personally performed.
  const recentActivity = useMemo(() => {
    // Return empty array if currentUser is null
    if (!currentUser) {
      return [];
    }

    return (audits || [])
      .filter(a => {
        if (isAdminLevel(currentUser.Role)) return true;

        const performedByMe = a.ActionByEmail?.toLowerCase() === currentUser.Email.toLowerCase();
        if (performedByMe) return true;

        if (a.EntityType === 'Task' && a.EntityID) {
          const visibleTaskIds = new Set(visibleTasksForOverview.map(t => t.TaskID));
          return visibleTaskIds.has(a.EntityID);
        }

        return false;
      })
      .sort((a, b) => new Date(b.ActionDateTime).getTime() - new Date(a.ActionDateTime).getTime())
      .slice(0, 5)
      .map(a => ({
        date: a.ActionDateTime,
        action: a.Action,
        type: a.EntityType?.toLowerCase() || 'general',
        entityId: a.EntityID,
      }));
  }, [audits, currentUser, visibleTasksForOverview]);

  const renderOverview = () => (
    <div className="space-y-6 sm:space-y-8">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => navigate(ROUTES.TASKS)}
          className="border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all bg-surface border-token hover:border-purple-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Activity className="text-purple-400" size={16} />
            </div>
            <span className="text-[9px] sm:text-[10px] text-muted">All statuses</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-primary">{allTasks}</p>
          <p className="text-[10px] sm:text-xs mt-1 text-muted">All Tasks</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => navigate(ROUTES.TASKS)}
          className="border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all bg-surface border-token hover:border-blue-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <ClipboardList className="text-blue-400" size={16} />
            </div>
            <span className="text-[9px] sm:text-[10px] text-muted">Open & in progress</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-primary">{activeTasks}</p>
          <p className="text-[10px] sm:text-xs mt-1 text-muted">Active Tasks</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate(ROUTES.TASKS)}
          className="border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all bg-surface border-token hover:border-red-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-red-500/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="text-red-400" size={16} />
            </div>
            <span className="text-[9px] sm:text-[10px] text-muted">Past due date</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-primary">{overdueTasks}</p>
          <p className="text-[10px] sm:text-xs mt-1 text-muted">Overdue</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          onClick={() => navigate(ROUTES.TASKS)}
          className="border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all bg-surface border-token hover:border-yellow-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <Clock className="text-yellow-400" size={16} />
            </div>
            <span className="text-[9px] sm:text-[10px] text-muted">Deadline today</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-primary">{dueToday}</p>
          <p className="text-[10px] sm:text-xs mt-1 text-muted">Due Today</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          onClick={() => navigate(ROUTES.TASKS)}
          className="border rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-md transition-all bg-surface border-token hover:border-green-500/50"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-green-400" size={16} />
            </div>
            <span className="text-[9px] sm:text-[10px] text-muted">Last 7 days</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-primary">{completedThisWeek}</p>
          <p className="text-[10px] sm:text-xs mt-1 text-muted">Completed This Week</p>
        </motion.div>
      </div>

      {/* Priority Tasks Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="border rounded-xl bg-surface border-token"
      >
        <div className="p-4 sm:p-6 border-b flex items-center justify-between border-token">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Bell className="text-orange-400" size={18} />
            <h3 className="font-medium text-sm sm:text-lg text-primary">Priority tasks</h3>
            <span className="bg-orange-500/10 text-orange-400 text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full border border-orange-500/20">
              {priorityTasks.length} items
            </span>
          </div>
          <button onClick={() => navigate(ROUTES.TASKS)} className="text-blue-400 text-[10px] sm:text-sm font-medium hover:text-blue-300 flex items-center space-x-1">
            <span className="hidden sm:inline">View all</span>
            <span className="sm:hidden">View all</span>
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {priorityTasks.length > 0 ? (
            priorityTasks.map((task, index) => {
              const daysUntil = getDaysUntilDue(task.DueDate);
              const dueText = daysUntil < 0 ? 'Overdue' : daysUntil === 0 ? 'Today' : `${daysUntil} days`;
              const isOverdue = task.DueDate < today;
              const accentColor = isOverdue ? 'border-l-red-500' : 'border-l-amber-500';
              const bgColor = isOverdue ? 'bg-red-500/5' : 'bg-amber-500/5';

              return (
                <motion.div
                  key={task.TaskID}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1 }}
                  onClick={(e) => { e.preventDefault(); onTaskClick(task); }}
                  className={`${bgColor} ${accentColor} border-l-3 p-4 sm:p-6 transition-colors cursor-pointer hover-surface rounded-r-lg`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2">
                        <span className={`text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border ${getPriorityColor(task.Priority)}`}>
                          {task.Priority}
                        </span>
                        <span className={`text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border ${getStatusColor(task.Status)}`}>
                          {task.Status}
                        </span>
                        {isOverdue && (
                          <span className="bg-red-500/10 text-red-400 text-[10px] sm:text-xs font-medium px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-red-500/20">
                            Overdue
                          </span>
                        )}
                      </div>
                      <h4 className="font-medium text-sm sm:text-base mb-2 truncate text-primary">
                        {task.Title}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted">
                        <span>Due: {task.DueDate} {daysUntil > 0 && `(${dueText})`}</span>
                        <span>·</span>
                        <span>Assigned to: {task.AssignedToEmail.split('@')[0]}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px] sm:text-xs font-mono text-muted">{task.TaskID}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="text-center py-6 sm:py-8 text-muted">
              <CheckCircle className="mx-auto mb-2 text-green-400" size={24} />
              <p className="text-xs sm:text-sm">No priority tasks at this time</p>
              <p className="text-[10px] sm:text-xs mt-1">All tasks are on track</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Task Insights Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="border rounded-xl bg-surface border-token"
      >
        <div className="p-4 sm:p-6 border-b border-token">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Activity className="text-blue-400" size={18} />
            <h3 className="font-medium text-sm sm:text-lg text-primary">Task insights</h3>
          </div>
        </div>
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Completion Status Donut Chart */}
            <div>
              <div className="mb-4">
                <h4 className="font-medium text-sm text-primary mb-2">Completion status</h4>
                <div className="flex flex-wrap gap-3">
                  {completionStatusData.map((item) => {
                    const total = completionStatusData.reduce((sum, d) => sum + d.value, 0);
                    const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    return (
                      <div key={item.name} className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }}></div>
                        <span className="text-xs text-muted">{item.name} {percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="h-48">
                {completionStatusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={completionStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {completionStatusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--color-surface)', 
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: 'var(--color-primary)'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted">
                    <Inbox className="mb-2" size={32} />
                    <p className="text-xs">No task data yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Per-User Activity Bar Chart */}
            <div>
              <div className="mb-4">
                <h4 className="font-medium text-sm text-primary mb-2">Assigned vs completed by user</h4>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
                    <span className="text-xs text-muted">Assigned</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-green-500"></div>
                    <span className="text-xs text-muted">Completed</span>
                  </div>
                </div>
              </div>
              <div className="h-48">
                {userActivityData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userActivityData} layout="vertical" margin={{ left: 70, right: 10, top: 10, bottom: 10 }}>
                      <XAxis 
                        type="number" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                      />
                      <YAxis 
                        type="category" 
                        dataKey="name" 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'var(--color-muted)' }}
                        width={65}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'var(--color-surface)', 
                          border: '1px solid var(--color-border)',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: 'var(--color-primary)'
                        }}
                      />
                      <Bar dataKey="assigned" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={24} />
                      <Bar dataKey="completed" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted">
                    <Inbox className="mb-2" size={32} />
                    <p className="text-xs">
                      {currentUser && (isAdminLevel(currentUser.Role) || teams?.some(t => isTeamLeader(currentUser.Email, t)) || subTeams?.some(st => isSubTeamLeader(currentUser.Email, st)) || userRoles.some(r => r.type === 'Stakeholder'))
                        ? 'No task data yet'
                        : 'Your task activity will show up here'
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6">
      {/* Header with Create Task button and Content Type Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-primary">Tasks & Schedules</h2>
          <p className="text-sm mt-1 text-muted">
            {taskContentType === 'tasks'
              ? (currentUser && isAdminLevel(currentUser.Role) ? 'Manage all tasks' : 'Manage your assigned tasks')
              : 'Manage recurring task schedules'
            }
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Content Type Toggle */}
          <div className="flex rounded-lg p-1 bg-surface border-token">
            <button
              onClick={() => setTaskContentType('tasks')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${taskContentType === 'tasks'
                  ? 'bg-blue-500 text-white'
                  : 'text-muted hover:text-primary'
                }`}
            >
              Tasks
            </button>
            <button
              onClick={() => setTaskContentType('schedules')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${taskContentType === 'schedules'
                  ? 'bg-blue-500 text-white'
                  : 'text-muted hover:text-primary'
                }`}
            >
              Schedules
            </button>
          </div>
          <button
            onClick={() => onNewTask()}
            className="flex items-center space-x-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            <span>{taskContentType === 'schedules' ? 'Create Schedule' : 'Create Task'}</span>
          </button>
        </div>
      </div>

      {/* Task Sub-tabs - only show for tasks */}
      {taskContentType === 'tasks' && (
        <div className="border rounded-xl p-4 bg-surface border-token">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setTaskSubView('my-tasks')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${taskSubView === 'my-tasks'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                    ? 'bg-[#1E293B] text-secondary hover:text-white'
                    : 'bg-slate-100 text-secondary hover:text-slate-900'
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
                      : 'bg-slate-100 text-secondary hover:text-slate-900'
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
                      : 'bg-slate-100 text-secondary hover:text-slate-900'
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
            searchQuery={searchQuery}
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
            onSearchQueryChange={setSearchQuery}
          />
          <TaskList
            tasks={filteredTasks}
            onTaskClick={onTaskClick}
            isDarkMode={isDarkMode}
            getPriorityColor={getPriorityColor}
            getStatusColor={getStatusColor}
            currentUser={currentUser}
            taskSubView={taskSubView}
            onDeleteTask={onDeleteTask}
          />
        </>
      )}

      {/* Show schedules content */}
      {taskContentType === 'schedules' && (
        <div className="border rounded-xl p-6 bg-surface border-token">
          <div className="divide-y divide-[var(--color-border)]">
            {templates.filter(t => t.Active).length > 0 ? (
              templates.filter(t => t.Active).map((template) => (
                <div key={template.TemplateID} className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="font-medium text-primary">{template.Title}</h4>
                        <span className={`text-xs font-bold px-2 py-1 rounded border ${getPriorityColor(template.Priority)}`}>
                          {template.Priority}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm">
                        <span className="text-sm text-muted">{template.RecurrenceType}</span>
                        <span className="text-sm text-muted">&bull; Next: {template.NextGenerationDate}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => onNewTask()}
                        className={`px-3 py-1 text-xs font-bold tracking-wider rounded-lg transition-colors ${isDarkMode
                            ? 'text-slate-700 hover:text-primarybg-slate-200 hover:bg-slate-300'
                            : 'text-secondary hover:text-primarybg-slate-100 hover:bg-slate-200'
                          }`}
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className={`p-12 text-center text-muted`}>No active schedules found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );


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
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderReports = () => {
    if (!reports || reports.length === 0) {
      return (
        <div className="space-y-6">
          <div className="border rounded-xl p-6 bg-surface border-token">
            <div className={`p-12 text-center text-muted`}>
              No reports found
            </div>
          </div>
        </div>
      );
    }

    const taskReports = reports.filter(r => {
      const task = tasks?.find(t => t.TaskID === r.TaskID);
      // Keep reports for a task in any status — including Closed — so its
      // history and closing remark stay visible instead of disappearing
      // once the task is finished.
      return !!task;
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

    // Anchor each task's closing remark to its most recent report by ReportDate,
    // computed once so the remainder doesn't jump between rows if the list is
    // re-sorted or re-filtered — no dependency on iteration order.
    const latestReportIdByTask = new Map<string, string>();
    newDateFilteredReports.forEach(r => {
      const currentId = latestReportIdByTask.get(r.TaskID);
      const current = currentId ? newDateFilteredReports.find(x => x.ReportID === currentId) : null;
      if (!current || r.ReportDate > current.ReportDate) {
        latestReportIdByTask.set(r.TaskID, r.ReportID);
      }
    });

    return (
      <div className="space-y-6">
        <div className="border rounded-xl p-6 bg-surface border-token">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-semibold text-lg text-primary">Progress Reports</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowFlatView(!showFlatView)}
                className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${!showFlatView
                    ? 'bg-blue-500 text-white'
                    : isDarkMode
                      ? 'text-secondary hover:text-white'
                      : 'text-secondary hover:text-slate-900'
                  }`}
              >
                {showFlatView ? 'Grouped View' : 'Flat View'}
              </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
                >
                  <Download size={16} />
                  Download Report
                </button>
            </div>
          </div>

          {/* Report Filters */}
          <div className="border border-token bg-surface rounded-xl p-4 flex flex-wrap gap-4 items-center mb-6">
            <div className="flex items-center space-x-2 text-sm text-muted">
              <Filter size={16} />
              <span>Filters:</span>
            </div>

            {/* Search Input for Reports */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-muted sm:size-4" />
              <input
                type="text"
                placeholder="Search reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 sm:pl-9 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 bg-surface border-token text-primary placeholder-muted"
              />
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
                <Calendar size={16} className={isDarkMode ? 'text-secondary' : 'text-slate-500'} />
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className={`bg-transparent focus:outline-none text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                  placeholder="From"
                />
              </div>
              <span className={isDarkMode ? 'text-secondary' : 'text-slate-500'}>to</span>
              <div className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                <Calendar size={16} className={isDarkMode ? 'text-secondary' : 'text-slate-500'} />
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
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${isDarkMode
                    ? 'text-secondary hover:text-white hover:bg-[#334155]/50'
                    : 'text-secondary hover:text-primary hover:bg-slate-100'
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

                  const showCloseRemark = !!task.CloseRemark && latestReportIdByTask.get(task.TaskID) === report.ReportID;

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
                              <div className={`text-xs font-mono mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>
                                Report ID: {report.ReportID || 'N/A'}
                              </div>
                              <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                Submitted by: {report.SubmittedByEmail || 'Unknown'}
                              </div>
                              <div className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                Date: {report.ReportDate || 'N/A'}
                              </div>
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded border ${report.StatusUpdate === 'Submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                report.StatusUpdate === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                              }`}>
                              {report.StatusUpdate || 'Unknown'}
                            </span>
                          </div>
                          <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                            <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Work summary</div>
                            <p className="text-sm">{report.WorkSummary || 'No work summary provided'}</p>
                          </div>
                          {report.Blockers && (
                            <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                              <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Blockers</div>
                              <p className="text-sm">{report.Blockers}</p>
                            </div>
                          )}
                          {report.NextAction && (
                            <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                              <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Next action</div>
                              <p className="text-sm">{report.NextAction}</p>
                            </div>
                          )}
                          {report.AttachmentLink && (
                            <div className="space-y-1">
                              {report.AttachmentLink.split(',').map((url, idx) => {
                                const trimmedUrl = url.trim();
                                return (
                                  <div key={idx} className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                    <a href={trimmedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                      <Link size={14} />
                                      <span>{getFileNameFromUrl(trimmedUrl)}</span>
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {showCloseRemark && (
                            <div className={`mt-3 rounded-lg border p-3 ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                              <div className={`flex items-center gap-1.5 text-[11px] font-bold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>
                                <CheckCircle size={13} />
                                <span>Closing remark — {task.Title}</span>
                                {task.CompletionDate && (
                                  <span className={`font-normal ${isDarkMode ? 'text-emerald-400/70' : 'text-emerald-600'}`}>· {task.CompletionDate}</span>
                                )}
                              </div>
                              <p className={`mt-1 text-xs leading-relaxed whitespace-pre-wrap ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                                {task.CloseRemark}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className={`p-12 text-center text-muted`}>No reports found</div>
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
                          <div className={`flex items-center space-x-4 text-sm ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>
                            <span>Task: {task.TaskID || 'N/A'}</span>
                            <span>Due: {task.DueDate || 'N/A'}</span>
                            <span>{taskReports.length} report{taskReports.length !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded border ${task.Status === 'Submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                            {task.Status || 'Unknown'}
                          </span>
                          <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {/* Closing remark */}
                      {task?.CloseRemark && (
                        <div className={`mt-3 rounded-lg border p-3 ${isDarkMode ? 'bg-emerald-900/20 border-emerald-800' : 'bg-emerald-50 border-emerald-200'}`}>
                          <div className={`flex items-center gap-1.5 text-[11px] font-bold ${isDarkMode ? 'text-emerald-300' : 'text-emerald-800'}`}>
                            <CheckCircle size={13} />
                            <span>Closing remark</span>
                            {task.CompletionDate && (
                              <span className={`font-normal ${isDarkMode ? 'text-emerald-400/70' : 'text-emerald-600'}`}>· {task.CompletionDate}</span>
                            )}
                          </div>
                          <p className={`mt-1 text-xs leading-relaxed whitespace-pre-wrap ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                            {task.CloseRemark}
                          </p>
                        </div>
                      )}

                      {/* Reports - shown when expanded */}
                      {isExpanded && (
                        <div className="p-4 pt-0 space-y-3">
                          {taskReports.map((report) => (
                            <div
                              key={report.ReportID}
                              className="border rounded-lg p-4 bg-surface border-token"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <div className="text-xs font-mono mb-1 text-muted">
                                    Report ID: {report.ReportID || 'N/A'}
                                  </div>
                                  <div className="text-sm text-secondary">
                                    Submitted by: {report.SubmittedByEmail || 'Unknown'}
                                  </div>
                                  <div className="text-sm text-secondary">
                                    Date: {report.ReportDate || 'N/A'}
                                  </div>
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded border ${report.StatusUpdate === 'Submitted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                    report.StatusUpdate === 'In Progress' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                      'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                                  }`}>
                                  {report.StatusUpdate || 'Unknown'}
                                </span>
                              </div>
                              <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Work summary</div>
                                <p className="text-sm">{report.WorkSummary || 'No work summary provided'}</p>
                              </div>
                              {report.Blockers && (
                                <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                  <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Blockers</div>
                                  <p className="text-sm">{report.Blockers}</p>
                                </div>
                              )}
                              {report.NextAction && (
                                <div className={`mb-3 ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                                  <div className={`text-xs font-bold mb-1 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`}>Next action</div>
                                  <p className="text-sm">{report.NextAction}</p>
                                </div>
                              )}
                              {report.AttachmentLink && (
                                <div className="space-y-1">
                                  {report.AttachmentLink.split(',').map((url, idx) => {
                                    const trimmedUrl = url.trim();
                                    return (
                                      <div key={idx} className={`text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                                        <a href={trimmedUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                          <Link size={14} />
                                          <span>{getFileNameFromUrl(trimmedUrl)}</span>
                                        </a>
                                      </div>
                                    );
                                  })}
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
                <div className={`p-12 text-center text-muted`}>No reports found</div>
              )}
            </div>
          )}

          {/* Bulk Action Bar for Reports */}
          <BulkActionBar
            selectedCount={selectedReportCount}
            actions={[]}
            onClear={clearReportSelection}
          />
        </div>
        <ReportExportModal
          isOpen={showExportModal}
          onClose={() => setShowExportModal(false)}
          tasks={tasks || []}
          reports={getVisibleReports(reports || [], currentUser)}
          users={users}
          isDarkMode={isDarkMode}
        />
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
      subTeams={subTeams}
      currentUserEmail={currentUser.Email}
      onAddUser={onAddUser || (() => { })}
      onToggleUserStatus={onToggleUserStatus || (() => { })}
      onAddTemplate={onAddTemplate || (() => { })}
      onToggleTemplateStatus={onToggleTemplateStatus || (() => { })}
      onUpdateSetting={onUpdateSetting || (() => { })}
      onUpdateUserRole={onUpdateUserRole || (() => { })}
      onApproveUser={onApproveUser || (() => { })}
      onAddTeam={onAddTeam || (() => { })}
      onToggleTeamStatus={onToggleTeamStatus || (() => { })}
      onUpdateUserTeams={onUpdateUserTeams || (() => { })}
      onDeleteTeam={onDeleteTeam || (() => { })}
      onRenameTeam={onRenameTeam || (() => { })}
      onSaveSubTeam={onSaveSubTeam}
      onDeleteSubTeam={onDeleteSubTeam}
      onUpdateSubTeamLeaders={onUpdateSubTeamLeaders}
      onAssignUserToSubTeam={onAssignUserToSubTeam}
      onRemoveUserFromSubTeam={onRemoveUserFromSubTeam}
      onSyncDatabase={onSyncDatabase}
      onRefreshUsers={onRefreshUsers}
      onSendInviteEmail={(email, fullName, role) => {
        const inviteMessage = `Welcome to PMS! Your account has been created as ${role}. You can now log in with your credentials.`;
        triggerNotification('Task Assignment', inviteMessage, email);
      }}
      isDarkMode={isDarkMode}
    />
  );

  const renderSettings = () => (
    <DashboardSettings
      onEditProfile={onEditProfile}
      onChangePassword={onChangePassword}
      onConfigureNotifications={onConfigureNotifications}
      onLogout={onLogout}
      gmailConnected={gmailConnected}
      gmailLoading={gmailLoading}
      connectionMessage={connectionMessage}
      onConnectGmail={handleConnectGmail}
      onDisconnectGmail={handleDisconnectGmail}
    />
  );

  return (
    <>
      {/* Mobile Search Modal */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 md:hidden flex items-start justify-center pt-20 px-4">
          <div className={`w-full max-w-lg rounded-xl shadow-2xl p-4 ${isDarkMode ? 'bg-[#0F141F] border border-token' : 'bg-surface border border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-secondary' : 'text-slate-500'}`} size={18} />
                <input
                  type="text"
                  placeholder="Search tasks, people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className={`w-full border rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm ${isDarkMode
                      ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-400'
                      : 'bg-slate-50 border-slate-200 text-primary placeholder-slate-500'
                    }`}
                />
              </div>
              <button
                onClick={() => setIsMobileSearchOpen(false)}
                className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-secondary hover:text-white' : 'hover:bg-slate-100 text-secondary hover:text-slate-900'}`}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Backdrop Overlay */}
      {isAnyModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 pointer-events-none" />
      )}

      {/* Main Content */}
      <div className="space-y-6">
        {/* Header */}
        <header className={`px-4 md:px-8 py-4 md:py-5 sticky top-0 z-30 border-b ${isDarkMode ? 'bg-[#0F141F] border-token' : 'bg-surface border-token'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 md:space-x-4">
              <div className="block sm:hidden">
                <h2 className={`text-lg font-bold capitalize ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Overview</h2>
              </div>
              <div className="hidden sm:block">
                <h2 className={`text-xl md:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  Overview
                </h2>
                <p className={`text-xs md:text-sm mt-1 ${isDarkMode ? 'text-secondary' : 'text-secondary'}`}>Welcome back, {currentUser?.FullName || currentUser?.Email || 'User'}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              {/* Sync Status Indicator */}
              <button
                onClick={onSyncDatabase}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${syncStatus === 'synced'
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
                className={`p-2 md:p-2.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-slate-800/50 text-secondary hover:text-white' : 'hover-surface text-secondary hover:text-slate-900'}`}
                title="Profile"
              >
                <User size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="p-4 md:p-8 min-h-screen">
          {renderOverview()}
        </div>
      </div>
    </>
  );
}