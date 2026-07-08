import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User as UserType, TaskTemplate, AppSetting, Team, SubTeam, EmailTemplate } from '../types';
import { ROLE } from '../constants/status';
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
  Save
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import { dbService } from '../lib/dbService';

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
  onSaveSubTeam?: (subTeam: SubTeam) => Promise<void>;
  onDeleteSubTeam?: (subTeamId: string) => Promise<void>;
  onUpdateSubTeamLeaders?: (teamId: string, subTeamId: string, leaderEmails: string[]) => Promise<void>;
  onAssignUserToSubTeam?: (userEmail: string, subTeamId: string | null, subTeamName: string | null) => Promise<void>;
  onRemoveUserFromSubTeam?: (userEmail: string, subTeamId: string) => Promise<void>;
  onSendInviteEmail?: (email: string, fullName: string, role: string) => void;
  onSyncDatabase?: () => void;
  onRefreshUsers?: () => Promise<void>;
  isDarkMode?: boolean;
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
  onSaveSubTeam,
  onDeleteSubTeam,
  onUpdateSubTeamLeaders,
  onAssignUserToSubTeam,
  onRemoveUserFromSubTeam,
  onSendInviteEmail,
  onSyncDatabase,
  onRefreshUsers,
  subTeams = [],
  isDarkMode = false,
}: AdminPanelProps) {
  // Master administrative tabs
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'teams' | 'templates' | 'email_templates' | 'report_requirements'>('users');

  // Auto-sync when the users tab is activated so pending registrations
  // that arrived after initial page load are visible immediately.
  useEffect(() => {
    if (activeAdminSubTab === 'users' && onSyncDatabase) {
      onSyncDatabase();
    }
  }, [activeAdminSubTab]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Create User state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<typeof ROLE[keyof typeof ROLE]>(ROLE.STAKEHOLDER);
  const [managerEmail, setManagerEmail] = useState('');
  const [teamSelections, setTeamSelections] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [userSuccessMessage, setUserSuccessMessage] = useState<string | null>(null);

  // Bulk CSV Upload state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvErrors, setCsvErrors] = useState<any[]>([]);
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

  // Sub-team management state — tracks which team's sub-teams are being managed
  const [newSubTeamName, setNewSubTeamName] = useState('');
  const [newSubTeamDesc, setNewSubTeamDesc] = useState('');
  const [subTeamError, setSubTeamError] = useState<string | null>(null);
  const [expandedSubTeamId, setExpandedSubTeamId] = useState<string | null>(null);

  // Keep modal-local leader/stakeholder state in sync with the teams prop.
  // Without this, currentTeamLeaders is only loaded once when the modal opens
  // (in the "Manage" button onClick) and becomes stale if onUpdateSetting or
  // onUpdateSubTeamLeaders writes back through App.tsx while the modal is open.
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
        console.log('[handleAssignTeamLeader] Assigning leader:', userEmail, 'to team:', teamId);
        await onUpdateSetting(`team_${teamId}_leaders`, updatedLeaders.join(','));
        setCurrentTeamLeaders(updatedLeaders);
      }
    } catch (error) {
      console.error('[handleAssignTeamLeader] Error:', error);
      alert('Failed to assign team leader. Please try again.');
    }
  };

  const handleAssignMultipleTeamLeaders = async (teamId: string) => {
    try {
      const currentLeaders = currentTeamLeaders || [];
      const newLeaders = [...new Set([...currentLeaders, ...Array.from(selectedTeamLeaders)])];
      console.log('[handleAssignMultipleTeamLeaders] Assigning leaders to team:', teamId, 'current:', currentLeaders, 'new:', newLeaders);
      await onUpdateSetting(`team_${teamId}_leaders`, newLeaders.join(','));
      setCurrentTeamLeaders(newLeaders);
      setSelectedTeamLeaders(new Set());
      console.log('[handleAssignMultipleTeamLeaders] Successfully assigned leaders');
    } catch (error) {
      console.error('[handleAssignMultipleTeamLeaders] Error assigning leaders:', error);
      alert('Failed to assign team leaders. Please try again.');
    }
  };

  const handleRemoveTeamLeader = async (userEmail: string, teamId: string) => {
    try {
      const currentLeaders = currentTeamLeaders || [];
      const updatedLeaders = currentLeaders.filter(email => email !== userEmail);
      console.log('[handleRemoveTeamLeader] Removing leader:', userEmail, 'from team:', teamId);
      await onUpdateSetting(`team_${teamId}_leaders`, updatedLeaders.join(','));
      setCurrentTeamLeaders(updatedLeaders);
    } catch (error) {
      console.error('[handleRemoveTeamLeader] Error:', error);
      alert('Failed to remove team leader. Please try again.');
    }
  };

  const handleAssignTeamStakeholder = async (userEmail: string, teamId: string) => {
    try {
      const currentStakeholders = currentTeamStakeholders || [];
      if (!currentStakeholders.includes(userEmail)) {
        const updatedStakeholders = [...currentStakeholders, userEmail];
        console.log('[handleAssignTeamStakeholder] Assigning stakeholder:', userEmail, 'to team:', teamId);
        await onUpdateSetting(`team_${teamId}_stakeholders`, updatedStakeholders.join(','));
        setCurrentTeamStakeholders(updatedStakeholders);
      }
    } catch (error) {
      console.error('[handleAssignTeamStakeholder] Error:', error);
      alert('Failed to assign team stakeholder. Please try again.');
    }
  };

  const handleRemoveTeamStakeholder = async (userEmail: string, teamId: string) => {
    try {
      const currentStakeholders = currentTeamStakeholders || [];
      const updatedStakeholders = currentStakeholders.filter(email => email !== userEmail);
      console.log('[handleRemoveTeamStakeholder] Removing stakeholder:', userEmail, 'from team:', teamId);
      await onUpdateSetting(`team_${teamId}_stakeholders`, updatedStakeholders.join(','));
      setCurrentTeamStakeholders(updatedStakeholders);
    } catch (error) {
      console.error('[handleRemoveTeamStakeholder] Error:', error);
      alert('Failed to remove team stakeholder. Please try again.');
    }
  };

  const handleAssignMultipleTeamStakeholders = async (teamId: string) => {
    try {
      const currentStakeholders = currentTeamStakeholders || [];
      const newStakeholders = [...new Set([...currentStakeholders, ...Array.from(selectedTeamStakeholders)])];
      console.log('[handleAssignMultipleTeamStakeholders] Assigning stakeholders to team:', teamId, 'new:', newStakeholders);
      await onUpdateSetting(`team_${teamId}_stakeholders`, newStakeholders.join(','));
      setCurrentTeamStakeholders(newStakeholders);
      setSelectedTeamStakeholders(new Set());
    } catch (error) {
      console.error('[handleAssignMultipleTeamStakeholders] Error:', error);
      alert('Failed to assign team stakeholders. Please try again.');
    }
  };

  // Search filter inputs
  const [userSearchText, setUserSearchText] = useState('');
  const [templateSearchText, setTemplateSearchText] = useState('');

  // Define template state
  const [tempTitle, setTempTitle] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [tempPriority, setTempPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [tempRecurrence, setTempRecurrence] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly'>('Monthly');
  const [tempAssignToEmail, setTempAssignToEmail] = useState('');
  const [tempStartDate, setTempStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [templateSuccessMessage, setTemplateSuccessMessage] = useState<string | null>(null);
  const [templateErrorMessage, setTemplateErrorMessage] = useState<string | null>(null);

  // Email template editor state
  const [selectedEmailTemplateKey, setSelectedEmailTemplateKey] = useState<string>('template_assigned_email');
  const [tempEmailSubject, setTempEmailSubject] = useState('');
  const [tempEmailValue, setTempEmailValue] = useState('');
  const [emailSaveSuccess, setEmailSaveSuccess] = useState(false);
  const [selectedFont, setSelectedFont] = useState('sans-serif');
  const [showVariableDropdown, setShowVariableDropdown] = useState(false);
  const [showColorDropdown, setShowColorDropdown] = useState(false);

  // Weekly report requirements state
  const [reportRequirements, setReportRequirements] = useState<Record<string, { level: 'team' | 'subteam'; subTeamIds: string[] }>>({});
  const [reportRequirementsSaveSuccess, setReportRequirementsSaveSuccess] = useState(false);

  // Tiptap editor for rich text
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      FontFamily,
    ],
    content: tempEmailValue,
    onUpdate: ({ editor }) => {
      setTempEmailValue(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[300px] p-3 text-sm leading-relaxed',
      },
    },
  });

  // Update editor content when body changes from template selection
  useEffect(() => {
    if (editor && tempEmailValue !== editor.getHTML()) {
      editor.commands.setContent(tempEmailValue);
    }
  }, [tempEmailValue, editor]);

  // Track settings Apply flashes
  const [settingSaveFlash, setSettingSaveFlash] = useState<string | null>(null);
  const [settingErrorFlash, setSettingErrorFlash] = useState<string | null>(null);

  // Default template content for each type
  const getDefaultTemplateContent = (key: string): { subject: string; body: string } => {
    const defaults: Record<string, { subject: string; body: string }> = {
      'template_assigned_email': {
        subject: 'New task assigned: {Title}',
        body: 'Hello {AssignedToEmail},\n\nYou have been assigned a new task:\n\nTask ID: {TaskID}\nTitle: {Title}\nDescription: {Description}\nPriority: {Priority}\nDue Date: {DueDate}\n\nPlease review and start working on this task.\n\nBest regards,\nPMS Team'
      },
      'template_delayed_email': {
        subject: 'Task overdue: {Title}',
        body: 'URGENT: Task Overdue Alert\n\nHello {AssignedToEmail},\n\nThe following task is now overdue:\n\nTask ID: {TaskID}\nTitle: {Title}\nDue Date: {DueDate}\nPriority: {Priority}\n\nPlease address this immediately.\n\nBest regards,\nPMS Team'
      },
      'template_scheduled_reminder': {
        subject: 'Scheduled Document Reminder: Weekly Report for {TeamName}',
        body: 'Hello,\n\nThis is a reminder for team leaders of team "{TeamName}" to submit the weekly report (scheduled document) due tomorrow.\n\nPlease log in and submit the document:\n\nApp URL: <a href="{AppURL}" style="color: #3b82f6; text-decoration: underline;">{AppURL}</a>\n\nBest regards,\nPMS Team'
      },
      'report_submitted': {
        subject: 'Progress Report: {Title} [{TaskID}]',
        body: 'Hello,\n\nA progress report has been submitted for the following task:\n\nTask: {Title}\nTask ID: {TaskID}\nReported By: {assigned_by}\nReported By Email: {assigned_by}\n\nReport Content:\n{report_content}\n\nBest regards,\nPMS Team'
      },
      'task_closed': {
        subject: 'Task Closed: {Title} [{TaskID}]',
        body: 'Hello,\n\nThe following task has been marked as closed:\n\nTask: {Title}\nTask ID: {TaskID}\nClosed By: {AssignedByEmail}\nCompletion Date: {DueDate}\n\nClose Remarks:\n{ReportContent}\n\nBest regards,\nPMS Team'
      }
    };
    return defaults[key] || { subject: '', body: '' };
  };

  // Sync state whenever the selected email template type keys changes
  React.useEffect(() => {
    const template = emailTemplates.find(t => t.templateName === selectedEmailTemplateKey);
    const defaultContent = getDefaultTemplateContent(selectedEmailTemplateKey);
    setTempEmailSubject(template?.subject || defaultContent.subject);
    setTempEmailValue(template?.body || defaultContent.body);
  }, [selectedEmailTemplateKey, emailTemplates]);

  // Load weekly report requirements from settings
  React.useEffect(() => {
    const requirementsSetting = settings.find(s => s.Key === 'weekly_report_requirements');
    if (requirementsSetting && requirementsSetting.Value) {
      try {
        const parsed = JSON.parse(requirementsSetting.Value);
        setReportRequirements(parsed);
      } catch (e) {
        console.error('Failed to parse weekly_report_requirements:', e);
      }
    }
  }, [settings]);

  const handleUserCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) return;

    if (password.length < 6) {
      setUserSuccessMessage('Password must be at least 6 characters');
      setTimeout(() => setUserSuccessMessage(null), 3000);
      return;
    }

    const matchedTeams = teams.filter(t => teamSelections.includes(t.TeamID));
    const newId = `USR-${Math.floor(100 + Math.random() * 899)}`;

    onAddUser({
      UserID: newId,
      FullName: fullName.trim(),
      Email: email.trim().toLowerCase(),
      Role: role,
      ManagerEmail: role === 'Stakeholder' ? managerEmail.trim().toLowerCase() : '',
      TeamIDs: teamSelections,
      TeamNames: matchedTeams.map(t => t.TeamName),
      Active: true,
      CanCreateFollowUp: true,
      CanCloseTask: true,
      Password: password,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    });

    // Send invite email if the function is available
    if (onSendInviteEmail) {
      onSendInviteEmail(email.trim().toLowerCase(), fullName.trim(), role);
    }

    setUserSuccessMessage(`Identity ${newId} authorized successfully. Invite email sent.`);
    setTimeout(() => setUserSuccessMessage(null), 3000);

    setFullName('');
    setEmail('');
    setManagerEmail('');
    setTeamSelections([]);
    setPassword('');
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
  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const data = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = values[index] || '';
      });
      return obj;
    });
    
    return data;
  };

  const validateCSVRow = (row: any): { valid: boolean; error?: string } => {
    if (!row['Full Name'] || !row['Email']) {
      return { valid: false, error: 'Missing Full Name or Email' };
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(row['Email'])) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    // Check for duplicate email
    if (users.some(u => u.Email.toLowerCase() === row['Email'].toLowerCase())) {
      return { valid: false, error: 'Email already exists' };
    }
    
    return { valid: true };
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsedData = parseCSV(text);
      setCsvPreview(parsedData);
      setCsvErrors([]);
      setCsvUploadResult(null);
    };
    reader.readAsText(file);
  };

  const handleCSVUpload = async () => {
    if (!csvPreview.length) return;
    
    setIsProcessingCsv(true);
    
    try {
      const { bulkUploadUsers } = await import('../api/auth');
      
      const usersToUpload = csvPreview.map(row => ({
        FullName: row['Full Name'],
        Email: row['Email'],
        Role: row['Role'] || 'Stakeholder',
        ManagerEmail: row['Manager Email'] || '',
        TeamName: row['Team Name'] || '',
        Password: row['Password'] || 'temp123'
      }));
      
      const result = await bulkUploadUsers({ users: usersToUpload });
      
      if (result.success) {
        setCsvErrors(result.results.errors.map(err => ({
          'Full Name': err.email,
          'Email': err.email,
          error: err.error
        })));
        setCsvUploadResult({ 
          success: result.results.success, 
          failed: result.results.failed 
        });
        
        // Refresh the user list after successful upload
        await onRefreshUsers?.();
      }
    } catch (error: any) {
      console.error('CSV upload error:', error);
      setCsvErrors(csvPreview.map(row => ({
        ...row,
        error: error?.message || 'Upload failed'
      })));
      setCsvUploadResult({ success: 0, failed: csvPreview.length });
    } finally {
      setIsProcessingCsv(false);
      setCsvPreview([]);
      setCsvFile(null);
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
    
    const headers = ['Full Name', 'Email', 'Role', 'Manager Email', 'Password', 'Error'];
    const rows = csvErrors.map(err => 
      [err['Full Name'], err['Email'], err['Role'], err['Manager Email'], err['Password'], err.error].join(',')
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
    if (!tempTitle.trim() || !tempDesc.trim() || !tempAssignToEmail) {
      setTemplateErrorMessage("Please enter title, descriptions, and assign to an email address.");
      return;
    }

    const newId = `TMP-${Math.floor(500 + Math.random() * 499)}`;
    const matchedUser = users.find(u => u.Email === tempAssignToEmail);

    const newTemplate: TaskTemplate = {
      TemplateID: newId,
      Title: tempTitle.trim(),
      Description: tempDesc.trim(),
      Priority: tempPriority,
      RecurrenceType: tempRecurrence,
      StartDate: tempStartDate || new Date().toISOString().split('T')[0],
      NextGenerationDate: tempStartDate || new Date().toISOString().split('T')[0],
      LastGeneratedDate: null,
      AssignedByEmail: 'admin@PMS.com',
      AssignedToEmail: tempAssignToEmail,
      AssignedToRole: (matchedUser ? matchedUser.Role : 'Stakeholder') as any,
      TeamID: matchedUser && matchedUser.TeamIDs.length > 0 ? matchedUser.TeamIDs[0] : 'T-01',
      Active: true,
      CreatedAt: new Date().toISOString(),
      UpdatedAt: new Date().toISOString()
    };

    onAddTemplate(newTemplate);
    setTemplateErrorMessage(null);
    setTemplateSuccessMessage(`Recurrence Blueprint ${newId} synchronized successfully.`);
    setTimeout(() => setTemplateSuccessMessage(null), 3000);

    // Reset fields
    setTempTitle('');
    setTempDesc('');
  };


  const handleSaveEmailTemplateValue = async () => {
    try {
      const template = emailTemplates.find(t => t.templateName === selectedEmailTemplateKey);
      
      const serverTemplate = {
        templateName: selectedEmailTemplateKey,
        subject: tempEmailSubject,
        body: tempEmailValue,
        updatedAt: new Date().toISOString(),
      };
      
      await dbService.saveEmailTemplate(serverTemplate);
      
      setEmailSaveSuccess(true);
      setTimeout(() => setEmailSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Error saving email template:', err);
      alert('Failed to save template. Please try again.');
    }
  };

  const handleInsertToken = (token: string) => {
    if (editor) {
      editor.chain().focus().insertContent(token).run();
    }
  };

  const setFontFamily = (fontFamily: string) => {
    if (editor) {
      editor.chain().focus().setFontFamily(fontFamily).run();
    }
    setSelectedFont(fontFamily);
  };

  const setTextColor = (color: string) => {
    if (editor) {
      editor.chain().focus().setColor(color).run();
    }
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
      console.error('Error saving report requirements:', err);
      alert('Failed to save report requirements. Please try again.');
    }
  };

  // Mock template renderer for Live Preview
  const getSimulatedEmailPreviewStr = () => {
    const isReport = selectedEmailTemplateKey === 'report_submitted';
    const reporterEmail = "sales.lead@PMS.com";

    const body = tempEmailValue
      .replace(/{TaskID}/g, "TSK-0842-DEMO")
      .replace(/{task_id}/g, "TSK-0842-DEMO")
      .replace(/{Title}/g, "Prepare Staging Environment Backups")
      .replace(/{task_name}/g, "Prepare Staging Environment Backups")
      .replace(/{Description}/g, "Complete backup of staging environment before production deployment")
      .replace(/{Priority}/g, "Critical")
      .replace(/{priority}/g, "Critical")
      .replace(/{DueDate}/g, "2026-06-25")
      .replace(/{due_date}/g, "2026-06-25")
      .replace(/{AssignedToEmail}/g, "sales.lead@PMS.com")
      .replace(/{assigned_to}/g, "sales.lead@PMS.com")
      .replace(/{AssignedByEmail}/g, isReport ? reporterEmail : "admin@PMS.com")
      .replace(/{assigned_by}/g, reporterEmail)
      .replace(/{ReportContent}/g, "Staging database backup successfully stored in GCP bucket pms-backups-staging-2026-06-25.")
      .replace(/{report_content}/g, "Staging database backup successfully stored in GCP bucket pms-backups-staging-2026-06-25.")
      .replace(/{AssignedToName}/g, "John Smith")
      .replace(/{AssignedByName}/g, "Admin User")
      .replace(/{close_remark}/g, "All staging verification tests passed, backups verified.")
      .replace(/{closed_by}/g, "admin@PMS.com")
      .replace(/{completion_date}/g, "2026-06-25")
      .replace(/{TeamName}/g, "Engineering Team")
      .replace(/{AppURL}/g, "http://localhost:3000");

    const subject = tempEmailSubject
      .replace(/{Title}/g, "Prepare Staging Environment Backups")
      .replace(/{TaskID}/g, "TSK-0842-DEMO")
      .replace(/{TeamName}/g, "Engineering Team");

    return { subject, body };
  };

  const getAvailableTokens = () => {
    const baseTokens = [
      { token: "{TaskID}", desc: "Task Identifier Code" },
      { token: "{Title}", desc: "Checklist Title" },
      { token: "{Description}", desc: "Task Description" },
      { token: "{Priority}", desc: "Importance Rank" },
      { token: "{DueDate}", desc: "Target Due Date" },
    ];
    
    if (selectedEmailTemplateKey === 'report_submitted') {
      return [
        ...baseTokens,
        { token: "{assigned_by}", desc: "Reporter Email" },
        { token: "{report_content}", desc: "Progress Report Content" },
      ];
    }
    
    if (selectedEmailTemplateKey === 'task_closed') {
      return [
        ...baseTokens,
        { token: "{closed_by}", desc: "Closed By User Email" },
        { token: "{close_remark}", desc: "Closure Remarks" },
        { token: "{completion_date}", desc: "Date Task Was Closed" },
      ];
    }
    
    if (selectedEmailTemplateKey === 'template_scheduled_reminder') {
      return [
        { token: "{TeamName}", desc: "Team Name" },
        { token: "{AppURL}", desc: "Application URL" },
      ];
    }
    
    return [
      ...baseTokens,
      { token: "{AssignedToEmail}", desc: "Receiver Mail" },
      { token: "{AssignedByEmail}", desc: "Sender Mail" },
      { token: "{AssignedToName}", desc: "Receiver Name" },
      { token: "{AssignedByName}", desc: "Sender Name" }
    ];
  };

  const getRoleBadgeColor = (role: string, isDarkMode: boolean) => {
    switch (role) {
      case 'Admin': return isDarkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200';
      case 'Stakeholder': return isDarkMode ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Sub-stakeholder': return isDarkMode ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200';
      default: return isDarkMode ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 'bg-slate-50 text-slate-700';
    }
  };

  return (
    <div className={`rounded-xl border overflow-hidden font-sans ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
      
      {/* Tab Navigation - scrollable on mobile */}
      <div className={`px-4 md:px-6 py-4 border-b border-[#E5E7EB] ${isDarkMode ? 'border-[#1E293B]' : ''}`}>
        <div className={`flex rounded-lg p-1 gap-1 overflow-x-auto w-full sm:w-auto ${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-100'}`}>
          <button
            onClick={() => setActiveAdminSubTab('users')}
            className={`flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none cursor-pointer whitespace-nowrap ${
              activeAdminSubTab === 'users'
                ? 'bg-blue-500 text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-white hover:bg-[#334155]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Users size={14} />
            <span className="hidden sm:inline">Users</span>
          </button>
          <button
            onClick={() => setActiveAdminSubTab('teams')}
            className={`flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none cursor-pointer whitespace-nowrap ${
              activeAdminSubTab === 'teams'
                ? 'bg-blue-500 text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-white hover:bg-[#334155]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Users size={14} />
            <span className="hidden sm:inline">Teams</span>
          </button>
          <button
            onClick={() => setActiveAdminSubTab('templates')}
            className={`flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none cursor-pointer whitespace-nowrap ${
              activeAdminSubTab === 'templates'
                ? 'bg-blue-500 text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-white hover:bg-[#334155]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Repeat size={14} />
            <span className="hidden sm:inline">Templates</span>
          </button>
          <button
            onClick={() => setActiveAdminSubTab('email_templates')}
            className={`flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none cursor-pointer whitespace-nowrap ${
              activeAdminSubTab === 'email_templates'
                ? 'bg-blue-500 text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-white hover:bg-[#334155]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Mail size={14} />
            <span className="hidden sm:inline">Email</span>
          </button>
          <button
            onClick={() => setActiveAdminSubTab('report_requirements')}
            className={`flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none cursor-pointer whitespace-nowrap ${
              activeAdminSubTab === 'report_requirements'
                ? 'bg-blue-500 text-white'
                : isDarkMode
                ? 'text-slate-400 hover:text-white hover:bg-[#334155]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <FileText size={14} />
            <span className="hidden sm:inline">Reports</span>
          </button>
        </div>
      </div>

      <div className={`p-4 md:p-6 ${isDarkMode ? 'bg-[#0F141F]' : 'bg-slate-50'}`}>
        
        {/* SUBTAB 1: Users Mapping Directory */}
        {activeAdminSubTab === 'users' && (
          <div className="space-y-8">
            
            {/* Pending approvals row if any */}
            {(() => {
              const pendingApprovals = users.filter(u => u.ApprovalStatus === 'pending' && !u.Active);
              if (pendingApprovals.length === 0) return null;
              return (
                <div className={`border rounded-xl p-6 space-y-4 ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'}`}>
                  <div className={`flex items-center space-x-3 ${isDarkMode ? 'text-amber-400' : 'text-amber-800'}`}>
                    <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
                      <Shield size={18} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
                    </div>
                    <h4 className="font-bold text-sm">
                      Pending approvals ({pendingApprovals.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {pendingApprovals.map(req => (
                      <div key={req.UserID} className={`border rounded-xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-all ${isDarkMode ? 'bg-[#1E293B] border-amber-500/20' : 'bg-white border-[#E5E7EB]'}`}>
                        <div>
                          <div className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{req.FullName}</div>
                          <div className={`text-xs font-mono mt-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{req.Email}</div>
                          <div className={`text-xs mt-2 p-2 rounded-lg inline-block ${isDarkMode ? 'bg-[#334155] text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
                            Role: <strong className={isDarkMode ? 'text-white' : 'text-slate-800'}>{req.Role}</strong> • Manager: {req.ManagerEmail || "Direct Admin"}
                          </div>
                        </div>
                        <button
                          onClick={() => onApproveUser(req.Email)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md cursor-pointer border-none flex items-center space-x-2"
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
            <div className={`rounded-xl border overflow-hidden ${isDarkMode ? 'bg-gradient-to-br from-blue-500/5 via-[#1E293B] to-purple-500/5 border-blue-500/20' : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50 border-blue-200/60'}`}>
              <button
                type="button"
                onClick={() => setShowRegistrationGuide(!showRegistrationGuide)}
                className={`w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left transition-colors ${isDarkMode ? 'hover:bg-white/5' : 'hover:bg-white/60'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`p-2 rounded-xl shrink-0 ${isDarkMode ? 'bg-blue-500/15 ring-1 ring-blue-500/25' : 'bg-blue-100 ring-1 ring-blue-200'}`}>
                    <Info size={16} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <div className="min-w-0">
                    <h4 className={`font-semibold text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
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
                <div className={`px-4 sm:px-5 pb-4 sm:pb-5 pt-0 border-t ${isDarkMode ? 'border-blue-500/10' : 'border-blue-100'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mt-4">
                    <div className={`relative rounded-xl p-4 border ${isDarkMode ? 'bg-[#0F141F]/80 border-[#334155]' : 'bg-white/80 border-slate-200 shadow-sm'}`}>
                      <div className={`absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                        OPTION 1
                      </div>
                      <div className="flex items-start gap-3 mt-2">
                        <div className={`p-2 rounded-lg shrink-0 ${isDarkMode ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                          <Plus size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                        </div>
                        <div>
                          <p className={`font-semibold text-xs sm:text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Create manually</p>
                          <p className={`text-[11px] sm:text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Fill in the form below with name, email, role, teams, and password. The user can sign in immediately.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`relative rounded-xl p-4 border ${isDarkMode ? 'bg-[#0F141F]/80 border-[#334155]' : 'bg-white/80 border-slate-200 shadow-sm'}`}>
                      <div className={`absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${isDarkMode ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'}`}>
                        OPTION 2
                      </div>
                      <div className="flex items-start gap-3 mt-2">
                        <div className={`p-2 rounded-lg shrink-0 ${isDarkMode ? 'bg-purple-500/10' : 'bg-purple-50'}`}>
                          <FileSpreadsheet size={14} className={isDarkMode ? 'text-purple-400' : 'text-purple-600'} />
                        </div>
                        <div>
                          <p className={`font-semibold text-xs sm:text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Bulk CSV import</p>
                          <p className={`text-[11px] sm:text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Download the template, add rows (Full Name, Email, Role, Manager Email, Password), then upload the CSV.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className={`relative rounded-xl p-4 border ${isDarkMode ? 'bg-[#0F141F]/80 border-[#334155]' : 'bg-white/80 border-slate-200 shadow-sm'}`}>
                      <div className={`absolute -top-2.5 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide ${isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                        OPTION 3
                      </div>
                      <div className="flex items-start gap-3 mt-2">
                        <div className={`p-2 rounded-lg shrink-0 ${isDarkMode ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                          <UserPlus size={14} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
                        </div>
                        <div>
                          <p className={`font-semibold text-xs sm:text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Self-service request</p>
                          <p className={`text-[11px] sm:text-xs mt-1 leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Users click <span className="font-medium">Request Account</span> on the login page. Approve pending requests in the banner above.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
              
              {/* Modern Provisioning Form */}
              <div className={`border rounded-xl p-5 space-y-4 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                <div className={`flex items-center space-x-3 border-b pb-3 ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                  <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-100'}`}>
                    <Plus size={18} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <h4 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add new user</h4>
                </div>

                {/* Bulk CSV Upload Section */}
                <div className={`p-3 rounded-xl border space-y-2 ${isDarkMode ? 'bg-[#334155]/50 border-[#475569]' : 'bg-slate-50/80 border-slate-200'}`}>
                  <div className={`flex items-center justify-between gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet size={14} className={isDarkMode ? 'text-purple-400' : 'text-purple-600'} />
                      <span className="text-xs font-bold">Bulk CSV Upload</span>
                    </div>
                    <button
                      type="button"
                      onClick={downloadCSVTemplate}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg transition-colors shrink-0 ${isDarkMode ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                    >
                      Download Template
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
                      onChange={handleCSVFileChange}
                      className="hidden"
                    />
                  </label>
                  {csvPreview.length > 0 && (
                    <div className="space-y-2">
                      <div className={`text-xs font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Preview ({csvPreview.length} rows):
                      </div>
                      <div className={`max-h-24 overflow-y-auto text-xs p-2 rounded border ${isDarkMode ? 'bg-[#0F141F] border-[#475569]' : 'bg-white border-slate-200'}`}>
                        {csvPreview.slice(0, 5).map((row, i) => (
                          <div key={i} className={`py-0.5 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {row['Full Name']} ({row['Email']})
                          </div>
                        ))}
                        {csvPreview.length > 5 && (
                          <div className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            ...and {csvPreview.length - 5} more
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleCSVUpload}
                        disabled={isProcessingCsv}
                        className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold text-xs py-1.5 rounded-lg transition-colors`}
                      >
                        {isProcessingCsv ? 'Processing...' : 'Import Users'}
                      </button>
                    </div>
                  )}
                  {csvUploadResult && (
                    <div className={`p-2 rounded-lg text-xs ${csvUploadResult.failed === 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                      {csvUploadResult.success} imported, {csvUploadResult.failed} failed
                      {csvUploadResult.failed > 0 && (
                        <button
                          type="button"
                          onClick={downloadErrorsCSV}
                          className="ml-2 underline font-bold"
                        >
                          Download Errors
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                {userSuccessMessage && (
                  <div className={`p-3 text-sm rounded-xl font-semibold flex items-center gap-2 ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                    <CheckCircle size={16} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{userSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleUserCreateSubmit} className="space-y-3">
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Full name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rachel Zane"
                      className={`w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Email address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. rachel@PMS.com"
                      className={`w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Role</label>
                      <div className="relative">
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as any)}
                        className={`w-full text-sm rounded-xl pl-3 pr-8 py-2.5 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                      >
                        <option value="Admin">Admin</option>
                        <option value="Stakeholder">Stakeholder</option>
                      </select>
                      <ChevronDown size={14} className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manager email</label>
                      <input
                        type="email"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        placeholder="e.g. sales.lead@PMS.com"
                        className={`w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-500'}`}
                      />
                    </div>
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
                        className={`w-full text-sm rounded-xl px-3 py-2.5 border appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer text-left flex items-center justify-between ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                      >
                        <span>{teamSelections.length === 0 ? 'Select teams' : `${teamSelections.length} selected`}</span>
                        <ChevronDown size={14} className={isDarkMode ? 'text-slate-400' : 'text-slate-400'} />
                      </button>
                      <div
                        id="teams-dropdown"
                        className={`absolute z-10 w-full mt-1 border rounded-xl shadow-lg max-h-48 overflow-y-auto hidden ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}
                      >
                        {teams.length > 0 ? (
                          teams.map(t => (
                            <label key={t.TeamID} className="flex items-center space-x-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-[#334155] cursor-pointer">
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
                                className={`w-4 h-4 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-[#475569] bg-[#334155]' : 'border-slate-300'}`}
                              />
                              <span className={`text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{t.TeamName}</span>
                            </label>
                          ))
                        ) : (
                          <p className={`text-sm italic p-3 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>No teams available</p>
                        )}
                      </div>
                    </div>
                    {teamSelections.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {teamSelections.map(teamId => {
                          const team = teams.find(t => t.TeamID === teamId);
                          return team ? (
                            <span key={teamId} className={`inline-flex items-center gap-1 border text-[10px] font-bold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
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

                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="e.g. ••••••"
                      className={`w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-bold transition-all duration-200 shadow-md cursor-pointer border-none flex items-center justify-center space-x-2"
                  >
                    <Plus size={16} />
                    <span>Create user</span>
                  </button>
                </form>
              </div>

              {/* Advanced Directory List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full sm:w-80">
                    <Search className={`absolute left-3 top-2.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} size={14} />
                    <input
                      type="text"
                      value={userSearchText}
                      onChange={(e) => setUserSearchText(e.target.value)}
                      placeholder="Search mapping name, email, or role..."
                      className={`w-full text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-600' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold tracking-widest font-mono ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>
                      {users.length} users
                    </span>
                    {userSearchText && (
                      <span className={`text-[10px] font-medium ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        • {users.filter(u =>
                          u.FullName.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Email.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Role.toLowerCase().includes(userSearchText.toLowerCase())
                        ).length} results
                      </span>
                    )}
                  </div>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                  <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
                    <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
                      <thead className={`${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-50'} sticky top-0 z-10`}>
                        <tr>
                          <th className={`px-3 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '20%', minWidth: 0 }}>User</th>
                          <th className={`px-3 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '25%', minWidth: 0 }}>Teams</th>
                          <th className={`px-3 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '18%', minWidth: 0 }}>Manager</th>
                          <th className={`px-3 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '22%', minWidth: 0 }}>Role</th>
                          <th className={`px-3 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '15%', minWidth: 0 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-200'}`}>
                      {(() => {
                        const filteredUsers = users.filter(u =>
                          u.FullName.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Email.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Role.toLowerCase().includes(userSearchText.toLowerCase())
                        );

                        if (filteredUsers.length === 0) {
                          return (
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
                          );
                        }

                        return filteredUsers.map(user => {
                          const isBanned = !user.Active;
                          return (
                            <tr 
                              key={user.UserID}
                              className={`transition-colors ${isDarkMode ? 'hover:bg-[#1E293B]/60' : 'hover:bg-slate-50'} ${isBanned ? isDarkMode ? 'bg-red-500/5' : 'bg-red-50/30' : ''}`}
                            >
                              <td className="px-3 py-3" style={{ minWidth: 0 }}>
                                <div className="min-w-0">
                                  <div className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} truncate`}>{user.FullName}</div>
                                  <div className={`text-xs font-mono ${isDarkMode ? 'text-blue-400' : 'text-blue-600'} truncate`}>{user.Email}</div>
                                  <div className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} truncate`}>{user.UserID}</div>
                                </div>
                              </td>
                              <td className="px-3 py-3" style={{ minWidth: 0 }}>
                                {/* Editable team assignments — Admin can add/remove teams per user */}
                                <div className="space-y-1.5 min-w-0">
                                  <div className="flex flex-wrap gap-1">
                                    {(user.TeamNames || []).map((tName, i) => {
                                      const tId = (user.TeamIDs || [])[i];
                                      return (
                                        <span key={i} className={`inline-flex items-center gap-1 border text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                                          {tName}
                                          <button
                                            type="button"
                                            title={`Remove from ${tName}`}
                                            onClick={() => handleRemoveMember(user.Email, tId, tName)}
                                            className={`ml-0.5 rounded-full hover:opacity-70 transition-opacity ${isDarkMode ? 'text-indigo-300' : 'text-indigo-500'}`}
                                          >
                                            <X size={9} />
                                          </button>
                                        </span>
                                      );
                                    })}
                                    {(user.TeamNames || []).length === 0 && (
                                      <span className={`text-[10px] italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No teams</span>
                                    )}
                                  </div>
                                  {/* Inline team add dropdown */}
                                  <select
                                    defaultValue=""
                                    onChange={(e) => {
                                      const selectedTeam = teams.find(t => t.TeamID === e.target.value);
                                      if (selectedTeam) {
                                        handleAddMember(user.Email, selectedTeam.TeamID, selectedTeam.TeamName);
                                      }
                                      e.target.value = '';
                                    }}
                                    className={`w-full text-[10px] rounded px-1 py-0.5 border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer min-w-0 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-slate-300' : 'bg-white border-slate-200 text-slate-700'}`}
                                    style={{ minWidth: 0 }}
                                  >
                                    <option value="" disabled>+ Add</option>
                                    {teams.filter(t => t.Active && !(user.TeamIDs || []).includes(t.TeamID)).map(t => (
                                      <option key={t.TeamID} value={t.TeamID}>{t.TeamName}</option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-3" style={{ minWidth: 0 }}>
                                {user.ManagerEmail ? (
                                  <span className={`text-xs font-mono block truncate ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} title={user.ManagerEmail}>{user.ManagerEmail}</span>
                                ) : (
                                  <span className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`} title="Reports directly to Super Admin">—</span>
                                )}
                              </td>
                              <td className="px-3 py-3" style={{ minWidth: 0 }}>
                                <div className="relative inline-block min-w-0">
                                <select
                                  value={user.Role}
                                  onChange={(e) => onUpdateUserRole(user.Email, e.target.value as any)}
                                  className={`text-xs uppercase font-bold pl-1.5 pr-5 py-1 rounded border appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer min-w-0 ${isDarkMode ? 'bg-[#1E293B] text-white border-[#334155]' : 'bg-white text-slate-800 border-slate-200'}`}
                                  style={{ minWidth: 0 }}
                                >
                                  <option value="Admin">Admin</option>
                                  <option value="Stakeholder">Stakeholder</option>
                                  <option value="Sub-stakeholder">Sub-stakeholder</option>
                                </select>
                                <ChevronDown size={10} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-60" />
                                </div>
                              </td>
                              <td className="px-3 py-3" style={{ minWidth: 0 }}>
                                <button
                                  onClick={() => onToggleUserStatus(user.Email)}
                                  className={`text-[10px] font-extrabold tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                                    user.Active
                                      ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-[#ECFDF5] border-emerald-200 text-[#065F46] hover:bg-[#D1FAE5]'
                                      : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-[#FEF2F2] border-red-200 text-[#991B1B] hover:bg-[#FEE2E2]'
                                  }`}
                                >
                                  {user.Active ? 'Active' : 'Banned'}
                                </button>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: Teams Management */}
        {activeAdminSubTab === 'teams' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
              {/* Add Team Form */}
              <div className={`border rounded-xl p-4 space-y-3 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                <div className={`flex items-center space-x-1.5 border-b pb-2 ${isDarkMode ? 'border-[#334155] text-white' : 'border-[#E2E8F0] text-[#0F172A]'}`}>
                  <Plus size={16} className={isDarkMode ? 'text-blue-400' : 'text-[#2563EB]'} />
                  <h4 className={`font-extrabold text-xs font-mono ${isDarkMode ? 'text-white' : 'text-[#010915]'}`}>Create new team</h4>
                </div>

                {teamSuccessMessage && (
                  <div className={`p-2.5 text-xs rounded-lg font-semibold flex items-center gap-1 animate-pulse ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-150'}`}>
                    <CheckCircle size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{teamSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTeamCreateSubmit} className="space-y-2.5">
                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Team name</label>
                    <input
                      type="text"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Engineering Team"
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Description (optional)</label>
                    <textarea
                      value={teamDescription}
                      onChange={(e) => setTeamDescription(e.target.value)}
                      placeholder="e.g. Team description and purpose..."
                      rows={2}
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-xs font-extrabold tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Create team</span>
                  </button>
                </form>
              </div>

              {/* Teams List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className={`font-extrabold text-sm font-mono ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>All teams ({teams.length})</h4>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <thead className={`${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-50'}`}>
                      <tr>
                        <th className={`px-3 py-2 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '22%', minWidth: 0 }}>Team</th>
                        <th className={`px-3 py-2 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '23%', minWidth: 0 }}>Description</th>
                        <th className={`px-3 py-2 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '15%', minWidth: 0 }}>Members</th>
                        <th className={`px-3 py-2 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '15%', minWidth: 0 }}>Status</th>
                        <th className={`px-3 py-2 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} style={{ width: '25%', minWidth: 0 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-200'}`}>
                      {teams.map(team => {
                        const teamUsers = users.filter(u => u.TeamIDs.includes(team.TeamID));
                        return (
                          <tr key={team.TeamID} className={`transition-colors ${isDarkMode ? 'hover:bg-[#1E293B]/60' : 'hover:bg-slate-50'}`}>
                            <td className="px-3 py-2" style={{ minWidth: 0 }}>
                              <div className="min-w-0">
                                <div className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} truncate`}>{team.TeamName}</div>
                                <div className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'} truncate`}>{team.TeamID}</div>
                              </div>
                            </td>
                            <td className="px-3 py-2" style={{ minWidth: 0 }}>
                              <span className={`text-xs block truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`} title={team.Description || 'No description'}>{team.Description || 'No description'}</span>
                            </td>
                            <td className="px-3 py-2" style={{ minWidth: 0 }}>
                              <span className={`text-xs font-extrabold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-[#2563EB]/10 text-[#2563EB]'}`}>
                                {teamUsers.length}
                              </span>
                            </td>
                            <td className="px-3 py-2" style={{ minWidth: 0 }}>
                              <button
                                onClick={() => onToggleTeamStatus(team.TeamID)}
                                className={`text-[10px] font-extrabold tracking-widest py-1 px-2.5 rounded-lg border transition-all cursor-pointer ${
                                    team.Active
                                    ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-[#ECFDF5] border-emerald-200 text-[#065F46] hover:bg-[#D1FAE5]'
                                    : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-[#FEF2F2] border-red-200 text-[#991B1B] hover:bg-[#FEE2E2]'
                                  }`}
                              >
                                {team.Active ? 'Active' : 'Inactive'}
                              </button>
                            </td>
                            <td className="px-3 py-2" style={{ minWidth: 0 }}>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setExpandedTeamId(team.TeamID);
                                    setSelectedUsersToAdd(new Set());
                                    setSelectedTeamLeaders(new Set());
                                    setSelectedTeamStakeholders(new Set());
                                    setMemberSearchQuery('');

                                    // Read leaders/stakeholders directly from team object (which is updated by App.tsx)
                                    // instead of settings, since onUpdateSetting only updates team state, not settings array
                                    const teamData = teams.find(t => t.TeamID === expandedTeamId);
                                    const leadersFromTeam = teamData?.TeamLeaderEmails || [];
                                    const stakeholdersFromTeam = teamData?.StakeholderEmails || [];

                                    console.log('[Modal Open] Loading leaders from team state for team:', team.TeamID, 'leaders:', leadersFromTeam, 'stakeholders:', stakeholdersFromTeam);

                                    setCurrentTeamLeaders(leadersFromTeam);
                                    setCurrentTeamStakeholders(stakeholdersFromTeam);
                                  }}
                                  className={`px-2 py-1 text-[10px] font-bold tracking-wider rounded-lg border transition-colors cursor-pointer ${isDarkMode ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'}`}
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
                                  className={`px-2 py-1 text-[10px] font-bold tracking-wider rounded-lg border transition-colors cursor-pointer ${isDarkMode ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/30' : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'}`}
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
                  {teams.length === 0 && (
                    <div className="text-center py-14">
                      <Users size={40} className={`mx-auto mb-3 ${isDarkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                      <p className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>No teams yet</p>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Create your first team using the form on the left.</p>
                    </div>
                  )}
                </div>

                {/* Unassigned Users Section */}
                {(() => {
                  const unassignedUsers = users.filter(u => u.Active && (!u.TeamIDs || u.TeamIDs.length === 0));
                  if (unassignedUsers.length === 0) return null;
                  return (
                    <div className={`mt-6 border rounded-xl overflow-hidden ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                      <div className={`px-4 py-3 border-b ${isDarkMode ? 'border-[#334155] bg-[#1E293B]' : 'border-slate-200 bg-slate-50'}`}>
                        <h4 className={`font-extrabold text-sm font-mono ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>Unassigned Users ({unassignedUsers.length})</h4>
                      </div>
                      <div className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-200'}`}>
                        {unassignedUsers.map(u => (
                          <div key={u.UserID} className={`px-4 py-3 flex items-center justify-between ${isDarkMode ? 'hover:bg-[#1E293B]/60' : 'hover:bg-slate-50'}`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDarkMode ? 'bg-slate-500/20 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                                {(u.FullName || '').split(' ').map(n => n[0]).join('').toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className={`font-medium text-sm truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{u.FullName}</div>
                                <div className={`text-xs truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                              </div>
                            </div>
                            <span className={`text-xs font-bold px-2 py-1 rounded-full ${isDarkMode ? 'bg-slate-500/10 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                              {u.Role}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Team Management Drawer */}
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

                  return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                      <div className="absolute inset-0 bg-black/50" onClick={() => setExpandedTeamId(null)} />
                      <div className={`relative w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-xl shadow-2xl flex flex-col ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
                        {/* Header */}
                        <div className={`flex-shrink-0 flex items-center justify-between p-6 border-b ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                          <div>
                            <h3 className={`font-bold text-xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Manage {team.TeamName}</h3>
                            <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{team.TeamID}</p>
                          </div>
                          <button
                            onClick={() => setExpandedTeamId(null)}
                            className={`flex-shrink-0 p-3 rounded-lg transition-colors hover:bg-opacity-80 ${isDarkMode ? 'hover:bg-[#334155] text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                          >
                            <X size={24} />
                          </button>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-8">
                          {/* Current Members Section */}
                          <div className="mb-8">
                            <h4 className={`font-bold text-base mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Current Members ({teamUsers.length})</h4>
                            <div className={`space-y-3 max-h-64 overflow-y-auto ${teamUsers.length > 0 ? 'border rounded-xl p-4' : ''} ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                              {teamUsers.map(u => (
                                <div key={u.UserID} className={`flex items-center justify-between p-4 rounded-lg min-h-[72px] ${isDarkMode ? 'bg-[#0F141F]' : 'bg-slate-50'}`}>
                                  <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
                                      {(u.FullName || '').split(' ').map(n => n[0]).join('').toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className={`font-medium text-base truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                        {u.FullName}
                                        {currentLeaders.some(l => l.Email === u.Email) && (
                                          <span className={`ml-3 px-3 py-1 rounded-full text-xs font-bold ${isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                            Leader
                                          </span>
                                        )}
                                      </div>
                                      <div className={`text-sm truncate mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveMember(u.Email, team.TeamID, team.TeamName)}
                                    className={`flex-shrink-0 p-3 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
                                    title="Remove from team"
                                  >
                                    <X size={18} />
                                  </button>
                                </div>
                              ))}
                              {teamUsers.length === 0 && (
                                <div className={`text-center py-12 text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  No members in this team yet.
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Divider */}
                          <div className={`h-px mb-8 ${isDarkMode ? 'bg-[#334155]' : 'bg-slate-200'}`} />

                          {/* Team Leaders Section */}
                          <div className="mb-8">
                            <h4 className={`font-bold text-base mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Team Leaders ({currentLeaders.length})</h4>
                            {teamUsers.length === 0 ? (
                              <div className={`p-6 rounded-xl border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                <p className="text-base font-medium">Add members first before assigning Team Leaders.</p>
                              </div>
                            ) : (
                              <>
                                <div className={`space-y-3 max-h-56 overflow-y-auto border rounded-xl p-4 mb-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                  {currentLeaders.map(u => (
                                    <div key={u.UserID} className={`flex items-center justify-between p-4 rounded-lg min-h-[72px] ${isDarkMode ? 'bg-[#0F141F]' : 'bg-slate-50'}`}>
                                      <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${isDarkMode ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                                          {(u.FullName || '').split(' ').map(n => n[0]).join('').toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className={`font-medium text-base truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{u.FullName}</div>
                                          <div className={`text-sm truncate mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleRemoveTeamLeader(u.Email, team.TeamID)}
                                        className={`flex-shrink-0 p-3 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
                                        title="Remove as team leader"
                                      >
                                        <X size={18} />
                                      </button>
                                    </div>
                                  ))}
                                  {currentLeaders.length === 0 && (
                                    <div className={`text-center py-8 text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                      No team leaders assigned yet.
                                    </div>
                                  )}
                                </div>

                                {eligibleForLeadership.length > 0 && (
                                  <div>
                                    <h5 className={`font-semibold text-sm mb-3 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Assign Team Leader</h5>
                                    <div className={`space-y-3 max-h-56 overflow-y-auto border rounded-xl p-4 mb-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                      {eligibleForLeadership.map(u => (
                                        <label key={u.UserID} className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-[#334155]/50 transition-colors min-h-[72px] ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                          <input
                                            type="checkbox"
                                            checked={selectedTeamLeaders.has(u.Email)}
                                            onChange={(e) => {
                                              const newSelected = new Set(selectedTeamLeaders);
                                              if (e.target.checked) {
                                                newSelected.add(u.Email);
                                              } else {
                                                newSelected.delete(u.Email);
                                              }
                                              setSelectedTeamLeaders(newSelected);
                                            }}
                                            className={`flex-shrink-0 w-5 h-5 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-[#475569] bg-[#334155]' : 'border-slate-300'}`}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <div className="font-medium text-base truncate">{u.FullName}</div>
                                            <div className={`text-sm truncate mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                          </div>
                                        </label>
                                      ))}
                                    </div>
                                    <button
                                      onClick={() => handleAssignMultipleTeamLeaders(team.TeamID)}
                                      disabled={selectedTeamLeaders.size === 0}
                                      className={`w-full py-3 px-6 rounded-lg text-base font-bold transition-colors border-none cursor-pointer ${
                                        selectedTeamLeaders.size === 0
                                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                          : isDarkMode ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                      }`}
                                    >
                                      Assign Selected ({selectedTeamLeaders.size})
                                    </button>
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          {/* Divider */}
                          <div className={`h-px mb-8 ${isDarkMode ? 'bg-[#334155]' : 'bg-slate-200'}`} />

                          {/* Sub-Teams Section */}
                          {(() => {
                            const teamSubTeams = subTeams.filter(st => st.TeamID === team.TeamID && st.Active);
                            return (
                              <div className="mb-8">
                                <div className="flex items-center gap-3 mb-4">
                                  <Layers size={18} className={isDarkMode ? 'text-indigo-400' : 'text-indigo-600'} />
                                  <h4 className={`font-bold text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                    Sub-Teams ({teamSubTeams.length})
                                  </h4>
                                </div>

                                {/* Existing sub-teams */}
                                {teamSubTeams.length > 0 && (
                                  <div className="space-y-3 mb-6">
                                    {teamSubTeams.map(st => {
                                      const stMembers = users.filter(u => u.SubTeamIDs?.includes(st.SubTeamID) && u.Active);
                                      const stLeaders = st.SubTeamLeaderEmails ?? [];
                                      const isExpanded = expandedSubTeamId === st.SubTeamID;
                                      return (
                                        <div key={st.SubTeamID} className={`border rounded-xl ${isDarkMode ? 'border-[#334155] bg-[#0F141F]' : 'border-slate-200 bg-slate-50'}`}>
                                          {/* Sub-team header */}
                                          <div className="flex items-center justify-between p-4">
                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${isDarkMode ? 'bg-indigo-500/20' : 'bg-indigo-100'}`}>
                                                <Layers size={14} className={isDarkMode ? 'text-indigo-400' : 'text-indigo-600'} />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <div className={`font-semibold text-sm truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{st.SubTeamName}</div>
                                                <div className={`text-xs truncate ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                                                  {stMembers.length} member{stMembers.length !== 1 ? 's' : ''} · {stLeaders.length} leader{stLeaders.length !== 1 ? 's' : ''}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedSubTeamId(isExpanded ? null : st.SubTeamID)}
                                                className={`px-2.5 py-1.5 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${isDarkMode ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'}`}
                                              >
                                                {isExpanded ? 'Collapse' : 'Manage'}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={async () => {
                                                  if (!confirm(`Delete sub-team "${st.SubTeamName}"? Members will be unassigned.`)) return;
                                                  await onDeleteSubTeam?.(st.SubTeamID);
                                                }}
                                                className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-50 text-red-500'}`}
                                                title="Delete sub-team"
                                              >
                                                <X size={14} />
                                              </button>
                                            </div>
                                          </div>

                                          {/* Expanded sub-team management */}
                                          {isExpanded && (
                                            <div className={`border-t px-4 pb-4 pt-3 space-y-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>

                                              {/* Members in this sub-team */}
                                              <div>
                                                <h6 className={`text-xs font-bold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Members</h6>
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
                                                {/* Add member to sub-team */}
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
                                                <h6 className={`text-xs font-bold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Sub-Team Leaders</h6>
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
                                                {/* Assign leader dropdown — eligible = sub-team members not already leaders */}
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
                                <div className={`border rounded-xl p-4 space-y-3 ${isDarkMode ? 'border-[#334155] bg-[#0F141F]' : 'border-slate-200 bg-slate-50'}`}>
                                  <h5 className={`text-xs font-bold tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Create Sub-Team</h5>
                                  <input
                                    type="text"
                                    value={newSubTeamName}
                                    onChange={e => setNewSubTeamName(e.target.value)}
                                    placeholder="e.g. Sub-team name…"
                                    className={`w-full text-xs rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-500'}`}
                                  />
                                  <input
                                    type="text"
                                    value={newSubTeamDesc}
                                    onChange={e => setNewSubTeamDesc(e.target.value)}
                                    placeholder="e.g. Description (optional)…"
                                    className={`w-full text-xs rounded-lg px-3 py-2 border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-600' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-500'}`}
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
                                      await onSaveSubTeam?.({
                                        SubTeamID: `ST-${team.TeamID}-${Date.now()}`,
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
                                    className={`w-full py-2 text-xs font-bold rounded-lg border-none transition-colors cursor-pointer ${newSubTeamName.trim() ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
                                    disabled={!newSubTeamName.trim()}
                                  >
                                    <Plus size={12} className="inline mr-1" />
                                    Create Sub-Team
                                  </button>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Divider */}
                          <div className={`h-px mb-8 ${isDarkMode ? 'bg-[#334155]' : 'bg-slate-200'}`} />

                          {/* Add Members Section */}
                          <div>
                            <h4 className={`font-bold text-base mb-4 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add Members</h4>
                            <div className={`space-y-4`}>
                              {/* Search Box */}
                              <div className="relative">
                                <Search className={`absolute left-4 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} size={18} />
                                <input
                                  type="text"
                                  value={memberSearchQuery}
                                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                                  placeholder="Search by name or email..."
                                  className={`w-full pl-12 pr-4 py-3 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                                />
                              </div>

                              <div className={`space-y-3 max-h-64 overflow-y-auto border rounded-xl p-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                {filteredAvailableUsers.map(u => (
                                  <label key={u.UserID} className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-[#334155]/50 transition-colors min-h-[72px] ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                                    <input
                                      type="checkbox"
                                      checked={selectedUsersToAdd.has(u.Email)}
                                      onChange={(e) => {
                                        const newSelected = new Set(selectedUsersToAdd);
                                        if (e.target.checked) {
                                          newSelected.add(u.Email);
                                        } else {
                                          newSelected.delete(u.Email);
                                        }
                                        setSelectedUsersToAdd(newSelected);
                                      }}
                                      className={`flex-shrink-0 w-5 h-5 rounded cursor-pointer accent-[#2563EB] focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-[#475569] bg-[#334155]' : 'border-slate-300'}`}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-base truncate">{u.FullName}</div>
                                      <div className={`text-sm truncate mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                    </div>
                                  </label>
                                ))}
                                {filteredAvailableUsers.length === 0 && (
                                  <div className={`text-center py-8 text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                    {memberSearchQuery ? 'No users match your search.' : 'All active users are already members.'}
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  selectedUsersToAdd.forEach(email => {
                                    handleAddMember(email, team.TeamID, team.TeamName);
                                  });
                                  setSelectedUsersToAdd(new Set());
                                }}
                                disabled={selectedUsersToAdd.size === 0}
                                className={`w-full py-3 px-6 rounded-lg text-base font-bold transition-colors border-none cursor-pointer ${
                                  selectedUsersToAdd.size === 0
                                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                                }`}
                              >
                                Add Selected ({selectedUsersToAdd.size})
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}


        {/* SUBTAB 4: Recurrence Blueprints Scheduler */}
        {activeAdminSubTab === 'templates' && (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Add Recurrence Blueprint Form */}
              <div className={`border rounded-xl p-5 space-y-4 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                <div className={`flex items-center space-x-1.5 border-b pb-2 ${isDarkMode ? 'border-[#334155] text-white' : 'border-[#E2E8F0] text-[#0F172A]'}`}>
                  <Plus size={16} className={isDarkMode ? 'text-blue-400' : 'text-[#2563EB]'} />
                  <h4 className={`font-extrabold text-xs tracking-wider font-mono ${isDarkMode ? 'text-white' : 'text-[#010915]'}`}>Define new recurrence blueprint</h4>
                </div>

                {templateSuccessMessage && (
                  <div className={`p-3 text-xs rounded-lg font-bold flex items-center gap-1 animate-pulse ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-850 bg-emerald-50 border-emerald-150'}`}>
                    <CheckCircle size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{templateSuccessMessage}</span>
                  </div>
                )}

                {templateErrorMessage && (
                  <div className={`p-3 text-xs rounded-lg font-bold flex items-center gap-1 animate-pulse ${isDarkMode ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-red-850 bg-red-50 border-red-150'}`}>
                    <AlertCircle size={14} className={isDarkMode ? 'text-red-400' : 'text-red-600'} />
                    <span>{templateErrorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTemplateCreateSubmit} className="space-y-3.5">
                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Standard checklist title</label>
                    <input
                      type="text"
                      required
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      placeholder="e.g. Fortnightly SOC2 Assets Audit"
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Detailed description instructions</label>
                    <textarea
                      required
                      value={tempDesc}
                      onChange={(e) => setTempDesc(e.target.value)}
                      placeholder="e.g. Identify active cluster nodes, map pending anomalies, and verify signature certificates..."
                      rows={3}
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-600' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Recurrence rate</label>
                      <div className="relative">
                      <select
                        value={tempRecurrence}
                        onChange={(e) => setTempRecurrence(e.target.value as any)}
                        className={`w-full text-xs rounded-lg pl-2 pr-7 py-2 appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#E2E8F0] text-slate-800'}`}
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
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Priority rank</label>
                      <div className="relative">
                      <select
                        value={tempPriority}
                        onChange={(e) => setTempPriority(e.target.value as any)}
                        className={`w-full text-xs rounded-lg pl-2 pr-7 py-2 appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#E2E8F0] text-slate-800'}`}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                      <ChevronDown size={14} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                      </div>
                    </div>

                    <div>
                      <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Schedule start date</label>
                      <input
                        type="date"
                        required
                        value={tempStartDate}
                        onChange={(e) => setTempStartDate(e.target.value)}
                        className={`w-full text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#E2E8F0] text-slate-800'}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Default responsible identity</label>
                    <div className="relative">
                    <select
                      required
                      value={tempAssignToEmail}
                      onChange={(e) => setTempAssignToEmail(e.target.value)}
                      className={`w-full text-xs rounded-lg pl-2 pr-7 py-2 appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#E2E8F0] text-slate-800'}`}
                    >
                      <option value="">Select recipient email...</option>
                      {users.map(u => (
                        <option key={u.Email} value={u.Email}>{u.FullName} ({u.Email})</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className={`pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-extrabold tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Synchronize scheduler</span>
                  </button>
                </form>
              </div>

              {/* Blueprints Database Directory */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full sm:w-80">
                    <Search className={`absolute left-3 top-2.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`} size={14} />
                    <input
                      type="text"
                      value={templateSearchText}
                      onChange={(e) => setTemplateSearchText(e.target.value)}
                      placeholder="Search blueprints title or recipient..."
                      className={`w-full text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-600' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-500'}`}
                    />
                  </div>
                  <span className={`text-[10px] font-bold tracking-widest font-mono ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>
                    Blueprints Matrix: {templates.length} Scheduler Threads
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {templates
                    .filter(t => 
                      t.Title.toLowerCase().includes(templateSearchText.toLowerCase()) ||
                      t.AssignedToEmail.toLowerCase().includes(templateSearchText.toLowerCase())
                    )
                    .map(template => {
                      const isActive = template.Active;
                      return (
                        <div 
                          key={template.TemplateID}
                          className={`border rounded-xl p-5 flex flex-col justify-between gap-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${
                            !isActive 
                              ? isDarkMode ? 'border-red-500/20 bg-red-500/10' : 'border-red-200 bg-red-50/10'
                              : isDarkMode ? 'border-[#334155] bg-[#1E293B]' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className={`font-extrabold text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{template.Title}</h5>
                                <p className={`text-xs font-medium mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{template.RecurrenceType}</p>
                              </div>
                              <span className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{template.TemplateID}</span>
                            </div>

                            <div className="flex gap-1.5">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                template.Priority === 'Critical' ? isDarkMode ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200' :
                                template.Priority === 'High' ? isDarkMode ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-orange-50 text-orange-700 border-orange-200' :
                                template.Priority === 'Medium' ? isDarkMode ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' : 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                isDarkMode ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 'bg-slate-50 text-slate-700 border-slate-200'
                              }`}>
                                {template.Priority} Priority
                              </span>
                            </div>

                            <div className={`pt-2 border-t flex justify-between items-center text-xs ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                              <span className={`font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Assigned Target:</span>
                              <span className={`font-semibold truncate max-w-[200px] ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{template.AssignedToEmail}</span>
                            </div>

                            <div className="flex justify-between items-center text-xs">
                              <span className={`font-medium ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Next Run:</span>
                              <span className={`font-mono font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{template.NextGenerationDate}</span>
                            </div>
                          </div>

                          <div className={`flex items-center justify-between gap-3 pt-3 border-t ${isDarkMode ? 'border-[#334155]' : 'border-[#F1F5F9]'}`}>
                            <span className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Created {new Date(template.CreatedAt).toLocaleDateString()}</span>
                            <button
                              onClick={() => onToggleTemplateStatus(template.TemplateID)}
                              className={`text-[10px] font-extrabold tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer text-center ${
                                template.Active
                                  ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-[#ECFDF5] border-emerald-200 text-[#065F46] hover:bg-[#D1FAE5]'
                                  : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-[#FEF2F2] border-red-200 text-[#991B1B] hover:bg-[#FEE2E2]'
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
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Define a blueprint using the form on the left to get started.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: Specialized Email Template Customisation Workbench (STRICTLY REQUESTED CEILING OPTION) */}
        {activeAdminSubTab === 'email_templates' && (
          <div className="space-y-5 animate-fade-in">
            <div className={`border rounded-xl p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-200'}`}>
              <div>
                <h4 className={`font-extrabold text-sm tracking-wider font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-900'}`}>Automated email templates workbench</h4>
                <p className={`text-xs mt-1 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Configure structural boilerplate layouts for simulated emails. This allows customizable, client-wide alert configurations that will automatically fire during cycle execution and overdue audits.
                </p>
              </div>
              <div className={`px-3 py-2 rounded-lg border flex gap-1.5 items-center ${isDarkMode ? 'bg-[#1E293B] border-emerald-500/20' : 'bg-white border-emerald-200'}`}>
                <label className={`text-[10px] font-mono font-black tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active selector:</label>
                <select
                  value={selectedEmailTemplateKey}
                  onChange={(e) => setSelectedEmailTemplateKey(e.target.value as any)}
                  className={`bg-transparent border-none font-extrabold text-xs focus:ring-0 outline-none cursor-pointer ${isDarkMode ? 'text-emerald-400' : 'text-emerald-800'}`}
                >
                  <option value="template_assigned_email">Task Assignment</option>
                  <option value="template_delayed_email">Overdue Alert</option>
                  <option value="template_scheduled_reminder">Scheduled Report Reminder</option>
                  <option value="report_submitted">Report Submitted</option>
                  <option value="task_closed">Task Closed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* Left Side: Template Editor Box */}
              <div className={`border border-[#E5E7EB] bg-white p-6 rounded-2xl shadow-sm space-y-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : ''}`}>
                <div className={`flex justify-between items-center border-b pb-2 ${isDarkMode ? 'border-[#334155]' : 'border-[#E2E8F0]'}`}>
                  <div className="flex items-center space-x-1.5">
                    <Edit className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} size={16} />
                    <h4 className={`font-bold text-xs tracking-wider font-mono ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Template code composer</h4>
                  </div>
                  <span className={`text-[9.5px] font-mono font-bold uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`}>{selectedEmailTemplateKey}</span>
                </div>

                <div className="space-y-1">
                  <label className={`block text-[10px] font-mono font-black tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Email subject</label>
                  <input
                    type="text"
                    value={tempEmailSubject}
                    onChange={(e) => setTempEmailSubject(e.target.value)}
                    className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#1E293B] border-[#475569] text-white' : 'bg-white border-[#E5E7EB] text-slate-800'}`}
                    placeholder="Enter email subject..."
                  />
                </div>

                <div className="space-y-1">
                  <label className={`block text-[10px] font-mono font-black tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Email body template editor</label>
                  <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Write custom text or HTML code. Use the toolbar below for formatting and click the visual tokens to inject placeholders.</p>
                </div>

                {/* Rich Text Toolbar */}
                <div className={`flex flex-wrap gap-1 p-2 rounded-lg border ${isDarkMode ? 'bg-[#334155] border-[#475569]' : 'bg-slate-50 border-slate-150'}`}>
                  <button
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    className={`p-1.5 rounded transition-all ${editor?.isActive('bold') ? 'bg-emerald-500/20 text-emerald-400' : isDarkMode ? 'text-slate-400 hover:bg-[#475569]' : 'text-slate-600 hover:bg-slate-200'}`}
                    title="Bold"
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    className={`p-1.5 rounded transition-all ${editor?.isActive('italic') ? 'bg-emerald-500/20 text-emerald-400' : isDarkMode ? 'text-slate-400 hover:bg-[#475569]' : 'text-slate-600 hover:bg-slate-200'}`}
                    title="Italic"
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    onClick={() => editor?.chain().focus().toggleUnderline().run()}
                    className={`p-1.5 rounded transition-all ${editor?.isActive('underline') ? 'bg-emerald-500/20 text-emerald-400' : isDarkMode ? 'text-slate-400 hover:bg-[#475569]' : 'text-slate-600 hover:bg-slate-200'}`}
                    title="Underline"
                  >
                    <UnderlineIcon size={14} />
                  </button>
                  <div className="w-px bg-slate-300 mx-1" />
                  <select
                    value={selectedFont}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className={`text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 ${isDarkMode ? 'bg-[#1E293B] border-[#475569] text-white' : 'bg-white border-[#E5E7EB] text-slate-800'}`}
                  >
                    <option value="sans-serif">Sans Serif</option>
                    <option value="serif">Serif</option>
                    <option value="monospace">Monospace</option>
                  </select>
                  <button
                    onClick={() => setShowColorDropdown(!showColorDropdown)}
                    className={`p-1.5 rounded transition-all ${isDarkMode ? 'text-slate-400 hover:bg-[#475569]' : 'text-slate-600 hover:bg-slate-200'}`}
                    title="Text Color"
                  >
                    <Palette size={14} />
                  </button>
                  {showColorDropdown && (
                    <div className={`absolute z-10 p-2 rounded-lg border grid grid-cols-4 gap-1 ${isDarkMode ? 'bg-[#1E293B] border-[#475569]' : 'bg-white border-slate-200'}`}>
                      {['#000000', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'].map(color => (
                        <button
                          key={color}
                          onClick={() => { setTextColor(color); setShowColorDropdown(false); }}
                          className="w-6 h-6 rounded border border-slate-200"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Interactive Token badges list */}
                <div className={`p-3 rounded-lg border space-y-2 ${isDarkMode ? 'bg-[#334155] border-[#475569]' : 'bg-slate-50 border-slate-150'}`}>
                  <span className={`block text-[8px] font-black font-mono tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Interactive placeholders (click to insert)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {getAvailableTokens().map(tok => (
                      <button
                        key={tok.token}
                        onClick={() => handleInsertToken(tok.token)}
                        title={tok.desc}
                        type="button"
                        className={`text-[10px] sm:text-[11px] font-mono font-extrabold px-2 py-1 rounded transition-all cursor-pointer select-none ${isDarkMode ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-150'}`}
                      >
                        {tok.token}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tiptap Editor */}
                <div className={`border rounded-xl p-3 min-h-[300px] ${isDarkMode ? 'bg-[#1E293B] border-[#475569]' : 'bg-white border-slate-200'}`}>
                  <EditorContent editor={editor} />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    {emailSaveSuccess && (
                      <span className={`text-xs font-bold flex items-center space-x-1 animate-pulse ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        <CheckCircle size={14} />
                        <span>Changes Saved Successfully!</span>
                      </span>
                    )}
                  </div>

                  <button
                    onClick={handleSaveEmailTemplateValue}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold tracking-widest px-6 py-2.5 rounded-xl shadow-md cursor-pointer transition-all border-none flex items-center space-x-1.5"
                  >
                    <CheckCircle size={13} />
                    <span>Apply email layout</span>
                  </button>
                </div>
              </div>

              {/* Right Side: Live HTML / Text simulated email client card preview */}
              <div className={`border border-[#E5E7EB] bg-white rounded-2xl p-6 flex flex-col justify-between shadow-2xl h-full min-h-[420px] ${isDarkMode ? 'bg-[#0F172A] border-[#1E293B] text-slate-100' : ''}`}>
                <div>
                  <div className={`flex items-center justify-between border-b pb-4 mb-4 ${isDarkMode ? 'border-[#1E293B]' : 'border-[#1E293B]'}`}>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono font-bold tracking-widest uppercase">SIMULATED EMAIL CLIENT AGENT v2.1</span>
                  </div>

                  {/* Simulated Mail Header */}
                  {(() => {
                    const preview = getSimulatedEmailPreviewStr();
                    return (
                      <>
                        <div className={`p-4 rounded-xl border space-y-2 font-mono text-[10px] leading-relaxed mb-4 ${isDarkMode ? 'bg-slate-900/80 border-[#1E293B] text-slate-300' : 'bg-slate-900/80 border-[#1E293B] text-slate-300'}`}>
                          <div>
                            <span className="text-slate-500 uppercase">From:</span> auto_alert@PMS.live
                          </div>
                          <div>
                            <span className="text-slate-500 uppercase">To:</span> {selectedEmailTemplateKey === 'template_assigned_email' ? 'eng.director@PMS.com' : 'sales.lead@PMS.com, admin@PMS.com'}
                          </div>
                          <div>
                            <span className="text-slate-500 uppercase">Subject:</span> {preview.subject || 'No subject'}
                          </div>
                        </div>

                        {/* Mail Body Render Preview */}
                        <div className="bg-white text-slate-800 p-5 rounded-xl min-h-[220px] shadow-inner font-sans border border-slate-200 text-xs font-semibold leading-relaxed overflow-y-auto">
                          <div dangerouslySetInnerHTML={{ __html: preview.body }} />
                          {!preview.body && <span className="text-slate-400 italic">No content configured. Type code inside the composer to view preview.</span>}
                        </div>
                      </>
                    );
                  })()}
                </div>

                <div className={`mt-4 pt-3 border-t text-[9.5px] font-mono font-medium leading-relaxed ${isDarkMode ? 'border-[#1E293B] text-slate-400' : 'border-[#1E293B] text-slate-400'}`}>
                  Notice: Real-time changes above dynamically replace tags inside the simulation thread. Submit or generate tasks to view actual live results in the simulated logs list!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 5: Weekly Report Requirements Configuration */}
        {activeAdminSubTab === 'report_requirements' && (
          <div className="space-y-6 animate-fade-in">
            <div className={`border rounded-xl p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-200'}`}>
              <div>
                <h4 className={`font-extrabold text-sm tracking-wider font-mono ${isDarkMode ? 'text-blue-400' : 'text-blue-900'}`}>Weekly Report Requirements</h4>
                <p className={`text-xs mt-1 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Configure which teams and sub-teams are required to submit weekly reports. Team leaders can submit for whole team or sub-teams. Sub-team leaders can only submit for their own sub-team.
                </p>
              </div>
              <button
                onClick={handleSaveReportRequirements}
                className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wider transition-all cursor-pointer flex items-center space-x-2 ${
                  isDarkMode 
                    ? 'bg-blue-500 hover:bg-blue-600 text-white' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
              >
                <Save size={14} />
                <span>Save Configuration</span>
              </button>
            </div>

            {reportRequirementsSaveSuccess && (
              <div className={`flex items-center space-x-2 text-xs font-bold animate-pulse ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                <CheckCircle size={14} />
                <span>Configuration saved successfully!</span>
              </div>
            )}

            <div className="space-y-4">
              {teams.map(team => {
                const teamRequirement = reportRequirements[team.TeamID];
                const teamSubTeams = subTeams.filter(st => st.TeamID === team.TeamID && st.Active);
                
                return (
                  <div key={team.TeamID} className={`border rounded-xl p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${team.Active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        <h5 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{team.TeamName}</h5>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                          {team.TeamID}
                        </span>
                      </div>
                      <select
                        value={teamRequirement?.level || 'team'}
                        onChange={(e) => handleReportRequirementChange(team.TeamID, e.target.value as 'team' | 'subteam')}
                        className={`text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${
                          isDarkMode ? 'bg-[#0F141F] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <option value="team">Whole Team Reports</option>
                        <option value="subteam">Sub-Team Reports</option>
                      </select>
                    </div>

                    {teamRequirement?.level === 'subteam' && teamSubTeams.length > 0 && (
                      <div className="space-y-2">
                        <label className={`text-[10px] font-mono font-bold tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          Select sub-teams that must submit reports:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {teamSubTeams.map(subTeam => (
                            <label
                              key={subTeam.SubTeamID}
                              className={`flex items-center space-x-2 p-2 rounded-lg cursor-pointer transition-all ${
                                teamRequirement.subTeamIds.includes(subTeam.SubTeamID)
                                  ? isDarkMode ? 'bg-blue-500/20 border-blue-500/30' : 'bg-blue-50 border-blue-200'
                                  : isDarkMode ? 'bg-[#0F141F] border-[#334155]' : 'bg-slate-50 border-slate-200'
                              } ${isDarkMode ? 'border' : 'border'}`}
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

            <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
              <div className="flex items-start space-x-3">
                <Info size={16} className={isDarkMode ? 'text-amber-400' : 'text-amber-600'} />
                <div className={`text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <p className="font-bold mb-1">How this works:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Whole Team Reports:</strong> Team leaders receive reminders and can submit reports for the entire team.</li>
                    <li><strong>Sub-Team Reports:</strong> Only selected sub-team leaders receive reminders and can submit reports for their specific sub-team.</li>
                    <li><strong>Sub-team leader permissions:</strong> Can only submit reports for their own sub-team.</li>
                    <li><strong>Team leader permissions:</strong> Can submit reports for whole team or any sub-team within their team.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
