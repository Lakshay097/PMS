import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User as UserType, TaskTemplate, AppSetting, Team, EmailTemplate } from '../types';
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
  X
} from 'lucide-react';

interface AdminPanelProps {
  users: UserType[];
  templates: TaskTemplate[];
  settings: AppSetting[];
  emailTemplates?: EmailTemplate[];
  teams: Team[];
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
  onSendInviteEmail?: (email: string, fullName: string, role: string) => void;
  isDarkMode?: boolean;
}

export default function AdminPanel({
  users,
  templates,
  settings,
  emailTemplates = [],
  teams,
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
  onSendInviteEmail,
  isDarkMode = false,
}: AdminPanelProps) {
  // Master administrative tabs
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'teams' | 'templates' | 'email_templates'>('users');
  
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

  const handleAssignTeamLeader = (userEmail: string, teamId: string) => {
    const team = teams.find(t => t.TeamID === teamId);
    if (team) {
      const currentLeaders = team.TeamLeaderEmails || [];
      if (!currentLeaders.includes(userEmail)) {
        const updatedLeaders = [...currentLeaders, userEmail];
        onUpdateSetting(`team_${teamId}_leaders`, updatedLeaders.join(','));
        setCurrentTeamLeaders(updatedLeaders);
      }
    }
  };

  const handleAssignMultipleTeamLeaders = (teamId: string) => {
    selectedTeamLeaders.forEach(email => {
      handleAssignTeamLeader(email, teamId);
    });
    setSelectedTeamLeaders(new Set());
  };

  const handleRemoveTeamLeader = (userEmail: string, teamId: string) => {
    const team = teams.find(t => t.TeamID === teamId);
    if (team) {
      const currentLeaders = team.TeamLeaderEmails || [];
      const updatedLeaders = currentLeaders.filter(email => email !== userEmail);
      onUpdateSetting(`team_${teamId}_leaders`, updatedLeaders.join(','));
      setCurrentTeamLeaders(updatedLeaders);
    }
  };

  const handleAssignTeamStakeholder = (userEmail: string, teamId: string) => {
    const team = teams.find(t => t.TeamID === teamId);
    if (team) {
      const currentStakeholders = team.StakeholderEmails || [];
      if (!currentStakeholders.includes(userEmail)) {
        const updatedStakeholders = [...currentStakeholders, userEmail];
        onUpdateSetting(`team_${teamId}_stakeholders`, updatedStakeholders.join(','));
        setCurrentTeamStakeholders(updatedStakeholders);
      }
    }
  };

  const handleRemoveTeamStakeholder = (userEmail: string, teamId: string) => {
    const team = teams.find(t => t.TeamID === teamId);
    if (team) {
      const currentStakeholders = team.StakeholderEmails || [];
      const updatedStakeholders = currentStakeholders.filter(email => email !== userEmail);
      onUpdateSetting(`team_${teamId}_stakeholders`, updatedStakeholders.join(','));
      setCurrentTeamStakeholders(updatedStakeholders);
    }
  };

  const handleAssignMultipleTeamStakeholders = (teamId: string) => {
    const team = teams.find(t => t.TeamID === teamId);
    if (team) {
      const currentStakeholders = team.StakeholderEmails || [];
      const newStakeholders = [...currentStakeholders, ...Array.from(selectedTeamStakeholders)];
      onUpdateSetting(`team_${teamId}_stakeholders`, newStakeholders.join(','));
      setCurrentTeamStakeholders(newStakeholders);
      setSelectedTeamStakeholders(new Set());
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
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);

  const activeEmailTemplate = emailTemplates.find(t => t.Key === selectedEmailTemplateKey);
  const [tempEmailValue, setTempEmailValue] = useState(activeEmailTemplate?.Value || '');
  const [emailFrequency, setEmailFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'on_event'>(activeEmailTemplate?.Frequency || 'on_event');
  const [emailSendTime, setEmailSendTime] = useState(activeEmailTemplate?.SendTime || '09:00');
  const [emailTriggerCondition, setEmailTriggerCondition] = useState<'schedule' | 'event' | 'both'>(activeEmailTemplate?.TriggerCondition || 'event');
  const [emailActive, setEmailActive] = useState(activeEmailTemplate?.Active !== false);
  const [emailSaveSuccess, setEmailSaveSuccess] = useState(false);

  // Trigger checkboxes state
  const [triggerTaskAssignment, setTriggerTaskAssignment] = useState(false);
  const [triggerTaskCompletion, setTriggerTaskCompletion] = useState(false);
  const [triggerOverdue, setTriggerOverdue] = useState(false);
  const [triggerScheduled, setTriggerScheduled] = useState(false);

  // Track settings Apply flashes
  const [settingSaveFlash, setSettingSaveFlash] = useState<string | null>(null);
  const [settingErrorFlash, setSettingErrorFlash] = useState<string | null>(null);

  // Default template content for each type
  const getDefaultTemplateContent = (key: string): string => {
    const defaults: Record<string, string> = {
      'template_assigned_email': 'Hello {AssignedToEmail},\n\nYou have been assigned a new task:\n\nTask ID: {TaskID}\nTitle: {Title}\nDescription: {Description}\nPriority: {Priority}\nDue Date: {DueDate}\n\nPlease review and start working on this task.\n\nBest regards,\nPMS Team',
      'template_completion_email': 'Hello {AssignedToEmail},\n\nThe following task has been completed:\n\nTask ID: {TaskID}\nTitle: {Title}\n\nGreat job! The task has been marked as complete.\n\nBest regards,\nPMS Team',
      'template_delayed_email': 'URGENT: Task Overdue Alert\n\nHello {AssignedToEmail},\n\nThe following task is now overdue:\n\nTask ID: {TaskID}\nTitle: {Title}\nDue Date: {DueDate}\nPriority: {Priority}\n\nPlease address this immediately.\n\nBest regards,\nPMS Team',
      'template_scheduled_reminder': 'Scheduled Task Reminder\n\nHello {AssignedToEmail},\n\nThis is a reminder for your scheduled task:\n\nTask ID: {TaskID}\nTitle: {Title}\nDue Date: {DueDate}\nPriority: {Priority}\n\nPlease ensure you complete this task on time.\n\nBest regards,\nPMS Team'
    };
    return defaults[key] || '';
  };

  // Sync state whenever the selected email template type keys changes
  React.useEffect(() => {
    const template = emailTemplates.find(t => t.Key === selectedEmailTemplateKey);
    const freshVal = template?.Value || getDefaultTemplateContent(selectedEmailTemplateKey);
    setTempEmailValue(freshVal);
    setEmailFrequency(template?.Frequency || 'on_event');
    setEmailSendTime(template?.SendTime || '09:00');
    setEmailTriggerCondition(template?.TriggerCondition || 'event');
    setEmailActive(template?.Active !== false);
  }, [selectedEmailTemplateKey, emailTemplates]);

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
    const errors: any[] = [];
    let successCount = 0;
    
    for (const row of csvPreview) {
      const validation = validateCSVRow(row);
      if (!validation.valid) {
        errors.push({ ...row, error: validation.error });
        continue;
      }
      
      try {
        const newId = `USR-${Math.floor(100 + Math.random() * 899)}`;
        const newUser = {
          UserID: newId,
          FullName: row['Full Name'],
          Email: row['Email'].toLowerCase(),
          Role: row['Role'] || 'Stakeholder',
          ManagerEmail: row['Manager Email'] || '',
          TeamIDs: [],
          TeamNames: [],
          Active: true,
          CanCreateFollowUp: true,
          CanCloseTask: true,
          Password: row['Password'] || 'temp123',
          CreatedAt: new Date().toISOString(),
          UpdatedAt: new Date().toISOString()
        };
        
        onAddUser(newUser);
        successCount++;
      } catch (error) {
        errors.push({ ...row, error: 'Failed to create user' });
      }
    }
    
    setCsvErrors(errors);
    setCsvUploadResult({ success: successCount, failed: errors.length });
    setIsProcessingCsv(false);
    setCsvPreview([]);
    setCsvFile(null);
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


  const handleSaveEmailTemplateValue = () => {
    // Save the email template with all settings
    const template = emailTemplates.find(t => t.Key === selectedEmailTemplateKey);
    if (template) {
      const updatedTemplate = {
        ...template,
        Value: tempEmailValue,
        Frequency: emailFrequency,
        SendTime: emailSendTime,
        TriggerCondition: emailTriggerCondition,
        Active: emailActive
      };
      // Update the email template in the settings
      onUpdateSetting(`${selectedEmailTemplateKey}_value`, tempEmailValue);
      onUpdateSetting(`${selectedEmailTemplateKey}_frequency`, emailFrequency);
      onUpdateSetting(`${selectedEmailTemplateKey}_sendTime`, emailSendTime);
      onUpdateSetting(`${selectedEmailTemplateKey}_triggerCondition`, emailTriggerCondition);
      onUpdateSetting(`${selectedEmailTemplateKey}_active`, emailActive.toString());
    } else {
      onUpdateSetting(selectedEmailTemplateKey, tempEmailValue);
    }
    setEmailSaveSuccess(true);
    setTimeout(() => setEmailSaveSuccess(false), 2500);
  };

  const handleInsertToken = (token: string) => {
    const textarea = editorTextareaRef.current;
    if (!textarea) return;

    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const text = tempEmailValue;
    const updated = text.substring(0, startPos) + token + text.substring(endPos);
    
    setTempEmailValue(updated);
    
    // Focus back on textarea and set cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(startPos + token.length, startPos + token.length);
    }, 50);
  };

  // Mock template renderer for Live Preview
  const getSimulatedEmailPreviewStr = () => {
    return tempEmailValue
      .replace(/{TaskID}/g, "TSK-0842-DEMO")
      .replace(/{Title}/g, "Prepare Staging Environment Backups")
      .replace(/{Description}/g, "Complete backup of staging environment before production deployment")
      .replace(/{Priority}/g, "Critical")
      .replace(/{DueDate}/g, "2026-06-25")
      .replace(/{AssignedToEmail}/g, "sales.lead@PMS.com")
      .replace(/{AssignedByEmail}/g, "admin@PMS.com");
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
    <div className={`rounded-xl border border-[#E5E7EB] bg-white overflow-hidden font-sans ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : ''}`}>
      
      {/* Integrated Header - matches Dashboard style */}
      <div className={`px-4 md:px-6 py-4 border-b border-[#E5E7EB] ${isDarkMode ? 'border-[#1E293B]' : ''}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-100'}`}>
              <Shield className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} size={20} />
            </div>
            <div>
              <h3 className={`font-bold text-base md:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Admin Panel</h3>
              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Manage users, teams & templates</p>
            </div>
          </div>

          {/* Tab Navigation - scrollable on mobile */}
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
          </div>
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
                      <div key={req.UserID} className={`border border-[#E5E7EB] bg-white rounded-xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-all ${isDarkMode ? 'bg-[#1E293B] border-amber-500/20' : ''}`}>
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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
              
              {/* Modern Provisioning Form */}
              <div className={`border rounded-xl p-6 space-y-5 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-slate-200'}`}>
                <div className={`flex items-center space-x-3 border-b pb-4 ${isDarkMode ? 'border-[#334155]' : 'border-slate-100'}`}>
                  <div className={`p-2 rounded-lg ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-100'}`}>
                    <Plus size={18} className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} />
                  </div>
                  <h4 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add new user</h4>
                </div>

                {/* Bulk CSV Upload Section */}
                <div className={`p-4 rounded-lg border space-y-3 ${isDarkMode ? 'bg-[#334155] border-[#475569]' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`flex items-center justify-between ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="text-xs font-bold">Bulk CSV Upload</span>
                    <button
                      type="button"
                      onClick={downloadCSVTemplate}
                      className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${isDarkMode ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                    >
                      Download Template
                    </button>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVFileChange}
                    className={`w-full text-xs ${isDarkMode ? 'bg-[#1E293B] border-[#475569] text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                  />
                  {csvPreview.length > 0 && (
                    <div className="space-y-2">
                      <div className={`text-xs font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Preview ({csvPreview.length} rows):
                      </div>
                      <div className={`max-h-32 overflow-y-auto text-xs ${isDarkMode ? 'bg-[#0F141F]' : 'bg-white'} p-2 rounded border ${isDarkMode ? 'border-[#475569]' : 'border-slate-200'}`}>
                        {csvPreview.slice(0, 5).map((row, i) => (
                          <div key={i} className={`py-1 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
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
                        className={`w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white font-bold text-xs py-2 rounded-lg transition-colors`}
                      >
                        {isProcessingCsv ? 'Processing...' : 'Import Users'}
                      </button>
                    </div>
                  )}
                  {csvUploadResult && (
                    <div className={`p-3 rounded-lg text-xs ${csvUploadResult.failed === 0 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
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
                  <div className={`p-4 text-sm rounded-xl font-semibold flex items-center gap-2 ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                    <CheckCircle size={16} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{userSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleUserCreateSubmit} className="space-y-4">
                  <div>
                    <label className={`block text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Full name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Rachel Zane"
                      className={`w-full text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Email address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="rachel@PMS.com"
                      className={`w-full text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Role</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as any)}
                        className={`w-full text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                      >
                        <option value="Admin">Admin</option>
                        <option value="Stakeholder">Stakeholder</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Teams</label>
                      <div className={`space-y-2 max-h-32 overflow-y-auto border rounded-xl p-3 ${isDarkMode ? 'border-[#475569] bg-[#334155]' : 'border-slate-200 bg-slate-50'}`}>
                        {teams.length > 0 ? (
                          teams.map(t => (
                            <label key={t.TeamID} className="flex items-center space-x-2 text-sm cursor-pointer">
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
                                className={`rounded focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-[#475569] bg-[#334155] text-blue-400' : 'border-slate-300 text-blue-600'}`}
                              />
                              <span className={isDarkMode ? 'text-slate-300' : 'text-slate-700'}>{t.TeamName}</span>
                            </label>
                          ))
                        ) : (
                          <p className={`text-sm italic p-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>No teams available</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {role === 'Stakeholder' && (
                    <div>
                      <label className={`block text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manager email</label>
                      <input
                        type="email"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        placeholder="sales.lead@PMS.com"
                        className={`w-full text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                      />
                    </div>
                  )}

                  <div>
                    <label className={`block text-xs font-semibold mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Password</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                      className={`w-full text-sm rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-bold transition-all duration-200 shadow-md cursor-pointer border-none flex items-center justify-center space-x-2"
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
                      className={`w-full text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>
                  <span className={`text-[10px] font-bold tracking-widest font-mono ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>
                    Session Authorization: {users.length} Identities
                  </span>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`} style={{ height: 'calc(100vh - 300px)', minHeight: '400px' }}>
                  <div className="h-full overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className={`${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-50'} sticky top-0 z-10`}>
                        <tr>
                          <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>User</th>
                          <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Teams</th>
                          <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manager</th>
                          <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Role</th>
                          <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Status</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-200'}`}>
                      {users
                        .filter(u =>
                          u.FullName.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Email.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Role.toLowerCase().includes(userSearchText.toLowerCase())
                        )
                        .map(user => {
                          const isBanned = !user.Active;
                          return (
                            <tr 
                              key={user.UserID}
                              className={`hover:bg-slate-50/50 transition-colors ${isBanned ? isDarkMode ? 'bg-red-500/5' : 'bg-red-50/30' : ''}`}
                            >
                              <td className="px-4 py-3">
                                <div>
                                  <div className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{user.FullName}</div>
                                  <div className={`text-xs font-mono ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{user.Email}</div>
                                  <div className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{user.UserID}</div>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {(user.TeamNames || []).map((tName, i) => (
                                    <span key={i} className={`inline-flex items-center border text-[10px] font-bold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-700'}`}>
                                      {tName}
                                    </span>
                                  ))}
                                  {(user.TeamNames || []).length === 0 && (
                                    <span className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No Teams</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {user.ManagerEmail ? (
                                  <span className={`text-xs font-mono ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>{user.ManagerEmail}</span>
                                ) : (
                                  <span className={`text-xs italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Direct</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <select
                                  value={user.Role}
                                  onChange={(e) => onUpdateUserRole(user.Email, e.target.value as any)}
                                  className={`text-xs uppercase font-bold px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer ${isDarkMode ? 'bg-[#1E293B] text-white' : 'bg-white'} ${getRoleBadgeColor(user.Role, isDarkMode)}`}
                                >
                                  <option value="Admin">Admin</option>
                                  <option value="Stakeholder">Stakeholder</option>
                                  <option value="Sub-stakeholder">Sub-stakeholder</option>
                                </select>
                              </td>
                              <td className="px-4 py-3">
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
                        })}
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
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add Team Form */}
              <div className={`border rounded-xl p-5 space-y-4 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                <div className={`flex items-center space-x-1.5 border-b pb-2 ${isDarkMode ? 'border-[#334155] text-white' : 'border-[#E2E8F0] text-[#0F172A]'}`}>
                  <Plus size={16} className={isDarkMode ? 'text-blue-400' : 'text-[#2563EB]'} />
                  <h4 className={`font-extrabold text-xs font-mono ${isDarkMode ? 'text-white' : 'text-[#010915]'}`}>Create new team</h4>
                </div>

                {teamSuccessMessage && (
                  <div className={`p-3 text-xs rounded-lg font-semibold flex items-center gap-1 animate-pulse ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-150'}`}>
                    <CheckCircle size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{teamSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTeamCreateSubmit} className="space-y-4">
                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Team name</label>
                    <input
                      type="text"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Engineering Team"
                      className={`w-full text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Description (optional)</label>
                    <textarea
                      value={teamDescription}
                      onChange={(e) => setTeamDescription(e.target.value)}
                      placeholder="Team description and purpose..."
                      rows={3}
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-extrabold tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
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
                  <table className="w-full text-sm">
                    <thead className={`${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-50'}`}>
                      <tr>
                        <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Team</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Description</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Members</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Status</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-200'}`}>
                      {teams.map(team => {
                        const teamUsers = users.filter(u => u.TeamIDs.includes(team.TeamID));
                        return (
                          <tr key={team.TeamID} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div>
                                <div className={`font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{team.TeamName}</div>
                                <div className={`text-[10px] font-mono ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>{team.TeamID}</div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{team.Description || 'No description'}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-[#2563EB]/10 text-[#2563EB]'}`}>
                                {teamUsers.length} members
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => onToggleTeamStatus(team.TeamID)}
                                className={`text-[10px] font-extrabold tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                                    team.Active
                                    ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-[#ECFDF5] border-emerald-200 text-[#065F46] hover:bg-[#D1FAE5]'
                                    : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-[#FEF2F2] border-red-200 text-[#991B1B] hover:bg-[#FEE2E2]'
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
                                    setSelectedUsersToAdd(new Set());
                                    setSelectedTeamLeaders(new Set());
                                    setSelectedTeamStakeholders(new Set());
                                    setMemberSearchQuery('');
                                    // Load team leaders from settings
                                    const leadersSetting = settings.find(s => s.Key === `team_${team.TeamID}_leaders`);
                                    const leadersFromSettings = leadersSetting?.Value ? leadersSetting.Value.split(',').map(e => e.trim()).filter(Boolean) : [];
                                    setCurrentTeamLeaders(leadersFromSettings.length > 0 ? leadersFromSettings : (team.TeamLeaderEmails || []));
                                    // Load team stakeholders from settings
                                    const stakeholdersSetting = settings.find(s => s.Key === `team_${team.TeamID}_stakeholders`);
                                    const stakeholdersFromSettings = stakeholdersSetting?.Value ? stakeholdersSetting.Value.split(',').map(e => e.trim()).filter(Boolean) : [];
                                    setCurrentTeamStakeholders(stakeholdersFromSettings.length > 0 ? stakeholdersFromSettings : (team.StakeholderEmails || []));
                                  }}
                                  className={`px-2.5 py-1.5 text-[10px] font-bold tracking-wider rounded-lg transition-colors border-none cursor-pointer ${isDarkMode ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}`}
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
                                  className={`px-2.5 py-1.5 text-[10px] font-bold tracking-wider rounded-lg transition-colors border-none cursor-pointer ${isDarkMode ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-700'}`}
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
                    <div className={`text-center text-xs py-8 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      No teams created yet. Create your first team to get started.
                    </div>
                  )}
                </div>

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
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                      <div className="absolute inset-0 bg-black/50" onClick={() => setExpandedTeamId(null)} />
                      <div className={`relative w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl shadow-2xl flex flex-col ${isDarkMode ? 'bg-[#1E293B]' : 'bg-white'}`}>
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
                                            className={`flex-shrink-0 w-5 h-5 rounded focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-[#475569] bg-[#334155] text-blue-400' : 'border-slate-300 text-blue-600'}`}
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
                                      className={`flex-shrink-0 w-5 h-5 rounded focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'border-[#475569] bg-[#334155] text-blue-400' : 'border-slate-300 text-blue-600'}`}
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
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Detailed description instructions</label>
                    <textarea
                      required
                      value={tempDesc}
                      onChange={(e) => setTempDesc(e.target.value)}
                      placeholder="Identify active cluster nodes, map pending anomalies, and verify signature certificates..."
                      rows={3}
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Recurrence rate</label>
                      <select
                        value={tempRecurrence}
                        onChange={(e) => setTempRecurrence(e.target.value as any)}
                        className={`w-full text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#E2E8F0] text-slate-800'}`}
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Half-yearly">Half-yearly</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[9.5px] font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Priority rank</label>
                      <select
                        value={tempPriority}
                        onChange={(e) => setTempPriority(e.target.value as any)}
                        className={`w-full text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#E2E8F0] text-slate-800'}`}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
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
                    <select
                      required
                      value={tempAssignToEmail}
                      onChange={(e) => setTempAssignToEmail(e.target.value)}
                      className={`w-full text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#E2E8F0] text-slate-800'}`}
                    >
                      <option value="">Select recipient email...</option>
                      {users.map(u => (
                        <option key={u.Email} value={u.Email}>{u.FullName} ({u.Email})</option>
                      ))}
                    </select>
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
                      className={`w-full text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-white border-[#E5E7EB] text-slate-800 placeholder-slate-400'}`}
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
                    <div className="col-span-2 text-center text-slate-500 text-xs py-8">
                      No recurrence templates found. Define a blueprint to get started.
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
                  <option value="template_completion_email">Task Completion</option>
                  <option value="template_delayed_email">Overdue Alert</option>
                  <option value="template_scheduled_reminder">Scheduled Task Reminder</option>
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
                  <label className={`block text-[10px] font-mono font-black tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Email content template editor</label>
                  <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Write custom text or HTML code. Click the visual tokens below to quickly inject placeholders at your current cursor!</p>
                </div>

                {/* Interactive Token badges list */}
                <div className={`p-3 rounded-lg border space-y-2 ${isDarkMode ? 'bg-[#334155] border-[#475569]' : 'bg-slate-50 border-slate-150'}`}>
                  <span className={`block text-[8px] font-black font-mono tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Interactive placeholders (click to insert)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { token: "{TaskID}", desc: "Task Identifier Code" },
                      { token: "{Title}", desc: "Checklist Title" },
                      { token: "{Description}", desc: "Task Description" },
                      { token: "{Priority}", desc: "Importance Rank" },
                      { token: "{DueDate}", desc: "Target Due Date" },
                      { token: "{AssignedToEmail}", desc: "Receiver Mail" },
                      { token: "{AssignedByEmail}", desc: "Sender Mail" }
                    ].map(tok => (
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

                <div className="relative">
                  <textarea
                    ref={editorTextareaRef}
                    value={tempEmailValue}
                    onChange={(e) => setTempEmailValue(e.target.value)}
                    rows={10}
                    className="w-full bg-slate-900 border border-slate-800 text-emerald-400 font-mono text-xs p-4 rounded-xl focus:ring-1 focus:ring-emerald-500 focus:outline-none leading-relaxed transition-all resize-none shadow-inner"
                    placeholder="Enter email template layout..."
                  />
                </div>

                {/* Email Template Settings */}
                <div className={`p-4 rounded-lg border space-y-4 ${isDarkMode ? 'bg-[#334155] border-[#475569]' : 'bg-slate-50 border-slate-150'}`}>
                  <span className={`block text-[8px] font-black font-mono tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Email schedule settings</span>

                  {/* Trigger Checkboxes */}
                  <div>
                    <label className={`block text-[10px] font-mono font-bold tracking-widest mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Send on:</label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className={`flex items-center space-x-2 text-xs cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={triggerTaskAssignment}
                          onChange={(e) => setTriggerTaskAssignment(e.target.checked)}
                          className={`rounded focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'border-[#475569] bg-[#334155] text-emerald-400' : 'border-slate-300 text-emerald-600'}`}
                        />
                        <span>Task Assignment</span>
                      </label>
                      <label className={`flex items-center space-x-2 text-xs cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={triggerTaskCompletion}
                          onChange={(e) => setTriggerTaskCompletion(e.target.checked)}
                          className={`rounded focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'border-[#475569] bg-[#334155] text-emerald-400' : 'border-slate-300 text-emerald-600'}`}
                        />
                        <span>Task Completion</span>
                      </label>
                      <label className={`flex items-center space-x-2 text-xs cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={triggerOverdue}
                          onChange={(e) => setTriggerOverdue(e.target.checked)}
                          className={`rounded focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'border-[#475569] bg-[#334155] text-emerald-400' : 'border-slate-300 text-emerald-600'}`}
                        />
                        <span>Overdue</span>
                      </label>
                      <label className={`flex items-center space-x-2 text-xs cursor-pointer ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={triggerScheduled}
                          onChange={(e) => setTriggerScheduled(e.target.checked)}
                          className={`rounded focus:ring-2 focus:ring-emerald-500 ${isDarkMode ? 'border-[#475569] bg-[#334155] text-emerald-400' : 'border-slate-300 text-emerald-600'}`}
                        />
                        <span>Scheduled</span>
                      </label>
                    </div>
                  </div>

                  {/* Schedule Settings (shown only when Scheduled is checked) */}
                  {triggerScheduled && (
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t" style={{ borderColor: isDarkMode ? '#475569' : '#E5E7EB' }}>
                      <div>
                        <label className={`block text-[10px] font-mono font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Frequency</label>
                        <select
                          value={emailFrequency}
                          onChange={(e) => setEmailFrequency(e.target.value as any)}
                          className={`w-full text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#475569] text-white' : 'bg-white border-[#E5E7EB] text-slate-800'}`}
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <label className={`block text-[10px] font-mono font-bold tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Send time (HH:MM)</label>
                        <input
                          type="time"
                          value={emailSendTime}
                          onChange={(e) => setEmailSendTime(e.target.value)}
                          className={`w-full text-xs rounded-lg px-2 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${isDarkMode ? 'bg-[#1E293B] border-[#475569] text-white' : 'bg-white border-[#E5E7EB] text-slate-800'}`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Active Status */}
                  <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: isDarkMode ? '#475569' : '#E5E7EB' }}>
                    <label className={`block text-[10px] font-mono font-bold tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Status</label>
                    <button
                      onClick={() => setEmailActive(!emailActive)}
                      className={`text-[10px] font-extrabold tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
                        emailActive
                          ? isDarkMode ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-[#ECFDF5] border-emerald-200 text-[#065F46] hover:bg-[#D1FAE5]'
                          : isDarkMode ? 'bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20' : 'bg-[#FEF2F2] border-red-200 text-[#991B1B] hover:bg-[#FEE2E2]'
                      }`}
                    >
                      {emailActive ? 'Active' : 'Inactive'}
                    </button>
                  </div>
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
                  <div className={`p-4 rounded-xl border space-y-2 font-mono text-[10px] leading-relaxed mb-4 ${isDarkMode ? 'bg-slate-900/80 border-[#1E293B] text-slate-300' : 'bg-slate-900/80 border-[#1E293B] text-slate-300'}`}>
                    <div>
                      <span className="text-slate-500 uppercase">From:</span> auto_alert@PMS.live
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase">To:</span> {selectedEmailTemplateKey === 'template_assigned_email' ? 'eng.director@PMS.com' : 'sales.lead@PMS.com, admin@PMS.com'}
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase">Subject:</span> {selectedEmailTemplateKey === 'template_assigned_email' 
                        ? 'Simulated Alert Notification: [New Compliance Assignment]' 
                        : 'Simulated Alert Notification: [URGENT DELAY WARNING]'
                      }
                    </div>
                  </div>

                  {/* Mail Body Render Preview */}
                  <div className="bg-white text-slate-800 p-5 rounded-xl min-h-[220px] shadow-inner font-sans border border-slate-200 whitespace-pre-wrap text-xs font-semibold leading-relaxed overflow-y-auto">
                    {getSimulatedEmailPreviewStr() || <span className="text-slate-400 italic">No content configured. Type code inside the composer to view preview.</span>}
                  </div>
                </div>

                <div className={`mt-4 pt-3 border-t text-[9.5px] font-mono font-medium leading-relaxed ${isDarkMode ? 'border-[#1E293B] text-slate-400' : 'border-[#1E293B] text-slate-400'}`}>
                  Notice: Real-time changes above dynamically replace tags inside the simulation thread. Submit or generate tasks to view actual live results in the simulated logs list!
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
