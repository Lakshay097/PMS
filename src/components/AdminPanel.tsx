import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User as UserType, TaskTemplate, AppSetting, Team, SubTeam, EmailTemplate } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { parseAndValidateUsersCsv, downloadCsvTemplate, CsvRowError, CsvUserRow } from '../utils/csv';
import { generateUniqueId } from '../utils/id';
import { useDebounce } from '../hooks';
import { ROLE } from '../constants/status';
import { FormField, Input, Select, SearchInput } from './shared/FormField';
import {
  Users,
  Repeat,
  History,
  Settings,
  Plus,
  Shield,
  Search,
  CheckSquare,
  Edit,
  Edit2,
  Code,
  Mail,
  CheckCircle,
  Info,
  FileText,
  AlertCircle,
  RefreshCw,
  X,
  UserPlus,
  ChevronDown,
  FileSpreadsheet,
  Upload,
  Layers,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Type,
  Palette,
  Save,
  Loader2
} from 'lucide-react';
import { getUnsubmittedTeams, getEmailDeliveryFailures, EmailDeliveryFailure, getTeamReportConfigs, updateTeamReportConfig, TeamReportConfig, getJobRuns, JobRun, getGmailReauthRequired, GmailReauthRequired } from '../api/teamReminder';
import EmailTemplatesTab from './admin/EmailTemplatesTab';
import { UnsubmittedTeam } from '../api/teamReminder';

interface AdminPanelProps {
  users: UserType[];
  templates: TaskTemplate[];
  settings: AppSetting[];
  emailTemplates?: EmailTemplate[];
  teams: Team[];
  subTeams?: SubTeam[];
  currentUserEmail?: string;
  onAddUser: (user: UserType) => void;
  onToggleUserStatus: (email: string) => void;
  onAddTemplate: (template: TaskTemplate) => void;
  onToggleTemplateStatus: (templateId: string) => void;
  onUpdateSetting: (key: string, value: string) => void;
  onUpdateUserRole: (email: string, role: typeof ROLE[keyof typeof ROLE]) => void;
  onApproveUser: (email: string) => void;
  onAddTeam: (team: Team) => void;
  onToggleTeamStatus: (teamId: string) => void;
  onUpdateUserTeams: (email: string, teamIDs: string[], teamNames: string[]) => void;
  onDeleteTeam: (teamId: string) => void;
  onRenameTeam?: (teamId: string, newName: string) => void;
  onSaveSubTeam?: (subTeam: SubTeam) => Promise<void>;
  onDeleteSubTeam?: (subTeamId: string) => Promise<void>;
  onUpdateSubTeamLeaders?: (teamId: string, subTeamId: string, leaderEmails: string[]) => Promise<void>;
  onAssignUserToSubTeam?: (userEmail: string, subTeamId: string | null, subTeamName: string | null) => Promise<void>;
  onRemoveUserFromSubTeam?: (userEmail: string, subTeamId: string) => Promise<void>;
  onSendInviteEmail?: (email: string, fullName: string, role: string) => void;
  onSyncDatabase?: () => void;
  onRefreshUsers?: () => Promise<void>;
  onRefreshEmailTemplates?: () => Promise<void>;
}

export default function AdminPanel({
  users,
  templates,
  settings,
  emailTemplates = [],
  teams,
  currentUserEmail,
  onAddUser,
  onToggleUserStatus,
  onAddTemplate,
  onToggleTemplateStatus,
  onUpdateSetting,
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
  onSendInviteEmail,
  onSyncDatabase,
  onRefreshUsers,
  onRefreshEmailTemplates,
  subTeams = [],
}: AdminPanelProps) {
  const { isDarkMode } = useTheme();
  // Master administrative tabs
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'teams' | 'templates' | 'email_templates' | 'report_requirements' | 'report_config' | 'missing_reports'>('users');

  // Auto-sync when the users tab is activated so pending registrations
  // that arrived after initial page load are visible immediately.
  useEffect(() => {
    if (activeAdminSubTab === 'users' && onSyncDatabase) {
      onSyncDatabase();
    }
  }, [activeAdminSubTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load unsubmitted teams when missing_reports tab is activated
  useEffect(() => {
    if (activeAdminSubTab === 'missing_reports') {
      loadUnsubmittedTeams();
    }
  }, [activeAdminSubTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadUnsubmittedTeams = async () => {
    setIsLoadingUnsubmitted(true);
    setIsLoadingFailures(true);
    setIsLoadingJobRuns(true);
    setIsLoadingReauth(true);
    try {
      const [unsubmittedResponse, failuresResponse, jobRunsResponse, reauthResponse] = await Promise.all([
        getUnsubmittedTeams(),
        getEmailDeliveryFailures(),
        getJobRuns(5, 'report_reminder'), // Get last 5 report reminder job runs
        getGmailReauthRequired() // Get Gmail accounts needing re-auth
      ]);
      setUnsubmittedTeams(unsubmittedResponse.unsubmittedTeams);
      setEmailDeliveryFailures(failuresResponse.failures);
      setJobRuns(jobRunsResponse.jobRuns);
      setGmailReauthRequired(reauthResponse.reauthRequired);
    } catch (error) {
    } finally {
      setIsLoadingUnsubmitted(false);
      setIsLoadingFailures(false);
      setIsLoadingJobRuns(false);
      setIsLoadingReauth(false);
    }
  };

  // Create User state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<typeof ROLE[keyof typeof ROLE]>(ROLE.STAKEHOLDER);
  const [managerEmail, setManagerEmail] = useState('');
  const [teamSelections, setTeamSelections] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [userSuccessMessage, setUserSuccessMessage] = useState<string | null>(null);
  const [userErrorMessage, setUserErrorMessage] = useState<string | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);

  // Bulk CSV Upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CsvUserRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<CsvRowError[]>([]);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const [csvUploadResult, setCsvUploadResult] = useState<{ success: number; failed: number } | null>(null);
  const [showRegistrationGuide, setShowRegistrationGuide] = useState(true);

  // Create Team state
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamSuccessMessage, setTeamSuccessMessage] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [selectedUsersToAdd, setSelectedUsersToAdd] = useState<Set<string>>(new Set());
  const [selectedTeamLeaders, setSelectedTeamLeaders] = useState<Set<string>>(new Set());
  const [selectedTeamStakeholders, setSelectedTeamStakeholders] = useState<Set<string>>(new Set());
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [currentTeamLeaders, setCurrentTeamLeaders] = useState<string[]>([]);
  const [currentTeamStakeholders, setCurrentTeamStakeholders] = useState<string[]>([]);

  // Team rename state
  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState('');

  // Sub-team management state — tracks which team's sub-teams are being managed
  const [newSubTeamName, setNewSubTeamName] = useState('');
  const [newSubTeamDesc, setNewSubTeamDesc] = useState('');
  const [subTeamError, setSubTeamError] = useState<string | null>(null);
  const [expandedSubTeamId, setExpandedSubTeamId] = useState<string | null>(null);

  // Which user row's team-assignment dropdown is open (table multiselect)
  const [openTeamDropdownFor, setOpenTeamDropdownFor] = useState<string | null>(null);

  // Which tab is active inside the Manage Team modal
  const [manageModalTab, setManageModalTab] = useState<'members' | 'leaders' | 'stakeholders' | 'subteams'>('members');

  // Missing Reports state
  const [unsubmittedTeams, setUnsubmittedTeams] = useState<UnsubmittedTeam[]>([]);
  const [isLoadingUnsubmitted, setIsLoadingUnsubmitted] = useState(false);
  const [emailDeliveryFailures, setEmailDeliveryFailures] = useState<EmailDeliveryFailure[]>([]);
  const [isLoadingFailures, setIsLoadingFailures] = useState(false);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [isLoadingJobRuns, setIsLoadingJobRuns] = useState(false);
  const [gmailReauthRequired, setGmailReauthRequired] = useState<GmailReauthRequired[]>([]);
  const [isLoadingReauth, setIsLoadingReauth] = useState(false);

  // Keep modal-local leader/stakeholder state in sync with the teams prop.
  useEffect(() => {
    if (!expandedTeamId) return;
    const team = teams.find(t => t.TeamID === expandedTeamId);
    if (!team) return;
    setCurrentTeamLeaders(team.TeamLeaderEmails || []);
    setCurrentTeamStakeholders(team.StakeholderEmails || []);
  }, [teams, expandedTeamId]);

  const handleAddMember = (userEmail: string, teamId: string, teamName: string) => {
    const user = users.find(u => u.Email === userEmail);
    if (user) {
      const newTeamIDs = [...(user.TeamIDs || [])];
      const newTeamNames = [...(user.TeamNames || [])];
      if (!newTeamIDs.includes(teamId)) {
        newTeamIDs.push(teamId);
        newTeamNames.push(teamName);
        onUpdateUserTeams(userEmail, newTeamIDs, newTeamNames);
      }
    }
  };

  const handleRemoveMember = (userEmail: string, teamId: string, teamName: string) => {
    const user = users.find(u => u.Email === userEmail);
    if (user) {
      const newTeamIDs = (user.TeamIDs || []).filter(id => id !== teamId);
      const newTeamNames = (user.TeamNames || []).filter(name => name !== teamName);
      onUpdateUserTeams(userEmail, newTeamIDs, newTeamNames);
    }
  };

  const handleAssignTeamLeader = async (userEmail: string, teamId: string) => {
    try {
      const currentLeaders = currentTeamLeaders || [];
      if (!currentLeaders.includes(userEmail)) {
        const updatedLeaders = [...currentLeaders, userEmail];
        await onUpdateSetting(`team_${teamId}_leaders`, updatedLeaders.join(','));
        setCurrentTeamLeaders(updatedLeaders);
      }
    } catch (error) {
      alert('Failed to assign team leader. Please try again.');
    }
  };

  const handleAssignMultipleTeamLeaders = async (teamId: string) => {
    try {
      const currentLeaders = currentTeamLeaders || [];
      const newLeaders = [...new Set([...currentLeaders, ...Array.from(selectedTeamLeaders)])];
      await onUpdateSetting(`team_${teamId}_leaders`, newLeaders.join(','));
      setCurrentTeamLeaders(newLeaders);
      setSelectedTeamLeaders(new Set());
    } catch (error) {
      alert('Failed to assign team leaders. Please try again.');
    }
  };

  const handleRemoveTeamLeader = async (userEmail: string, teamId: string) => {
    try {
      const currentLeaders = currentTeamLeaders || [];
      const updatedLeaders = currentLeaders.filter(email => email !== userEmail);
      await onUpdateSetting(`team_${teamId}_leaders`, updatedLeaders.join(','));
      setCurrentTeamLeaders(updatedLeaders);
    } catch (error) {
      alert('Failed to remove team leader. Please try again.');
    }
  };

  const handleAssignTeamStakeholder = async (userEmail: string, teamId: string) => {
    try {
      const currentStakeholders = currentTeamStakeholders || [];
      if (!currentStakeholders.includes(userEmail)) {
        const updatedStakeholders = [...currentStakeholders, userEmail];
        await onUpdateSetting(`team_${teamId}_stakeholders`, updatedStakeholders.join(','));
        setCurrentTeamStakeholders(updatedStakeholders);
      }
    } catch (error) {
      alert('Failed to assign team stakeholder. Please try again.');
    }
  };

  const handleRemoveTeamStakeholder = async (userEmail: string, teamId: string) => {
    try {
      const currentStakeholders = currentTeamStakeholders || [];
      const updatedStakeholders = currentStakeholders.filter(email => email !== userEmail);
      await onUpdateSetting(`team_${teamId}_stakeholders`, updatedStakeholders.join(','));
      setCurrentTeamStakeholders(updatedStakeholders);
    } catch (error) {
      alert('Failed to remove team stakeholder. Please try again.');
    }
  };

  const handleAssignMultipleTeamStakeholders = async (teamId: string) => {
    try {
      const currentStakeholders = currentTeamStakeholders || [];
      const newStakeholders = [...new Set([...currentStakeholders, ...Array.from(selectedTeamStakeholders)])];
      await onUpdateSetting(`team_${teamId}_stakeholders`, newStakeholders.join(','));
      setCurrentTeamStakeholders(newStakeholders);
      setSelectedTeamStakeholders(new Set());
    } catch (error) {
      alert('Failed to assign team stakeholders. Please try again.');
    }
  };

  const handleRenameTeam = async (teamId: string, newName: string) => {
    if (!newName.trim()) {
      alert('Team name cannot be empty');
      return;
    }
    if (!onRenameTeam) {
      alert('Rename functionality not available');
      return;
    }
    try {
      await onRenameTeam(teamId, newName.trim());
      setRenamingTeamId(null);
      setNewTeamName('');
      setTeamSuccessMessage(`Team renamed successfully`);
      setTimeout(() => setTeamSuccessMessage(null), 3000);
    } catch (error) {
      alert('Failed to rename team. Please try again.');
    }
  };

  const startRenameTeam = (teamId: string, currentName: string) => {
    setRenamingTeamId(teamId);
    setNewTeamName(currentName);
  };

  const cancelRenameTeam = () => {
    setRenamingTeamId(null);
    setNewTeamName('');
  };

  // Search filter inputs
  const [userSearchText, setUserSearchText] = useState('');
  const [templateSearchText, setTemplateSearchText] = useState('');

  // PERFORMANCE: memoized, debounced filtering
  const debouncedUserSearch = useDebounce(userSearchText, 250);
  const debouncedTemplateSearch = useDebounce(templateSearchText, 250);

  const filteredUsers = useMemo(() => {
    const q = debouncedUserSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.FullName.toLowerCase().includes(q) ||
        u.Email.toLowerCase().includes(q) ||
        u.Role.toLowerCase().includes(q) ||
        u.TeamNames?.some((t) => t.toLowerCase().includes(q))
    );
  }, [users, debouncedUserSearch]);

  const filteredTemplates = useMemo(() => {
    const q = debouncedTemplateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.Title.toLowerCase().includes(q) ||
        t.Description.toLowerCase().includes(q) ||
        t.AssignedToEmail.toLowerCase().includes(q)
    );
  }, [templates, debouncedTemplateSearch]);

  // Lookup map — replaces repeated users.find(u => u.Email === ...) in render
  const usersByEmail = useMemo(() => {
    const m = new Map<string, (typeof users)[number]>();
    users.forEach((u) => m.set(u.Email.toLowerCase(), u));
    return m;
  }, [users]);

  // Define template state
  const [tempTitle, setTempTitle] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [tempPriority, setTempPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [tempRecurrence, setTempRecurrence] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly'>('Monthly');
  const [tempAssignToEmail, setTempAssignToEmail] = useState('');
  const [tempStartDate, setTempStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [templateSuccessMessage, setTemplateSuccessMessage] = useState<string | null>(null);
  const [templateErrorMessage, setTemplateErrorMessage] = useState<string | null>(null);

  // Weekly report requirements state
  const [reportRequirements, setReportRequirements] = useState<Record<string, { level: 'team' | 'subteam'; subTeamIds: string[] }>>({});
  const [reportRequirementsSaveSuccess, setReportRequirementsSaveSuccess] = useState(false);

  // Report configuration state
  const [teamReportConfigs, setTeamReportConfigs] = useState<Record<string, { reminderDay: string; meetingDay: string }>>({});
  const [editingReportConfigTeamId, setEditingReportConfigTeamId] = useState<string | null>(null);
  const [editingReminderDay, setEditingReminderDay] = useState('');
  const [editingMeetingDay, setEditingMeetingDay] = useState('');

  // Calculate teams that need attention (no leaders or stakeholders)
  const teamsNeedingAttention = teams.filter(team => {
    const hasLeaders = team.TeamLeaderEmails && team.TeamLeaderEmails.length > 0;
    const hasStakeholders = team.StakeholderEmails && team.StakeholderEmails.length > 0;
    return team.Active && !hasLeaders && !hasStakeholders;
  });

  // Track settings Apply flashes
  const [settingSaveFlash, setSettingSaveFlash] = useState<string | null>(null);
  const [settingErrorFlash, setSettingErrorFlash] = useState<string | null>(null);

  // Load weekly report requirements from settings
  React.useEffect(() => {
    const requirementsSetting = settings.find(s => s.Key === 'weekly_report_requirements');
    if (requirementsSetting && requirementsSetting.Value) {
      try {
        const parsed = JSON.parse(requirementsSetting.Value);
        setReportRequirements(parsed);
      } catch (e) {
      }
    }
  }, [settings]);

  // Load team report configs from Firestore when report_config tab is activated
  React.useEffect(() => {
    if (activeAdminSubTab === 'report_config') {
      loadTeamReportConfigs();
    }
  }, [activeAdminSubTab]);

  const loadTeamReportConfigs = async () => {
    try {
      const response = await getTeamReportConfigs();
      if (response.success && response.configs) {
        const configsMap: Record<string, { reminderDay: string; meetingDay: string }> = {};
        response.configs.forEach(config => {
          configsMap[config.teamId] = {
            reminderDay: config.reminderDay,
            meetingDay: config.meetingDay
          };
        });
        setTeamReportConfigs(configsMap);
      }
    } catch (error) {
    }
  };

  const handleUserCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrorMessage(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanManager = managerEmail.trim().toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const fail = (msg: string) => {
      setUserErrorMessage(msg);
      setTimeout(() => setUserErrorMessage(null), 4000);
    };

    if (!cleanName || !cleanEmail || !password.trim())
      return fail('Full name, email and password are required.');
    if (!emailRe.test(cleanEmail)) return fail('Enter a valid email address.');
    if (users.some((u) => u.Email.trim().toLowerCase() === cleanEmail))
      return fail(`A user with email ${cleanEmail} already exists.`);
    if (password.length < 6) return fail('Password must be at least 6 characters.');

    if (role === ROLE.SUB_STAKEHOLDER) {
      if (!cleanManager) return fail('Manager email is required for sub-stakeholders.');
      if (!emailRe.test(cleanManager)) return fail('Enter a valid manager email.');
      if (cleanManager === cleanEmail) return fail('A user cannot be their own manager.');
      if (!users.some((u) => u.Email.trim().toLowerCase() === cleanManager))
        return fail('Manager email doesn’t match any existing user.');
    }

    const matchedTeams = teams.filter((t) => teamSelections.includes(t.TeamID));
    const newId = generateUniqueId('USR', new Set(users.map((u) => u.UserID)));
    const now = new Date().toISOString();

    try {
      setIsCreatingUser(true);
      await onAddUser({
        UserID: newId,
        FullName: cleanName,
        Email: cleanEmail,
        Role: role,
        // FIX: manager belongs to SUB-stakeholders, not stakeholders
        ManagerEmail: role === ROLE.SUB_STAKEHOLDER ? cleanManager : '',
        TeamIDs: teamSelections,
        TeamNames: matchedTeams.map((t) => t.TeamName),
        Active: true,
        CanCreateFollowUp: true,
        CanCloseTask: true,
        Password: password,
        CreatedAt: now,
        UpdatedAt: now,
      });

      onSendInviteEmail?.(cleanEmail, cleanName, role);

      setUserSuccessMessage(
        `User ${cleanName} (${newId}) created${onSendInviteEmail ? ' — invite email sent' : ''}.`
      );
      setTimeout(() => setUserSuccessMessage(null), 4000);

      setFullName('');
      setEmail('');
      setManagerEmail('');
      setTeamSelections([]);
      setPassword('');
    } catch (err: any) {
      fail(err?.message || 'Failed to create user. Try again.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleTeamCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;

    const newId = `T-${Math.floor(100 + Math.random() * 899)}`;

    onAddTeam({
      TeamID: newId,
      TeamName: teamName.trim(),
      Description: teamDescription.trim(),
      Active: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    });

    setTeamSuccessMessage(`Team ${newId} created successfully.`);
    setTimeout(() => setTeamSuccessMessage(null), 3000);

    setTeamName('');
    setTeamDescription('');
  };

  // CSV Processing functions
  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setCsvUploadResult(null);
    setCsvErrors([]);
    setCsvPreview([]);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const existingEmails = new Set(users.map((u) => u.Email.trim().toLowerCase()));
      const { valid, errors } = parseAndValidateUsersCsv(text, existingEmails);
      setCsvPreview(valid);
      setCsvErrors(errors);
    };
    reader.onerror = () => {
      setCsvErrors([{ rowNumber: 0, fullName: '', email: '', error: 'Could not read the file.' }]);
    };
    reader.readAsText(file);

    // allow re-selecting the same file after a fix
    e.target.value = '';
  };

  const handleCSVUpload = async () => {
    if (!csvPreview.length) return;
    setIsProcessingCsv(true);

    try {
      const { bulkUploadUsers } = await import('../api/auth');

      const result = await bulkUploadUsers({
        users: csvPreview.map((row) => ({
          FullName: row.FullName,
          Email: row.Email,
          Role: row.Role,
          ManagerEmail: row.ManagerEmail,
          TeamName: row.TeamName,
          Password: row.Password,
        })),
      });

      if (result.success) {
        const serverErrors: CsvRowError[] = (result.results.errors ?? []).map((err: any) => {
          const match = csvPreview.find(
            (r) => r.Email.toLowerCase() === String(err.email ?? '').toLowerCase()
          );
          return {
            rowNumber: match?.rowNumber ?? 0,
            fullName: match?.FullName ?? '',
            email: err.email ?? '',
            error: err.error ?? 'Server rejected this row',
          };
        });

        // keep local validation errors visible alongside server errors
        setCsvErrors((prev) => [...prev, ...serverErrors]);
        setCsvUploadResult({
          success: result.results.success,
          failed: result.results.failed,
        });

        // clear the preview only on success
        setCsvPreview([]);
        setCsvFile(null);
        await onRefreshUsers?.();
      } else {
        setCsvUploadResult({ success: 0, failed: csvPreview.length });
      }
    } catch (error: any) {
      setCsvUploadResult({ success: 0, failed: csvPreview.length });
      setCsvErrors((prev) => [
        ...prev,
        {
          rowNumber: 0,
          fullName: '',
          email: '',
          error: error?.message || 'Upload failed — the preview is kept so you can retry.',
        },
      ]);
      // NOTE: intentionally NOT clearing csvPreview/csvFile here
    } finally {
      setIsProcessingCsv(false);
    }
  };

  const downloadCSVTemplate = () => {
    const headers = ['Full Name', 'Email', 'Role', 'Manager Email', 'Password'];
    const sampleRow = ['John Doe', 'john@example.com', 'Stakeholder', 'manager@example.com', 'temp123'];
    const csvContent = [headers.join(','), sampleRow.join(',')].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stakeholders_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadErrorsCSV = () => {
    if (csvErrors.length === 0) return;

    const headers = ['Row', 'Full Name', 'Email', 'Error'];
    const rows = csvErrors.map(err =>
      [err.rowNumber, err.fullName, err.email, JSON.stringify(err.error ?? '')].join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stakeholders_errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTemplateCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTemplateErrorMessage(null);

    // Guard: block action if session hasn't loaded
    if (!currentUserEmail) {
      setTemplateErrorMessage('Your session has not finished loading. Please wait a moment and try again.');
      return;
    }

    if (!tempTitle.trim() || !tempDesc.trim() || !tempAssignToEmail) {
      setTemplateErrorMessage('Enter a title, description, and an assignee email.');
      return;
    }
    if (!tempStartDate || Number.isNaN(new Date(tempStartDate).getTime())) {
      setTemplateErrorMessage('Choose a valid start date.');
      return;
    }

    const matchedUser = users.find(
      (u) => u.Email.toLowerCase() === tempAssignToEmail.toLowerCase()
    );
    if (!matchedUser) {
      setTemplateErrorMessage('Assignee email doesn\'t match any existing user.');
      return;
    }

    const newId = generateUniqueId('TMP', new Set(templates.map((t) => t.TemplateID)));
    const now = new Date().toISOString();
    const start = tempStartDate;

    onAddTemplate({
      TemplateID: newId,
      Title: tempTitle.trim(),
      Description: tempDesc.trim(),
      Priority: tempPriority,
      RecurrenceType: tempRecurrence,
      StartDate: start,
      NextGenerationDate: start,
      LastGeneratedDate: '',
      AssignedByEmail: currentUserEmail,
      AssignedToEmail: matchedUser.Email,
      AssignedToRole: matchedUser.Role as any,
      TeamID: matchedUser.TeamIDs.length > 0 ? matchedUser.TeamIDs[0] : 'T-01',
      Active: true,
      CreatedAt: now,
      UpdatedAt: now,
    });

    setTemplateSuccessMessage(`Recurrence blueprint ${newId} created.`);
    setTimeout(() => setTemplateSuccessMessage(null), 3000);
    setTempTitle('');
    setTempDesc('');
  };

  const handleReportRequirementChange = (teamId: string, level: 'team' | 'subteam') => {
    setReportRequirements(prev => ({
      ...prev,
      [teamId]: { level, subTeamIds: level === 'subteam' ? prev[teamId]?.subTeamIds || [] : [] }
    }));
  };

  const handleSubTeamToggle = (teamId: string, subTeamId: string) => {
    setReportRequirements(prev => {
      const current = prev[teamId];
      if (!current || current.level !== 'subteam') return prev;

      const newSubTeamIds = current.subTeamIds.includes(subTeamId)
        ? current.subTeamIds.filter(id => id !== subTeamId)
        : [...current.subTeamIds, subTeamId];

      return {
        ...prev,
        [teamId]: { ...current, subTeamIds: newSubTeamIds }
      };
    });
  };

  const handleSaveReportRequirements = async () => {
    try {
      await onUpdateSetting('weekly_report_requirements', JSON.stringify(reportRequirements));
      setReportRequirementsSaveSuccess(true);
      setTimeout(() => setReportRequirementsSaveSuccess(false), 2500);
    } catch (err) {
      alert('Failed to save report requirements. Please try again.');
    }
  };

  const handleSaveTeamReportConfig = async (teamId: string, reminderDay: string, meetingDay: string) => {
    try {
      const result = await updateTeamReportConfig(teamId, reminderDay, meetingDay);
      if (result.success) {
        setTeamReportConfigs(prev => ({
          ...prev,
          [teamId]: { reminderDay, meetingDay }
        }));
        setEditingReportConfigTeamId(null);
      } else {
        alert('Failed to save team report configuration. Please try again.');
      }
    } catch (error) {
      alert('Failed to save team report configuration. Please try again.');
    }
  };

  const getRoleBadgeColor = (role: string, isDarkMode: boolean) => {
    switch (role) {
      case 'Admin': return isDarkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200';
      case 'Stakeholder': return isDarkMode ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Sub-stakeholder': return isDarkMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200';
      default: return isDarkMode ? 'bg-slate-500/10 text-secondary border-slate-500/20' : 'bg-slate-50 text-slate-700';
    }
  };

  const adminTabs: { id: typeof activeAdminSubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'users', label: 'Users', icon: <Users size={14} /> },
    { id: 'teams', label: 'Teams', icon: <Users size={14} /> },
    { id: 'templates', label: 'Templates', icon: <Repeat size={14} /> },
    { id: 'email_templates', label: 'Email', icon: <Mail size={14} /> },
    { id: 'report_requirements', label: 'Reports', icon: <FileText size={14} /> },
    { id: 'report_config', label: 'Report Config', icon: <Settings size={14} /> },
    { id: 'missing_reports', label: 'Missing Reports', icon: <AlertCircle size={14} /> },
  ];

  return (
    <div className={`rounded-xl border overflow-hidden font-sans ${isDarkMode ? 'bg-[#0F172A] border-[#334155]' : 'bg-surface border-token'}`}>

      {/* Tab Navigation - scrollable on mobile */}
      <div className={`px-4 md:px-6 py-4 border-b ${isDarkMode ? 'border-[#334155]' : 'border-token'}`}>
        <div className={`flex rounded-lg p-1 gap-1 overflow-x-auto w-full sm:w-auto ${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-100'}`}>
          {adminTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveAdminSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 md:px-3.5 py-2 rounded-md text-xs font-semibold transition-all select-none cursor-pointer whitespace-nowrap ${
                activeAdminSubTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isDarkMode
                    ? 'text-slate-400 hover:text-white hover:bg-white/5'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={`p-4 md:p-6 ${isDarkMode ? 'bg-[#0F172A]' : 'bg-slate-50/70'}`}>

        {/* SUBTAB 1: Users Mapping Directory */}
        {activeAdminSubTab === 'users' && (
          <div className="space-y-6">

            {/* Pending approvals row if any */}
            {(() => {
              const pendingApprovals = users.filter(u => u.ApprovalStatus === 'pending' && !u.Active);
              if (pendingApprovals.length === 0) return null;
              return (
                <div className={`border rounded-xl p-5 space-y-4 ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                  <div className={`flex items-center gap-3 ${isDarkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
                      <Shield size={18} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
                    </div>
                    <h4 className="font-semibold text-sm">
                      Pending approvals ({pendingApprovals.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {pendingApprovals.map(req => (
                      <div key={req.UserID} className={`border rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isDarkMode ? 'bg-[#1E293B] border-amber-500/20' : 'bg-white border-amber-200/80'}`}>
                        <div>
                          <div className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{req.FullName}</div>
                          <div className={`text-xs mt-0.5 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{req.Email}</div>
                          <div className={`text-xs mt-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Role: <strong className={isDarkMode ? 'text-white' : 'text-slate-800'}>{req.Role}</strong> · Manager: {req.ManagerEmail || 'Direct Admin'}
                          </div>
                        </div>
                        <button
                          onClick={() => onApproveUser(req.Email)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer border-none flex items-center gap-2"
                        >
                          <CheckSquare size={14} />
                          <span>Approve</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* How to register users — guide */}
            <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
              <button
                type="button"
                onClick={() => setShowRegistrationGuide(!showRegistrationGuide)}
                className={`w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 ${isDarkMode ? 'bg-blue-500/15' : 'bg-blue-50'}`}>
                    <Info size={16} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <div className="min-w-0">
                    <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      How to register users
                    </h4>
                    <p className={`text-xs mt-0.5 truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      Three ways to add people to your workspace
                    </p>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`shrink-0 transition-transform duration-200 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} ${showRegistrationGuide ? 'rotate-180' : ''}`}
                />
              </button>

              {showRegistrationGuide && (
                <div className={`px-4 sm:px-5 pb-4 sm:pb-5 pt-0 border-t ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mt-4">
                    {[
                      {
                        badge: 'OPTION 1',
                        badgeCls: isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700',
                        icon: <Plus size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />,
                        iconBg: isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50',
                        title: 'Create manually',
                        desc: 'Fill in the form below with name, email, role, teams, and password. The user can sign in immediately.',
                      },
                      {
                        badge: 'OPTION 2',
                        badgeCls: isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700',
                        icon: <FileSpreadsheet size={14} className={isDarkMode ? 'text-purple-400' : 'text-purple-600'} />,
                        iconBg: isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50',
                        title: 'Bulk CSV import',
                        desc: 'Download the template, add rows (Full Name, Email, Role, Manager Email, Password), then upload the CSV.',
                      },
                      {
                        badge: 'OPTION 3',
                        badgeCls: isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700',
                        icon: <UserPlus size={14} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />,
                        iconBg: isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50',
                        title: 'Self-service request',
                        desc: 'Users click "Request Account" on the login page. Approve pending requests in the banner above.',
                      },
                    ].map(opt => (
                      <div key={opt.badge} className={`relative rounded-xl p-4 border ${isDarkMode ? 'bg-[#0F172A] border-[#334155]' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className={`absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${opt.badgeCls}`}>
                          {opt.badge}
                        </div>
                        <div className="flex items-start gap-3 mt-2">
                          <div className={`p-2 rounded-lg shrink-0 ${opt.iconBg}`}>{opt.icon}</div>
                          <div>
                            <p className={`font-semibold text-xs sm:text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{opt.title}</p>
                            <p className={`text-[11px] sm:text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                              {opt.desc}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 xl:gap-6 items-start">

              {/* Add user form */}
              <div className={`border rounded-xl p-5 space-y-4 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                <div className={`flex items-center gap-3 border-b pb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                  <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <Plus size={18} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add new user</h4>
                </div>

                {/* Bulk CSV Upload Section */}
                <div className={`p-3 rounded-xl border space-y-2 ${isDarkMode ? 'bg-[#334155]/50 border-[#475569]' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`flex items-center justify-between gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet size={14} className={isDarkMode ? 'text-purple-400' : 'text-purple-600'} />
                      <span className="text-xs font-semibold">Bulk CSV upload</span>
                    </div>
                    <button
                      type="button"
                      onClick={downloadCSVTemplate}
                      className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors shrink-0 ${isDarkMode ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                    >
                      Download template
                    </button>
                  </div>
                  <label className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${isDarkMode ? 'border-[#475569] hover:border-blue-500/50 bg-[#1E293B]/50' : 'border-slate-300 hover:border-blue-400 bg-white'}`}>
                    <Upload size={16} className={isDarkMode ? 'text-slate-400' : 'text-slate-500'} />
                    <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      {csvFile ? csvFile.name : 'Drop CSV or click'}
                    </span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileSelect}
                      className="hidden"
                    />
                  </label>
                  {csvPreview.length > 0 && (
                    <div className="space-y-2">
                      <div className={`text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Preview ({csvPreview.length} rows):
                      </div>
                      <div className={`max-h-24 overflow-y-auto text-xs p-2 rounded border ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                        {csvPreview.slice(0, 5).map((row, i) => (
                          <div key={i} className={`py-0.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {row.FullName} ({row.Email})
                          </div>
                        ))}
                        {csvPreview.length > 5 && (
                          <div className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            …and {csvPreview.length - 5} more
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleCSVUpload}
                        disabled={isProcessingCsv}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-semibold text-xs py-2 rounded-lg transition-colors"
                      >
                        {isProcessingCsv ? 'Processing…' : 'Import users'}
                      </button>
                    </div>
                  )}
                  {csvErrors.length > 0 && (
                    <div className={`p-2 rounded-lg text-xs border ${isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
                      {csvErrors.length} row{csvErrors.length === 1 ? '' : 's'} skipped due to validation errors.
                      <button type="button" onClick={downloadErrorsCSV} className="ml-2 underline font-semibold">
                        Download errors
                      </button>
                    </div>
                  )}
                  {csvUploadResult && (
                    <div className={`p-2 rounded-lg text-xs border ${csvUploadResult.failed === 0
                      ? (isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-800 border-emerald-200')
                      : (isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 text-amber-800 border-amber-200')}`}>
                      {csvUploadResult.success} imported, {csvUploadResult.failed} failed
                      {csvUploadResult.failed > 0 && (
                        <button
                          type="button"
                          onClick={downloadErrorsCSV}
                          className="ml-2 underline font-semibold"
                        >
                          Download errors
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {userSuccessMessage && (
                  <div className={`p-3 text-sm rounded-lg font-medium flex items-center gap-2 border ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                    <CheckCircle size={16} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{userSuccessMessage}</span>
                  </div>
                )}

                {userErrorMessage && (
                  <div className={`p-3 text-sm rounded-lg font-medium flex items-center gap-2 border ${isDarkMode ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-red-700 bg-red-50 border-red-200'}`}>
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{userErrorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleUserCreateSubmit} className="space-y-3">
                  <FormField label="Full name" required>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rachel Zane"
                    />
                  </FormField>

                  <FormField label="Email address" required>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. rachel@PMS.com"
                    />
                  </FormField>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Role">
                      <Select value={role} onChange={(e) => setRole(e.target.value as any)}>
                        <option value="Admin">Admin</option>
                        <option value="Stakeholder">Stakeholder</option>
                      </Select>
                    </FormField>

                    <FormField label="Manager email">
                      <Input
                        type="email"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        placeholder="e.g. sales.lead@PMS.com"
                      />
                    </FormField>
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Teams</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          const dropdown = document.getElementById('teams-dropdown');
                          if (dropdown) {
                            dropdown.classList.toggle('hidden');
                          }
                        }}
                        className={`w-full text-sm rounded-lg px-3 py-2.5 border appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer text-left flex items-center justify-between ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                      >
                        <span>{teamSelections.length === 0 ? 'Select teams' : `${teamSelections.length} selected`}</span>
                        <ChevronDown size={14} className={isDarkMode ? 'text-slate-400' : 'text-slate-400'} />
                      </button>
                      <div
                        id="teams-dropdown"
                        className={`absolute z-10 w-full mt-1 border rounded-lg shadow-lg max-h-48 overflow-y-auto hidden ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}
                      >
                        {teams.length > 0 ? (
                          teams.map(t => (
                            <label key={t.TeamID} className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${isDarkMode ? 'hover:bg-[#334155]' : 'hover:bg-slate-50'}`}>
                              <input
                                type="checkbox"
                                value={t.TeamID}
                                checked={teamSelections.includes(t.TeamID)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setTeamSelections([...teamSelections, t.TeamID]);
                                  } else {
                                    setTeamSelections(teamSelections.filter(id => id !== t.TeamID));
                                  }
                                }}
                                className="w-4 h-4 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500"
                              />
                              <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{t.TeamName}</span>
                            </label>
                          ))
                        ) : (
                          <p className="text-sm italic p-3 text-slate-500">No teams available</p>
                        )}
                      </div>
                    </div>
                    {teamSelections.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {teamSelections.map(teamId => {
                          const team = teams.find(t => t.TeamID === teamId);
                          return team ? (
                            <span key={teamId} className={`inline-flex items-center gap-1 border text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                              {team.TeamName}
                              <button
                                type="button"
                                onClick={() => setTeamSelections(teamSelections.filter(id => id !== teamId))}
                                className="ml-0.5 rounded-full hover:opacity-70"
                              >
                                <X size={9} />
                              </button>
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>

                  <FormField label="Password" required>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. ••••••"
                    />
                  </FormField>

                  <button
                    type="submit"
                    disabled={isCreatingUser}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors shadow-sm cursor-pointer border-none flex items-center justify-center gap-2"
                  >
                    {isCreatingUser ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    <span>{isCreatingUser ? 'Creating…' : 'Create user'}</span>
                  </button>
                </form>
              </div>

              {/* User directory */}
              <div className="space-y-3 min-w-0">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <SearchInput
                      value={userSearchText}
                      onChange={setUserSearchText}
                      placeholder={`Search ${users.length} users…`}
                    />
                    <span className={`text-sm whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {users.length} users
                      {userSearchText && ` · ${filteredUsers.length} results`}
                    </span>
                  </div>
                </div>

                <div className={`max-h-[calc(100dvh-320px)] overflow-y-auto overflow-x-auto border rounded-xl shadow-sm ${isDarkMode ? 'border-[#334155] bg-[#1E293B]' : 'border-slate-200 bg-white'}`}>
                  <table className="w-full text-xs">
                    <thead className={`sticky top-0 z-10 ${isDarkMode ? 'bg-[#0F172A]' : 'bg-slate-50'}`}>
                      <tr className={`border-b ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                        <th className={`px-2 py-2 text-left font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>User</th>
                        <th className={`px-2 py-2 text-left font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Teams</th>
                        <th className={`px-2 py-2 text-left font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Manager</th>
                        <th className={`px-2 py-2 text-left font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Role</th>
                        <th className={`px-2 py-2 text-left font-semibold text-[10px] uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Status</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-100'}`}>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center">
                            <div className="flex flex-col items-center justify-center space-y-3">
                              <Users size={40} className={isDarkMode ? 'text-slate-600' : 'text-slate-300'} />
                              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                {userSearchText ? 'No users match your search' : 'No users found'}
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map(user => {
                          const isBanned = !user.Active;
                          return (
                            <tr
                              key={user.UserID}
                              className={`transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'} ${isBanned ? (isDarkMode ? 'bg-red-500/5' : 'bg-red-50/40') : ''}`}
                            >
                              <td className="px-2 py-2 align-top">
                                <div className="min-w-0">
                                  <div className={`font-semibold truncate text-[11px] ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{user.FullName}</div>
                                  <div className={`text-[10px] truncate ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{user.Email}</div>
                                  <div className={`text-[9px] font-mono truncate ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{user.UserID}</div>
                                </div>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <div className="space-y-1.5 min-w-[140px] max-w-[220px]">
                                  <div className="flex flex-wrap gap-1">
                                    {(user.TeamNames || []).map((tName, i) => {
                                      const tId = (user.TeamIDs || [])[i];
                                      return (
                                        <span key={i} className={`inline-flex items-center gap-1 border text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                                          {tName}
                                          <button
                                            type="button"
                                            title={`Remove from ${tName}`}
                                            onClick={() => handleRemoveMember(user.Email, tId, tName)}
                                            className={`rounded-full hover:opacity-70 transition-opacity ${isDarkMode ? 'text-indigo-300' : 'text-indigo-500'}`}
                                          >
                                            <X size={8} />
                                          </button>
                                        </span>
                                      );
                                    })}
                                    {(user.TeamNames || []).length === 0 && (
                                      <span className={`text-[9px] italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No teams</span>
                                    )}
                                  </div>

                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() => setOpenTeamDropdownFor(openTeamDropdownFor === user.UserID ? null : user.UserID)}
                                      className={`w-full flex items-center justify-between gap-1 text-[9px] font-semibold rounded px-1.5 py-1 border transition-colors cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-[#334155] text-slate-300 hover:bg-[#334155]/60' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                      <span>+ Add / edit teams</span>
                                      <ChevronDown size={10} className={`transition-transform ${openTeamDropdownFor === user.UserID ? 'rotate-180' : ''}`} />
                                    </button>

                                    {openTeamDropdownFor === user.UserID && (
                                      <>
                                        {/* click anywhere outside to close */}
                                        <div className="fixed inset-0 z-10" onClick={() => setOpenTeamDropdownFor(null)} />
                                        <div className={`absolute z-20 left-0 mt-1 w-48 border rounded-lg shadow-lg max-h-44 overflow-y-auto ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                                          {teams.filter(t => t.Active).length > 0 ? (
                                            teams.filter(t => t.Active).map(t => {
                                              const checked = (user.TeamIDs || []).includes(t.TeamID);
                                              return (
                                                <label key={t.TeamID} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer ${isDarkMode ? 'hover:bg-[#334155] text-slate-300' : 'hover:bg-slate-50 text-slate-700'}`}>
                                                  <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                      if (e.target.checked) {
                                                        handleAddMember(user.Email, t.TeamID, t.TeamName);
                                                      } else {
                                                        handleRemoveMember(user.Email, t.TeamID, t.TeamName);
                                                      }
                                                    }}
                                                    className="w-3.5 h-3.5 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500 shrink-0"
                                                  />
                                                  <span className="truncate">{t.TeamName}</span>
                                                </label>
                                              );
                                            })
                                          ) : (
                                            <p className="text-xs italic p-3 text-slate-500">No teams available</p>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2 align-top">
                                {user.ManagerEmail ? (
                                  <span className={`text-[10px] block truncate max-w-[150px] ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} title={user.ManagerEmail}>{user.ManagerEmail}</span>
                                ) : (
                                  <span className={`text-[10px] italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Reports directly to Super Admin">—</span>
                                )}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <select
                                  value={user.Role}
                                  onChange={(e) => onUpdateUserRole(user.Email, e.target.value as any)}
                                  className={`text-[10px] font-semibold rounded px-1.5 py-1 border cursor-pointer ${isDarkMode ? 'bg-[#0F172A] border-[#334155] text-white' : 'bg-white border-slate-200 text-slate-700'}`}
                                >
                                  <option value="Admin">Admin</option>
                                  <option value="Stakeholder">Stakeholder</option>
                                  <option value="Sub-stakeholder">Sub-stakeholder</option>
                                </select>
                              </td>
                              <td className="px-2 py-2 align-top">
                                <button
                                  onClick={() => onToggleUserStatus(user.Email)}
                                  className={`text-[9px] font-bold tracking-wider py-1 px-2 rounded-md border transition-colors cursor-pointer ${user.Active
                                    ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                    : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                                    }`}
                                >
                                  {user.Active ? 'Active' : 'Banned'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: Teams Management */}
        {activeAdminSubTab === 'teams' && (
          <div className="space-y-6">
            {/* Needs Attention Banner */}
            {teamsNeedingAttention.length > 0 && (
              <div className={`border rounded-xl p-4 ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
                    <AlertCircle size={18} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                      {teamsNeedingAttention.length} team{teamsNeedingAttention.length === 1 ? '' : 's'} need attention
                    </h4>
                    <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-700'}`}>
                      No team leaders or stakeholders assigned — report emails can't be sent until recipients are assigned.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {teamsNeedingAttention.map(team => (
                    <button
                      key={team.TeamID}
                      type="button"
                      title={`Assign leaders for ${team.TeamName}`}
                      onClick={() => {
                        setExpandedTeamId(team.TeamID);
                        setManageModalTab('members');
                        setSelectedUsersToAdd(new Set());
                        setSelectedTeamLeaders(new Set());
                        setSelectedTeamStakeholders(new Set());
                        setMemberSearchQuery('');
                        setCurrentTeamLeaders(team.TeamLeaderEmails || []);
                        setCurrentTeamStakeholders(team.StakeholderEmails || []);
                      }}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${isDarkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20' : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100'}`}
                    >
                      <span>{team.TeamName}</span>
                      <span className={`font-mono text-[10px] ${isDarkMode ? 'text-amber-400/60' : 'text-amber-600'}`}>{team.TeamID}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">
              {/* Add Team Form */}
              <div className={`border rounded-xl p-5 space-y-3 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                <div className={`flex items-center gap-2 border-b pb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                  <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <Plus size={16} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Create new team</h4>
                </div>

                {teamSuccessMessage && (
                  <div className={`p-2.5 text-xs rounded-lg font-medium flex items-center gap-1.5 border ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                    <CheckCircle size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{teamSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTeamCreateSubmit} className="space-y-3">
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Team name</label>
                    <input
                      type="text"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Engineering Team"
                      className={`w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Description (optional)</label>
                    <textarea
                      value={teamDescription}
                      onChange={(e) => setTeamDescription(e.target.value)}
                      placeholder="e.g. Team description and purpose…"
                      rows={2}
                      className={`w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-semibold transition-colors shadow-sm cursor-pointer border-none flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} />
                    <span>Create team</span>
                  </button>
                </form>
              </div>

              {/* Teams List — now ONLY the table, no unassigned section nested inside */}
              <div className="lg:col-span-2 space-y-4 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>All teams ({teams.length})</h4>
                </div>

                <div className={`border rounded-xl overflow-hidden shadow-sm ${isDarkMode ? 'border-[#334155] bg-[#1E293B]' : 'border-slate-200 bg-white'}`}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className={isDarkMode ? 'bg-[#0F172A]' : 'bg-slate-50'}>
                        <tr className={`border-b ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                          <th className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Team</th>
                          <th className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Description</th>
                          <th className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Members</th>
                          <th className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Status</th>
                          <th className={`px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide whitespace-nowrap ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-100'}`}>
                        {teams.map(team => {
                          const teamUsers = users.filter(u => u.TeamIDs.includes(team.TeamID));
                          return (
                            <tr key={team.TeamID} className={`transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                              <td className="px-4 py-3">
                                <div className="min-w-0">
                                  {renamingTeamId === team.TeamID ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={newTeamName}
                                        onChange={(e) => setNewTeamName(e.target.value)}
                                        className={`text-xs font-semibold px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-slate-200 text-slate-900'}`}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleRenameTeam(team.TeamID, newTeamName);
                                          if (e.key === 'Escape') cancelRenameTeam();
                                        }}
                                      />
                                      <button
                                        onClick={() => handleRenameTeam(team.TeamID, newTeamName)}
                                        className={`text-[10px] px-2 py-1 rounded font-semibold ${isDarkMode ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={cancelRenameTeam}
                                        className={`text-[10px] px-2 py-1 rounded font-semibold ${isDarkMode ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <div className={`font-semibold truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{team.TeamName}</div>
                                      <button
                                        onClick={() => startRenameTeam(team.TeamID, team.TeamName)}
                                        className={`p-1 rounded transition-colors ${isDarkMode ? 'text-slate-500 hover:text-slate-300 hover:bg-[#334155]' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                                        title="Rename team"
                                      >
                                        <Edit size={12} />
                                      </button>
                                    </div>
                                  )}
                                  <div className={`text-[10px] font-mono truncate ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{team.TeamID}</div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs block truncate max-w-[200px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} title={team.Description || 'No description'}>{team.Description || <span className="italic opacity-70">No description</span>}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700'}`}>
                                  {teamUsers.length}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => onToggleTeamStatus(team.TeamID)}
                                  className={`text-[10px] font-bold tracking-wider py-1 px-2.5 rounded-md border transition-colors cursor-pointer ${team.Active
                                    ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                                    : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                                    }`}
                                >
                                  {team.Active ? 'Active' : 'Inactive'}
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setExpandedTeamId(team.TeamID);
                                      setManageModalTab('members');
                                      setSelectedUsersToAdd(new Set());
                                      setSelectedTeamLeaders(new Set());
                                      setSelectedTeamStakeholders(new Set());
                                      setMemberSearchQuery('');
                                      setCurrentTeamLeaders(team.TeamLeaderEmails || []);
                                      setCurrentTeamStakeholders(team.StakeholderEmails || []);
                                    }}
                                    className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-md border transition-colors cursor-pointer ${isDarkMode ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'}`}
                                  >
                                    Manage
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete the team "${team.TeamName}"? This will remove all member assignments to this team.`)) {
                                        onDeleteTeam(team.TeamID);
                                      }
                                    }}
                                    className={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded-md border transition-colors cursor-pointer ${isDarkMode ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30' : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'}`}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {teams.length === 0 && (
                    <div className="text-center py-14">
                      <Users size={40} className={`mx-auto mb-3 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>No teams yet</p>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Create your first team using the form on the left.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Unassigned Users — now full width, redesigned as a card grid */}
            {(() => {
              const unassignedUsers = users.filter(u => u.Active && (!u.TeamIDs || u.TeamIDs.length === 0));
              if (unassignedUsers.length === 0) return null;
              return (
                <div className={`border rounded-xl overflow-hidden shadow-sm ${isDarkMode ? 'border-amber-500/20 bg-[#1E293B]' : 'border-amber-200 bg-white'}`}>
                  <div className={`px-4 py-3 border-b flex items-center justify-between ${isDarkMode ? 'border-[#334155] bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-2">
                      <Users size={16} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
                      <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Unassigned users</h4>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                        {unassignedUsers.length}
                      </span>
                    </div>
                    <span className={`text-xs ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Not on any team yet</span>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {unassignedUsers.map(u => (
                      <div key={u.UserID} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${isDarkMode ? 'border-[#334155] bg-[#0F172A] hover:bg-[#334155]/40' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'}`}>
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDarkMode ? 'bg-slate-500/20 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                          {(u.FullName || '').split(' ').map(n => n[0]).join('').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium text-sm truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{u.FullName}</div>
                          <div className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                        </div>
                        <span className={`shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full ${isDarkMode ? 'bg-slate-500/10 text-slate-400' : 'bg-slate-200 text-slate-600'}`}>
                          {u.Role}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Team Management Modal */}
            {expandedTeamId && (() => {
              const team = teams.find(t => t.TeamID === expandedTeamId);
              if (!team) return null;
              const teamUsers = users.filter(u => u.TeamIDs.includes(team.TeamID));
              const availableUsers = users.filter(u => u.Active && !u.TeamIDs.includes(team.TeamID));
              const filteredAvailableUsers = availableUsers.filter(u =>
                u.FullName.toLowerCase().includes(memberSearchQuery.toLowerCase()) ||
                u.Email.toLowerCase().includes(memberSearchQuery.toLowerCase())
              );
              const currentLeaders = teamUsers.filter(u => currentTeamLeaders.includes(u.Email));
              const eligibleForLeadership = teamUsers.filter(u => !currentTeamLeaders.includes(u.Email));
              const currentStakeholders = teamUsers.filter(u => currentTeamStakeholders.includes(u.Email));
              const eligibleForStakeholder = teamUsers.filter(u => !currentTeamStakeholders.includes(u.Email));
              const teamSubTeams = subTeams.filter(st => st.TeamID === team.TeamID && st.Active);

              const tabs: { key: typeof manageModalTab; label: string; count: number }[] = [
                { key: 'members', label: 'Members', count: teamUsers.length },
                { key: 'leaders', label: 'Leaders', count: currentLeaders.length },
                { key: 'stakeholders', label: 'Stakeholders', count: currentStakeholders.length },
                { key: 'subteams', label: 'Sub-teams', count: teamSubTeams.length },
              ];

              const memberRow = (u: UserType, opts: { badge?: React.ReactNode; onRemove: () => void; removeTitle: string; avatarCls: string }) => (
                <div key={u.UserID} className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${isDarkMode ? 'bg-[#0F172A]' : 'bg-slate-50'}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${opts.avatarCls}`}>
                      {(u.FullName || '').split(' ').map(n => n[0]).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-medium text-sm truncate flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        <span className="truncate">{u.FullName}</span>
                        {opts.badge}
                      </div>
                      <div className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                    </div>
                  </div>
                  <button
                    onClick={opts.onRemove}
                    className={`shrink-0 p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
                    title={opts.removeTitle}
                  >
                    <X size={16} />
                  </button>
                </div>
              );

              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setExpandedTeamId(null)} />
                  <div className={`relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-xl shadow-2xl flex flex-col border ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                    {/* Header */}
                    <div className={`shrink-0 flex items-center justify-between px-6 py-4 border-b ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                      <div className="min-w-0">
                        <h3 className={`font-semibold text-lg truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Manage {team.TeamName}</h3>
                        <p className={`text-xs font-mono mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{team.TeamID}</p>
                      </div>
                      <button
                        onClick={() => setExpandedTeamId(null)}
                        className={`shrink-0 p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-[#334155] text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {/* Tab bar */}
                    <div className={`shrink-0 flex items-center gap-1 px-4 pt-2 border-b overflow-x-auto ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                      {tabs.map(tab => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => setManageModalTab(tab.key)}
                          className={`relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                            manageModalTab === tab.key
                              ? (isDarkMode ? 'text-white' : 'text-slate-900')
                              : (isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
                          }`}
                        >
                          <span>{tab.label}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            manageModalTab === tab.key
                              ? (isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700')
                              : (isDarkMode ? 'bg-slate-700/60 text-slate-400' : 'bg-slate-100 text-slate-500')
                          }`}>{tab.count}</span>
                          {manageModalTab === tab.key && (
                            <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 rounded-full" />
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-6">

                      {/* MEMBERS TAB */}
                      {manageModalTab === 'members' && (
                        <div className="space-y-6">
                          <section>
                            <h4 className={`font-semibold text-sm mb-3 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Current members ({teamUsers.length})</h4>
                            <div className={`space-y-2 max-h-60 overflow-y-auto ${teamUsers.length > 0 ? `border rounded-xl p-2 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}` : ''}`}>
                              {teamUsers.map(u => memberRow(u, {
                                badge: currentLeaders.some(l => l.Email === u.Email) ? (
                                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>Leader</span>
                                ) : currentStakeholders.some(s => s.Email === u.Email) ? (
                                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>Stakeholder</span>
                                ) : undefined,
                                onRemove: () => handleRemoveMember(u.Email, team.TeamID, team.TeamName),
                                removeTitle: 'Remove from team',
                                avatarCls: isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700',
                              }))}
                              {teamUsers.length === 0 && (
                                <div className={`text-center py-10 text-sm rounded-xl border border-dashed ${isDarkMode ? 'text-slate-400 border-[#334155]' : 'text-slate-500 border-slate-200'}`}>
                                  No members in this team yet.
                                </div>
                              )}
                            </div>
                          </section>

                          <section>
                            <h4 className={`font-semibold text-sm mb-3 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add members</h4>
                            <div className="space-y-3">
                              <div className="relative">
                                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} size={16} />
                                <input
                                  type="text"
                                  value={memberSearchQuery}
                                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                                  placeholder="Search by name or email…"
                                  className={`w-full pl-10 pr-4 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                                />
                              </div>
                              <div className={`space-y-1 max-h-60 overflow-y-auto border rounded-xl p-2 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                {filteredAvailableUsers.map(u => (
                                  <label key={u.UserID} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isDarkMode ? 'text-white hover:bg-[#334155]/50' : 'text-slate-900 hover:bg-slate-50'}`}>
                                    <input
                                      type="checkbox"
                                      checked={selectedUsersToAdd.has(u.Email)}
                                      onChange={(e) => {
                                        const newSelected = new Set(selectedUsersToAdd);
                                        if (e.target.checked) newSelected.add(u.Email);
                                        else newSelected.delete(u.Email);
                                        setSelectedUsersToAdd(newSelected);
                                      }}
                                      className="shrink-0 w-4 h-4 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm truncate">{u.FullName}</div>
                                      <div className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                    </div>
                                  </label>
                                ))}
                                {filteredAvailableUsers.length === 0 && (
                                  <div className={`text-center py-6 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {memberSearchQuery ? 'No users match your search.' : 'All active users are already members.'}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  selectedUsersToAdd.forEach(email => handleAddMember(email, team.TeamID, team.TeamName));
                                  setSelectedUsersToAdd(new Set());
                                }}
                                disabled={selectedUsersToAdd.size === 0}
                                className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors border-none ${selectedUsersToAdd.size === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500' : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'}`}
                              >
                                Add selected ({selectedUsersToAdd.size})
                              </button>
                            </div>
                          </section>
                        </div>
                      )}

                      {/* LEADERS TAB */}
                      {manageModalTab === 'leaders' && (
                        <section>
                          {teamUsers.length === 0 ? (
                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                              <p className="text-sm font-medium">Add members first before assigning team leaders.</p>
                            </div>
                          ) : (
                            <>
                              <div className={`space-y-2 max-h-48 overflow-y-auto border rounded-xl p-2 mb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                {currentLeaders.map(u => memberRow(u, {
                                  onRemove: () => handleRemoveTeamLeader(u.Email, team.TeamID),
                                  removeTitle: 'Remove as team leader',
                                  avatarCls: isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700',
                                }))}
                                {currentLeaders.length === 0 && (
                                  <div className={`text-center py-6 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No team leaders assigned yet.</div>
                                )}
                              </div>

                              {eligibleForLeadership.length > 0 && (
                                <div>
                                  <h5 className={`font-semibold text-xs uppercase tracking-wide mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Assign team leader</h5>
                                  <div className={`space-y-1 max-h-48 overflow-y-auto border rounded-xl p-2 mb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                    {eligibleForLeadership.map(u => (
                                      <label key={u.UserID} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isDarkMode ? 'text-white hover:bg-[#334155]/50' : 'text-slate-900 hover:bg-slate-50'}`}>
                                        <input
                                          type="checkbox"
                                          checked={selectedTeamLeaders.has(u.Email)}
                                          onChange={(e) => {
                                            const newSelected = new Set(selectedTeamLeaders);
                                            if (e.target.checked) newSelected.add(u.Email);
                                            else newSelected.delete(u.Email);
                                            setSelectedTeamLeaders(newSelected);
                                          }}
                                          className="shrink-0 w-4 h-4 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate">{u.FullName}</div>
                                          <div className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => handleAssignMultipleTeamLeaders(team.TeamID)}
                                    disabled={selectedTeamLeaders.size === 0}
                                    className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors border-none ${selectedTeamLeaders.size === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500' : 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'}`}
                                  >
                                    Assign selected ({selectedTeamLeaders.size})
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </section>
                      )}

                      {/* STAKEHOLDERS TAB — new, mirrors Leaders exactly */}
                      {manageModalTab === 'stakeholders' && (
                        <section>
                          {teamUsers.length === 0 ? (
                            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                              <p className="text-sm font-medium">Add members first before assigning stakeholders.</p>
                            </div>
                          ) : (
                            <>
                              <div className={`space-y-2 max-h-48 overflow-y-auto border rounded-xl p-2 mb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                {currentStakeholders.map(u => memberRow(u, {
                                  onRemove: () => handleRemoveTeamStakeholder(u.Email, team.TeamID),
                                  removeTitle: 'Remove as stakeholder',
                                  avatarCls: isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700',
                                }))}
                                {currentStakeholders.length === 0 && (
                                  <div className={`text-center py-6 text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>No stakeholders assigned yet.</div>
                                )}
                              </div>

                              {eligibleForStakeholder.length > 0 && (
                                <div>
                                  <h5 className={`font-semibold text-xs uppercase tracking-wide mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Assign stakeholder</h5>
                                  <div className={`space-y-1 max-h-48 overflow-y-auto border rounded-xl p-2 mb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                    {eligibleForStakeholder.map(u => (
                                      <label key={u.UserID} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isDarkMode ? 'text-white hover:bg-[#334155]/50' : 'text-slate-900 hover:bg-slate-50'}`}>
                                        <input
                                          type="checkbox"
                                          checked={selectedTeamStakeholders.has(u.Email)}
                                          onChange={(e) => {
                                            const newSelected = new Set(selectedTeamStakeholders);
                                            if (e.target.checked) newSelected.add(u.Email);
                                            else newSelected.delete(u.Email);
                                            setSelectedTeamStakeholders(newSelected);
                                          }}
                                          className="shrink-0 w-4 h-4 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate">{u.FullName}</div>
                                          <div className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                  <button
                                    onClick={() => handleAssignMultipleTeamStakeholders(team.TeamID)}
                                    disabled={selectedTeamStakeholders.size === 0}
                                    className={`w-full py-2.5 px-4 rounded-lg text-sm font-semibold transition-colors border-none ${selectedTeamStakeholders.size === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500' : 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'}`}
                                  >
                                    Assign selected ({selectedTeamStakeholders.size})
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </section>
                      )}

                      {/* SUB-TEAMS TAB — your existing sub-team markup, unchanged, just wrapped in this conditional */}
                      {manageModalTab === 'subteams' && (
                        <section>
                          <div className="flex items-center gap-2 mb-3">
                            <Layers size={16} className={isDarkMode ? 'text-indigo-400' : 'text-indigo-600'} />
                            <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                              Sub-teams ({teamSubTeams.length})
                            </h4>
                          </div>

                          {/* Existing sub-teams */}
                          {teamSubTeams.length > 0 && (
                            <div className="space-y-2 mb-4">
                              {teamSubTeams.map(st => {
                                const stMembers = users.filter(u => u.SubTeamIDs?.includes(st.SubTeamID) && u.Active);
                                const stLeaders = st.SubTeamLeaderEmails ?? [];
                                const isExpanded = expandedSubTeamId === st.SubTeamID;
                                return (
                                  <div key={st.SubTeamID} className={`border rounded-xl ${isDarkMode ? 'border-[#334155] bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
                                    {/* Sub-team header */}
                                    <div className="flex items-center justify-between p-3">
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-indigo-500/20' : 'bg-indigo-100'}`}>
                                          <Layers size={14} className={isDarkMode ? 'text-indigo-400' : 'text-indigo-600'} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className={`font-semibold text-sm truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{st.SubTeamName}</div>
                                          <div className={`text-xs truncate ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                            {stMembers.length} member{stMembers.length !== 1 ? 's' : ''} · {stLeaders.length} leader{stLeaders.length !== 1 ? 's' : ''}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => setExpandedSubTeamId(isExpanded ? null : st.SubTeamID)}
                                          className={`px-2.5 py-1.5 text-[10px] font-bold rounded-md border transition-colors cursor-pointer ${isDarkMode ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'}`}
                                        >
                                          {isExpanded ? 'Collapse' : 'Manage'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            if (!confirm(`Delete sub-team "${st.SubTeamName}"? Members will be unassigned.`)) return;
                                            await onDeleteSubTeam?.(st.SubTeamID);
                                          }}
                                          className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
                                          title="Delete sub-team"
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Expanded sub-team management */}
                                    {isExpanded && (
                                      <div className={`border-t px-3 pb-3 pt-3 space-y-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>

                                        {/* Members in this sub-team */}
                                        <div>
                                          <h6 className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Members</h6>
                                          {stMembers.length === 0 ? (
                                            <p className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No members assigned yet.</p>
                                          ) : (
                                            <div className="flex flex-wrap gap-2">
                                              {stMembers.map(u => (
                                                <span key={u.UserID} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}>
                                                  {u.FullName}
                                                  <button
                                                    type="button"
                                                    title={`Remove ${u.FullName} from sub-team`}
                                                    onClick={() => onRemoveUserFromSubTeam?.(u.Email, st.SubTeamID)}
                                                    className="opacity-60 hover:opacity-100 transition-opacity"
                                                  >
                                                    <X size={10} />
                                                  </button>
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {(() => {
                                            // Multi-membership: eligible if not already in THIS sub-team
                                            const eligible = teamUsers.filter(u => !u.SubTeamIDs?.includes(st.SubTeamID));
                                            if (eligible.length === 0) return null;
                                            return (
                                              <select
                                                defaultValue=""
                                                onChange={e => {
                                                  if (e.target.value) {
                                                    onAssignUserToSubTeam?.(e.target.value, st.SubTeamID, st.SubTeamName);
                                                  }
                                                  e.target.value = '';
                                                }}
                                                className={`mt-2 w-full text-xs rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}
                                              >
                                                <option value="" disabled>+ Assign team member…</option>
                                                {eligible.map(u => (
                                                  <option key={u.UserID} value={u.Email}>{u.FullName}</option>
                                                ))}
                                              </select>
                                            );
                                          })()}
                                        </div>

                                        {/* Leaders of this sub-team */}
                                        <div>
                                          <h6 className={`text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Sub-team leaders</h6>
                                          {stLeaders.length === 0 ? (
                                            <p className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No leaders assigned.</p>
                                          ) : (
                                            <div className="flex flex-wrap gap-2 mb-2">
                                              {stLeaders.map(email => {
                                                const u = users.find(x => x.Email.toLowerCase() === email.toLowerCase());
                                                return (
                                                  <span key={email} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                                                    {u?.FullName ?? email}
                                                    <button
                                                      type="button"
                                                      title="Remove as sub-team leader"
                                                      onClick={() => {
                                                        const updated = stLeaders.filter(e => e.toLowerCase() !== email.toLowerCase());
                                                        onUpdateSubTeamLeaders?.(team.TeamID, st.SubTeamID, updated);
                                                      }}
                                                      className="opacity-60 hover:opacity-100 transition-opacity"
                                                    >
                                                      <X size={10} />
                                                    </button>
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          )}
                                          {(() => {
                                            const eligible = stMembers.filter(u => !stLeaders.some(e => e.toLowerCase() === u.Email.toLowerCase()));
                                            if (eligible.length === 0) return null;
                                            return (
                                              <select
                                                defaultValue=""
                                                onChange={e => {
                                                  if (!e.target.value) return;
                                                  const updated = [...new Set([...stLeaders, e.target.value.toLowerCase()])];
                                                  onUpdateSubTeamLeaders?.(team.TeamID, st.SubTeamID, updated);
                                                  e.target.value = '';
                                                }}
                                                className={`w-full text-xs rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}
                                              >
                                                <option value="" disabled>+ Assign sub-team leader…</option>
                                                {eligible.map(u => (
                                                  <option key={u.UserID} value={u.Email}>{u.FullName}</option>
                                                ))}
                                              </select>
                                            );
                                          })()}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Create sub-team form */}
                          {subTeamError && (
                            <div className={`mb-3 p-3 text-xs rounded-lg ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>{subTeamError}</div>
                          )}
                          <div className={`border rounded-xl p-4 space-y-3 ${isDarkMode ? 'border-[#334155] bg-[#0F172A]' : 'border-slate-200 bg-slate-50'}`}>
                            <h5 className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Create sub-team</h5>
                            <input
                              type="text"
                              value={newSubTeamName}
                              onChange={e => setNewSubTeamName(e.target.value)}
                              placeholder="e.g. Sub-team name…"
                              className={`w-full text-xs rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'}`}
                            />
                            <input
                              type="text"
                              value={newSubTeamDesc}
                              onChange={e => setNewSubTeamDesc(e.target.value)}
                              placeholder="e.g. Description (optional)…"
                              className={`w-full text-xs rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'}`}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                setSubTeamError(null);
                                const name = newSubTeamName.trim();
                                if (!name) { setSubTeamError('Sub-team name is required.'); return; }
                                if (subTeams.some(st => st.TeamID === team.TeamID && st.SubTeamName.toLowerCase() === name.toLowerCase() && st.Active)) {
                                  setSubTeamError('A sub-team with that name already exists in this team.');
                                  return;
                                }
                                const now = new Date().toISOString();
                                const subTeamId = `ST-${team.TeamID}-${Date.now()}`;
                                await onSaveSubTeam?.({
                                  id: subTeamId, // Firestore document ID
                                  SubTeamID: subTeamId,
                                  TeamID: team.TeamID,
                                  SubTeamName: name,
                                  Description: newSubTeamDesc.trim() || undefined,
                                  Active: true,
                                  CreatedAt: now,
                                  UpdatedAt: now,
                                  SubTeamLeaderEmails: [],
                                });
                                setNewSubTeamName('');
                                setNewSubTeamDesc('');
                              }}
                              className={`w-full py-2 text-xs font-semibold rounded-lg border-none transition-colors ${newSubTeamName.trim() ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
                              disabled={!newSubTeamName.trim()}
                            >
                              <Plus size={12} className="inline mr-1" />
                              Create sub-team
                            </button>
                          </div>
                        </section>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* SUBTAB: Report Configuration */}
        {activeAdminSubTab === 'report_config' && (
          <div className="space-y-6">
            <div className={`border rounded-xl p-5 md:p-6 shadow-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
              <h3 className={`font-semibold text-base mb-1 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Team report configuration</h3>
              <p className={`text-sm mb-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Configure reminder and meeting days for each team's weekly report schedule.
              </p>

              <div className="space-y-3">
                {teams.map(team => {
                  const teamReq = reportRequirements[team.TeamID];
                  const isSubteamReporting = teamReq?.level === 'subteam';
                  const teamSubTeams = subTeams.filter(st => st.TeamID === team.TeamID && st.Active);

                  // Show sub-teams if configured for sub-team reporting OR if they have existing configs
                  const subTeamsWithConfigs = teamSubTeams.filter(st => teamReportConfigs[st.id]);
                  const shouldShowSubTeams = (isSubteamReporting && teamReq?.subTeamIds && teamReq.subTeamIds.length > 0) || subTeamsWithConfigs.length > 0;

                  const configCard = (opts: { key: string; title: string; subtitle: string }) => {
                    const configKey = opts.key;
                    const isEditing = editingReportConfigTeamId === configKey;
                    return (
                      <div key={configKey} className={`border rounded-xl p-4 ${isDarkMode ? 'bg-[#0F172A] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="min-w-0">
                            <div className={`font-semibold truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{opts.title}</div>
                            <div className={`text-xs font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{opts.subtitle}</div>
                          </div>
                          {isEditing ? (
                            <button
                              onClick={() => handleSaveTeamReportConfig(configKey, editingReminderDay, editingMeetingDay)}
                              className={`text-xs px-3 py-1.5 rounded-md font-semibold ${isDarkMode ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                            >
                              Save
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingReportConfigTeamId(configKey);
                                const config = teamReportConfigs[configKey];
                                setEditingReminderDay(config?.reminderDay || '');
                                setEditingMeetingDay(config?.meetingDay || '');
                              }}
                              className={`text-xs px-3 py-1.5 rounded-md font-semibold ${isDarkMode ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}
                            >
                              Edit
                            </button>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Reminder day</label>
                              <select
                                value={editingReminderDay}
                                onChange={(e) => setEditingReminderDay(e.target.value)}
                                className={`w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                              >
                                <option value="">Not configured</option>
                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                                  <option key={day} value={day}>{day}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Meeting day</label>
                              <select
                                value={editingMeetingDay}
                                onChange={(e) => setEditingMeetingDay(e.target.value)}
                                className={`w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                              >
                                <option value="">Not configured</option>
                                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                                  <option key={day} value={day}>{day}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-8">
                            <div>
                              <span className={`text-xs font-semibold block mb-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Reminder day</span>
                              <span className={`text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                {teamReportConfigs[configKey]?.reminderDay || <span className={`italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Not configured</span>}
                              </span>
                            </div>
                            <div>
                              <span className={`text-xs font-semibold block mb-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Meeting day</span>
                              <span className={`text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                {teamReportConfigs[configKey]?.meetingDay || <span className={`italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Not configured</span>}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  };

                  if (shouldShowSubTeams) {
                    // Show individual sub-teams instead of parent team
                    const subTeamsToShow = isSubteamReporting && teamReq?.subTeamIds
                      ? teamReq.subTeamIds.map(subTeamId => subTeams.find(st => st.SubTeamID === subTeamId && st.Active)).filter(Boolean)
                      : subTeamsWithConfigs;

                    return subTeamsToShow.map(subTeam => {
                      if (!subTeam) return null;
                      // Use sub-team document ID as config key (matches Firestore);
                      // fallback to SubTeamID if id is missing (for cached data)
                      const configKey = subTeam.id || subTeam.SubTeamID;
                      return configCard({
                        key: configKey,
                        title: subTeam.SubTeamName,
                        subtitle: `${team.TeamName} · ${subTeam.SubTeamID}`,
                      });
                    });
                  }

                  // Show parent team (team-level reporting or no config)
                  return configCard({
                    key: team.TeamID,
                    title: team.TeamName,
                    subtitle: team.TeamID,
                  });
                })}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 4: Recurrence Blueprints Scheduler */}
        {activeAdminSubTab === 'templates' && (
          <div className="space-y-6">

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-start">

              {/* Add Recurrence Blueprint Form */}
              <div className={`border rounded-xl p-5 space-y-4 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                <div className={`flex items-center gap-2 border-b pb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                  <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <Plus size={16} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>New recurring task template</h4>
                </div>

                {templateSuccessMessage && (
                  <div className={`p-3 text-xs rounded-lg font-medium flex items-center gap-1.5 border ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                    <CheckCircle size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{templateSuccessMessage}</span>
                  </div>
                )}

                {templateErrorMessage && (
                  <div className={`p-3 text-xs rounded-lg font-medium flex items-center gap-1.5 border ${isDarkMode ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-red-700 bg-red-50 border-red-200'}`}>
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{templateErrorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTemplateCreateSubmit} className="space-y-3">
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Title</label>
                    <input
                      type="text"
                      required
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      placeholder="e.g. Fortnightly SOC2 Assets Audit"
                      className={`w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Description</label>
                    <textarea
                      required
                      value={tempDesc}
                      onChange={(e) => setTempDesc(e.target.value)}
                      placeholder="e.g. Identify active cluster nodes, map pending anomalies, and verify signature certificates…"
                      rows={3}
                      className={`w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Recurrence</label>
                      <div className="relative">
                        <select
                          value={tempRecurrence}
                          onChange={(e) => setTempRecurrence(e.target.value as any)}
                          className={`w-full text-sm rounded-lg pl-3 pr-7 py-2 border appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                        >
                          <option value="Daily">Daily</option>
                          <option value="Weekly">Weekly</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Quarterly">Quarterly</option>
                          <option value="Half-yearly">Half-yearly</option>
                        </select>
                        <ChevronDown size={14} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Priority</label>
                      <div className="relative">
                        <select
                          value={tempPriority}
                          onChange={(e) => setTempPriority(e.target.value as any)}
                          className={`w-full text-sm rounded-lg pl-3 pr-7 py-2 border appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Critical">Critical</option>
                        </select>
                        <ChevronDown size={14} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Start date</label>
                    <input
                      type="date"
                      required
                      value={tempStartDate}
                      onChange={(e) => setTempStartDate(e.target.value)}
                      className={`w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Assign to</label>
                    <div className="relative">
                      <select
                        required
                        value={tempAssignToEmail}
                        onChange={(e) => setTempAssignToEmail(e.target.value)}
                        className={`w-full text-sm rounded-lg pl-3 pr-7 py-2 border appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                      >
                        <option value="">Select recipient email…</option>
                        {users.map(u => (
                          <option key={u.Email} value={u.Email}>{u.FullName} ({u.Email})</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-sm font-semibold transition-colors shadow-sm cursor-pointer border-none flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} />
                    <span>Create template</span>
                  </button>
                </form>
              </div>

              {/* Templates directory */}
              <div className="lg:col-span-2 space-y-4 min-w-0">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} size={14} />
                    <input
                      type="text"
                      value={templateSearchText}
                      onChange={(e) => setTemplateSearchText(e.target.value)}
                      placeholder="Search by title or recipient…"
                      className={`w-full text-sm rounded-lg pl-9 pr-3 py-2 border focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>
                  <span className={`text-xs font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {filteredTemplates.length} of {templates.length} templates
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredTemplates.map(template => {
                    const isActive = template.Active;
                    return (
                      <div
                        key={template.TemplateID}
                        className={`border rounded-xl p-4 flex flex-col justify-between gap-3 shadow-sm transition-shadow hover:shadow-md ${!isActive
                          ? isDarkMode ? 'border-red-500/20 bg-red-500/5' : 'border-red-200 bg-red-50/40'
                          : isDarkMode ? 'border-[#334155] bg-[#1E293B]' : 'border-slate-200 bg-white'
                          }`}
                      >
                        <div className="space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <h5 className={`font-semibold text-sm truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{template.Title}</h5>
                              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{template.RecurrenceType}</p>
                            </div>
                            <span className={`text-[10px] font-mono shrink-0 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{template.TemplateID}</span>
                          </div>

                          <div className="flex gap-1.5">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${template.Priority === 'Critical' ? (isDarkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200') :
                              template.Priority === 'High' ? (isDarkMode ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-orange-50 text-orange-700 border-orange-200') :
                                template.Priority === 'Medium' ? (isDarkMode ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-yellow-50 text-yellow-700 border-yellow-200') :
                                  (isDarkMode ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 'bg-slate-50 text-slate-700 border-slate-200')
                              }`}>
                              {template.Priority} priority
                            </span>
                          </div>

                          <div className={`pt-2 border-t flex justify-between items-center text-xs gap-2 ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                            <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Assigned to</span>
                            <span className={`font-medium truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{template.AssignedToEmail}</span>
                          </div>

                          <div className="flex justify-between items-center text-xs">
                            <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Next run</span>
                            <span className={`font-mono font-medium ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{template.NextGenerationDate}</span>
                          </div>
                        </div>

                        <div className={`flex items-center justify-between gap-3 pt-3 border-t ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                          <span className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Created {new Date(template.CreatedAt).toLocaleDateString()}</span>
                          <button
                            onClick={() => onToggleTemplateStatus(template.TemplateID)}
                            className={`text-[10px] font-bold tracking-wider py-1.5 px-3 rounded-md border transition-colors cursor-pointer text-center ${template.Active
                              ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                              : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'
                              }`}
                          >
                            {template.Active ? '● Running' : '■ Paused'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {templates.length === 0 && (
                    <div className="col-span-2 text-center py-14">
                      <Repeat size={40} className={`mx-auto mb-3 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>No recurrence templates yet</p>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Define a template using the form on the left to get started.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: Email templates (Sheets <-> App sync) */}
        {activeAdminSubTab === 'email_templates' && (
          <EmailTemplatesTab
            emailTemplates={emailTemplates}
            onRefreshEmailTemplates={onRefreshEmailTemplates}
            isDarkMode={isDarkMode}
          />
        )}

        {/* SUBTAB 5: Weekly Report Requirements Configuration */}
        {activeAdminSubTab === 'report_requirements' && (
          <div className="space-y-6">
            <div className={`border rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
              <div>
                <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-blue-400' : 'text-blue-900'}`}>Weekly report requirements</h4>
                <p className={`text-xs mt-1 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Configure which teams and sub-teams are required to submit weekly reports. Team leaders can submit for the whole team or sub-teams. Sub-team leaders can only submit for their own sub-team.
                </p>
              </div>
              <button
                onClick={handleSaveReportRequirements}
                className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white border-none shrink-0"
              >
                <Save size={14} />
                <span>Save configuration</span>
              </button>
            </div>

            {reportRequirementsSaveSuccess && (
              <div className={`flex items-center gap-2 text-xs font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                <CheckCircle size={14} />
                <span>Configuration saved successfully!</span>
              </div>
            )}

            <div className="space-y-3">
              {teams.map(team => {
                const teamRequirement = reportRequirements[team.TeamID];
                const teamSubTeams = subTeams.filter(st => st.TeamID === team.TeamID && st.Active);

                return (
                  <div key={team.TeamID} className={`border rounded-xl p-4 shadow-sm ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-3 gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${team.Active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <h5 className={`font-semibold text-sm truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{team.TeamName}</h5>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded shrink-0 ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
                          {team.TeamID}
                        </span>
                      </div>
                      <select
                        value={teamRequirement?.level || 'team'}
                        onChange={(e) => handleReportRequirementChange(team.TeamID, e.target.value as 'team' | 'subteam')}
                        className={`text-xs px-3 py-1.5 rounded-lg border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shrink-0 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                      >
                        <option value="team">Whole team reports</option>
                        <option value="subteam">Sub-team reports</option>
                      </select>
                    </div>

                    {teamRequirement?.level === 'subteam' && teamSubTeams.length > 0 && (
                      <div className="space-y-2">
                        <label className={`text-xs font-semibold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Select sub-teams that must submit reports:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {teamSubTeams.map(subTeam => (
                            <label
                              key={subTeam.SubTeamID}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border ${teamRequirement.subTeamIds.includes(subTeam.SubTeamID)
                                ? isDarkMode ? 'bg-blue-500/20 border-blue-500/30' : 'bg-blue-50 border-blue-200'
                                : isDarkMode ? 'bg-[#0F172A] border-[#334155]' : 'bg-slate-50 border-slate-200'
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={teamRequirement.subTeamIds.includes(subTeam.SubTeamID)}
                                onChange={() => handleSubTeamToggle(team.TeamID, subTeam.SubTeamID)}
                                className="w-4 h-4 rounded cursor-pointer accent-blue-600"
                              />
                              <span className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                                {subTeam.SubTeamName}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {teamRequirement?.level === 'subteam' && teamSubTeams.length === 0 && (
                      <p className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        No active sub-teams configured for this team.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={`p-4 rounded-xl border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start gap-3">
                <Info size={16} className={`mt-0.5 shrink-0 ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`} />
                <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <p className="font-semibold mb-1">How this works:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Whole team reports:</strong> Team leaders receive reminders and can submit reports for the entire team.</li>
                    <li><strong>Sub-team reports:</strong> Only selected sub-team leaders receive reminders and can submit reports for their specific sub-team.</li>
                    <li><strong>Sub-team leader permissions:</strong> Can only submit reports for their own sub-team.</li>
                    <li><strong>Team leader permissions:</strong> Can submit reports for the whole team or any sub-team within their team.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 6: Missing Reports This Week */}
        {activeAdminSubTab === 'missing_reports' && (
          <div className="space-y-6">
            <div className={`border rounded-xl p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isDarkMode ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'}`}>
              <div>
                <h4 className={`font-semibold text-sm ${isDarkMode ? 'text-red-400' : 'text-red-900'}`}>Missing reports this week</h4>
                <p className={`text-xs mt-1 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Teams that have not submitted their weekly PPT report this week, or where proof emails failed to send.
                </p>
              </div>
              <button
                onClick={loadUnsubmittedTeams}
                disabled={isLoadingUnsubmitted || isLoadingFailures || isLoadingJobRuns || isLoadingReauth}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-none shrink-0 ${(isLoadingUnsubmitted || isLoadingFailures || isLoadingJobRuns || isLoadingReauth) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <RefreshCw size={14} className={(isLoadingUnsubmitted || isLoadingFailures || isLoadingJobRuns || isLoadingReauth) ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>
            </div>

            {(isLoadingUnsubmitted || isLoadingFailures || isLoadingJobRuns || isLoadingReauth) ? (
              <div className={`flex items-center justify-center py-12 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <RefreshCw size={20} className="animate-spin mr-3" />
                <span className="text-sm">Loading missing reports…</span>
              </div>
            ) : unsubmittedTeams.length === 0 && emailDeliveryFailures.length === 0 ? (
              <div className={`border rounded-xl p-8 text-center ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                <div className={`flex items-center justify-center gap-3 mb-3 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  <CheckCircle size={24} />
                  <h5 className={`font-semibold text-sm ${isDarkMode ? 'text-emerald-400' : 'text-emerald-800'}`}>All reports submitted</h5>
                </div>
                <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  All teams have submitted their weekly reports with confirmed proof emails. Great job!
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Gmail Re-auth Required Section */}
                {gmailReauthRequired.length > 0 && (
                  <div className="space-y-3">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                      {gmailReauthRequired.length} Gmail account{gmailReauthRequired.length === 1 ? '' : 's'} needs re-authentication
                    </div>
                    <div className="space-y-3">
                      {gmailReauthRequired.map((reauth, index) => (
                        <div
                          key={index}
                          className={`border rounded-xl p-4 shadow-sm ${isDarkMode ? 'bg-[#1E293B] border-orange-500/20' : 'bg-white border-orange-200'}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
                                <AlertCircle size={16} className={isDarkMode ? 'text-orange-400' : 'text-orange-600'} />
                              </div>
                              <div>
                                <div className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                                  {reauth.userEmail}
                                </div>
                                <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {new Date(reauth.timestamp).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className={`text-[10px] font-semibold px-2 py-1 rounded ${isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'}`}>
                              Needs re-auth
                            </div>
                          </div>
                          <div className={`text-xs mt-2 space-y-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            <div><strong>Reason:</strong> {reauth.reason}</div>
                            {reauth.error && <div><strong>Error:</strong> {reauth.error}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email Delivery Failures Section */}
                {emailDeliveryFailures.length > 0 && (
                  <div className="space-y-3">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                      {emailDeliveryFailures.length} email delivery failure{emailDeliveryFailures.length === 1 ? '' : 's'}
                    </div>
                    <div className="space-y-3">
                      {emailDeliveryFailures.map((failure, index) => {
                        const team = teams.find(t => t.TeamID === failure.teamId);
                        const teamName = team?.TeamName || failure.teamId;
                        return (
                          <div
                            key={index}
                            className={`border rounded-xl p-4 shadow-sm ${isDarkMode ? 'bg-[#1E293B] border-orange-500/20' : 'bg-white border-orange-200'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
                                  <AlertCircle size={16} className={isDarkMode ? 'text-orange-400' : 'text-orange-600'} />
                                </div>
                                <div>
                                  <div className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                                    {teamName}
                                  </div>
                                  <div className={`text-[10px] font-mono mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {failure.teamId}
                                  </div>
                                </div>
                              </div>
                              <div className={`text-[10px] font-semibold px-2 py-1 rounded ${isDarkMode ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'}`}>
                                Email failed
                              </div>
                            </div>
                            <div className={`text-xs mt-2 space-y-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                              <div><strong>Type:</strong> {failure.type === 'thursday_reminder' ? 'Thursday Reminder' : 'Proof Email'}</div>
                              <div><strong>To:</strong> {failure.intendedRecipient}</div>
                              <div><strong>Reason:</strong> {failure.reason}</div>
                              <div><strong>Time:</strong> {new Date(failure.timestamp).toLocaleString()}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Unsubmitted Teams Section */}
                {unsubmittedTeams.length > 0 && (
                  <div className="space-y-3">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
                      {unsubmittedTeams.length} team{unsubmittedTeams.length === 1 ? '' : 's'} not submitted
                    </div>
                    {unsubmittedTeams.map(team => (
                      <div
                        key={team.teamId}
                        className={`border rounded-xl p-4 flex items-center justify-between shadow-sm ${isDarkMode ? 'bg-[#1E293B] border-red-500/20' : 'bg-white border-red-200'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-red-500/20' : 'bg-red-100'}`}>
                            <AlertCircle size={16} className={isDarkMode ? 'text-red-400' : 'text-red-600'} />
                          </div>
                          <div>
                            <div className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                              {team.teamName}
                            </div>
                            <div className={`text-[10px] font-mono mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                              {team.teamId}
                            </div>
                          </div>
                        </div>
                        <div className={`text-[10px] font-semibold px-2 py-1 rounded ${isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'}`}>
                          Not submitted
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recent Job Runs Section */}
                {jobRuns.length > 0 && (
                  <div className="space-y-3">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
                      Recent scheduler runs
                    </div>
                    <div className="space-y-3">
                      {jobRuns.map((jobRun, index) => (
                        <div
                          key={index}
                          className={`border rounded-xl p-4 shadow-sm ${isDarkMode ? 'bg-[#1E293B] border-blue-500/20' : 'bg-white border-blue-200'}`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                                <History size={16} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                              </div>
                              <div>
                                <div className={`font-semibold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>
                                  {jobRun.jobName}
                                </div>
                                <div className={`text-[10px] mt-0.5 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {new Date(jobRun.timestamp).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-semibold px-2 py-1 rounded ${isDarkMode ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                                {jobRun.successCount} sent
                              </span>
                              {jobRun.failureCount > 0 && (
                                <span className={`text-[10px] font-semibold px-2 py-1 rounded ${isDarkMode ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700'}`}>
                                  {jobRun.failureCount} failed
                                </span>
                              )}
                              <span className={`text-[10px] px-2 py-1 rounded ${isDarkMode ? 'bg-slate-500/20 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                                {jobRun.triggeredBy}
                              </span>
                            </div>
                          </div>
                          {jobRun.teamsProcessed.length > 0 && (
                            <div className={`mt-3 pt-3 border-t ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                              <div className={`text-[10px] font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                                Teams processed ({jobRun.teamsProcessed.length})
                              </div>
                              <div className="space-y-1">
                                {jobRun.teamsProcessed.slice(0, 5).map((team, teamIndex) => (
                                  <div key={teamIndex} className="flex items-center justify-between text-[10px]">
                                    <span className={isDarkMode ? 'text-slate-400' : 'text-slate-600'}>
                                      {team.teamName}
                                    </span>
                                    <span className={`font-semibold ${
                                      team.status === 'sent' 
                                        ? isDarkMode ? 'text-emerald-400' : 'text-emerald-600'
                                        : team.status === 'failed'
                                          ? isDarkMode ? 'text-red-400' : 'text-red-600'
                                          : isDarkMode ? 'text-slate-500' : 'text-slate-500'
                                    }`}>
                                      {team.status}
                                    </span>
                                  </div>
                                ))}
                                {jobRun.teamsProcessed.length > 5 && (
                                  <div className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
                                    +{jobRun.teamsProcessed.length - 5} more teams
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}