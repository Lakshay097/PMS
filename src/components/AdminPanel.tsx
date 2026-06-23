import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User as UserType, TaskTemplate, AppSetting, Team } from '../types';
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
  isDarkMode?: boolean;
}

export default function AdminPanel({
  users,
  templates,
  settings,
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
  isDarkMode = false,
}: AdminPanelProps) {
  // Master administrative tabs
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'teams' | 'templates' | 'email_templates' | 'settings'>('users');
  
  // Create User state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<typeof ROLE[keyof typeof ROLE]>(ROLE.STAKEHOLDER);
  const [managerEmail, setManagerEmail] = useState('');
  const [teamSelections, setTeamSelections] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [userSuccessMessage, setUserSuccessMessage] = useState<string | null>(null);

  // Create Team state
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamSuccessMessage, setTeamSuccessMessage] = useState<string | null>(null);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);


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
  const [selectedEmailTemplateKey, setSelectedEmailTemplateKey] = useState<'template_assigned_email' | 'template_delayed_email'>('template_assigned_email');
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null);
  
  const activeTemplateSetting = settings.find(s => s.Key === selectedEmailTemplateKey);
  const [tempEmailValue, setTempEmailValue] = useState(activeTemplateSetting?.Value || '');
  const [emailSaveSuccess, setEmailSaveSuccess] = useState(false);

  // Track settings Apply flashes
  const [settingSaveFlash, setSettingSaveFlash] = useState<string | null>(null);
  const [settingErrorFlash, setSettingErrorFlash] = useState<string | null>(null);

  // Sync state whenever the selected email template type keys changes
  React.useEffect(() => {
    const freshVal = settings.find(s => s.Key === selectedEmailTemplateKey)?.Value || '';
    setTempEmailValue(freshVal);
  }, [selectedEmailTemplateKey, settings]);

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

    setUserSuccessMessage(`Identity ${newId} authorized successfully in global memory.`);
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
    onUpdateSetting(selectedEmailTemplateKey, tempEmailValue);
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
    <div className={`rounded-xl border overflow-hidden font-sans ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-slate-200'}`}>
      
      {/* Integrated Header - matches Dashboard style */}
      <div className={`px-4 md:px-6 py-4 border-b ${isDarkMode ? 'border-[#1E293B]' : 'border-slate-200'}`}>
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
            <button
              onClick={() => setActiveAdminSubTab('settings')}
              className={`flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-1.5 rounded-md text-xs font-medium transition-all select-none cursor-pointer whitespace-nowrap ${
                activeAdminSubTab === 'settings'
                  ? 'bg-blue-500 text-white'
                  : isDarkMode
                  ? 'text-slate-400 hover:text-white hover:bg-[#334155]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Settings size={14} />
              <span className="hidden sm:inline">Settings</span>
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
                    <h4 className="font-bold text-sm uppercase tracking-wider">
                      Pending Approvals ({pendingApprovals.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {pendingApprovals.map(req => (
                      <div key={req.UserID} className={`border rounded-xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-md transition-all ${isDarkMode ? 'bg-[#1E293B] border-amber-500/20' : 'bg-white border-amber-200'}`}>
                        <div>
                          <div className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{req.FullName}</div>
                          <div className={`text-xs font-mono mt-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{req.Email}</div>
                          <div className={`text-xs mt-2 p-2 rounded-lg inline-block ${isDarkMode ? 'bg-[#334155] text-slate-300' : 'bg-slate-50 text-slate-500'}`}>
                            Role: <strong className={isDarkMode ? 'text-white' : 'text-slate-800'}>{req.Role}</strong> • Manager: {req.ManagerEmail || "Direct Admin"}
                          </div>
                        </div>
                        <button
                          onClick={() => onApproveUser(req.Email)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider px-5 py-2.5 rounded-xl transition-all shadow-md cursor-pointer border-none flex items-center space-x-2"
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
                  <h4 className={`font-bold text-sm uppercase tracking-wider ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Add New User</h4>
                </div>
                
                {userSuccessMessage && (
                  <div className={`p-4 text-sm rounded-xl font-semibold flex items-center gap-2 ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                    <CheckCircle size={16} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{userSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleUserCreateSubmit} className="space-y-4">
                  <div>
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Full Name</label>
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
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Email</label>
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
                      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Role</label>
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
                      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Teams</label>
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
                      <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manager Email</label>
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
                    <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Password</label>
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
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-3 text-sm font-bold uppercase tracking-wider transition-all duration-200 shadow-md cursor-pointer border-none flex items-center justify-center space-x-2"
                  >
                    <Plus size={16} />
                    <span>Create User</span>
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
                      className={`w-full text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>
                    Session Authorization: {users.length} Identities
                  </span>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                  <table className="w-full text-sm">
                    <thead className={`${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-50'}`}>
                      <tr>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>User</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Teams</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Manager</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Role</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Status</th>
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
                                  className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
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
        )}

        {/* SUBTAB 2: Teams Management */}
        {activeAdminSubTab === 'teams' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add Team Form */}
              <div className={`border rounded-xl p-5 space-y-4 shadow-sm h-fit ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                <div className={`flex items-center space-x-1.5 border-b pb-2 ${isDarkMode ? 'border-[#334155] text-white' : 'border-[#E2E8F0] text-[#0F172A]'}`}>
                  <Plus size={16} className={isDarkMode ? 'text-blue-400' : 'text-[#2563EB]'} />
                  <h4 className={`font-extrabold text-xs uppercase tracking-wider font-mono ${isDarkMode ? 'text-white' : 'text-[#010915]'}`}>Create New Team</h4>
                </div>

                {teamSuccessMessage && (
                  <div className={`p-3 text-xs rounded-lg font-semibold flex items-center gap-1 animate-pulse ${isDarkMode ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-50 border-emerald-150'}`}>
                    <CheckCircle size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                    <span>{teamSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTeamCreateSubmit} className="space-y-4">
                  <div>
                    <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Team Name</label>
                    <input
                      type="text"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Engineering Team"
                      className={`w-full text-xs rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1.5 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Description (Optional)</label>
                    <textarea
                      value={teamDescription}
                      onChange={(e) => setTeamDescription(e.target.value)}
                      placeholder="Team description and purpose..."
                      rows={3}
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Create Team</span>
                  </button>
                </form>
              </div>

              {/* Teams List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className={`font-extrabold text-sm uppercase tracking-wider font-mono ${isDarkMode ? 'text-white' : 'text-[#0F172A]'}`}>All Teams ({teams.length})</h4>
                </div>

                <div className={`border rounded-xl overflow-hidden ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                  <table className="w-full text-sm">
                    <thead className={`${isDarkMode ? 'bg-[#1E293B]' : 'bg-slate-50'}`}>
                      <tr>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Team</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Description</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Members</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Status</th>
                        <th className={`px-4 py-3 text-left font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${isDarkMode ? 'divide-[#334155]' : 'divide-slate-200'}`}>
                      {teams.map(team => {
                        const teamUsers = users.filter(u => u.TeamIDs.includes(team.TeamID));
                        const isExpanded = expandedTeamId === team.TeamID;
                        return (
                          <React.Fragment key={team.TeamID}>
                            <tr className="hover:bg-slate-50/50 transition-colors">
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
                                  className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer ${
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
                                    onClick={() => setExpandedTeamId(isExpanded ? null : team.TeamID)}
                                    className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors border-none cursor-pointer ${isDarkMode ? 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}`}
                                  >
                                    {isExpanded ? 'Hide' : 'Members'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`Are you sure you want to delete the team "${team.TeamName}"? This will remove all member assignments to this team.`)) {
                                        onDeleteTeam(team.TeamID);
                                      }
                                    }}
                                    className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-colors border-none cursor-pointer ${isDarkMode ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-700'}`}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={5} className="px-4 py-3">
                                  <div className={`border rounded-xl p-3.5 space-y-3 shadow-inner ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className={`font-extrabold text-[9px] uppercase tracking-wider font-mono ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                      Manage {team.TeamName} Members
                                    </div>
                                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                                      {teamUsers.map(u => (
                                        <div key={u.UserID} className={`flex justify-between items-center border p-2 rounded-lg text-xs ${isDarkMode ? 'bg-[#0F141F] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                                          <div className="truncate pr-2">
                                            <div className={`font-bold truncate ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{u.FullName}</div>
                                            <div className={`text-[9.5px] font-mono truncate ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{u.Email}</div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveMember(u.Email, team.TeamID, team.TeamName)}
                                            className={`p-1 rounded transition-colors border-none cursor-pointer bg-transparent ${isDarkMode ? 'text-red-400 hover:text-red-300 hover:bg-red-500/20' : 'text-red-500 hover:text-red-700 hover:bg-red-50'}`}
                                            title="Remove from team"
                                          >
                                            <X size={13} />
                                          </button>
                                        </div>
                                      ))}
                                      {teamUsers.length === 0 && (
                                        <div className={`text-xs italic py-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>No members assigned to this team.</div>
                                      )}
                                    </div>
                                    
                                    {/* Add member select dropdown */}
                                    <div className={`flex gap-1.5 pt-1.5 border-t ${isDarkMode ? 'border-[#334155]' : 'border-slate-200'}`}>
                                      <select
                                        id={`add-member-select-${team.TeamID}`}
                                        className={`rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 flex-grow ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-white border-[#CBD5E1] text-slate-700'}`}
                                        defaultValue=""
                                      >
                                        <option value="" disabled>-- Add member --</option>
                                        {users.filter(u => u.Active && !u.TeamIDs.includes(team.TeamID)).map(u => (
                                          <option key={u.UserID} value={u.Email}>{u.FullName}</option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const select = document.getElementById(`add-member-select-${team.TeamID}`) as HTMLSelectElement;
                                          if (select && select.value) {
                                            handleAddMember(select.value, team.TeamID, team.TeamName);
                                            select.value = "";
                                          }
                                        }}
                                        className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[10px] uppercase px-3.5 py-2 rounded-lg border-none cursor-pointer shadow-sm"
                                      >
                                        Add
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
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
                  <h4 className={`font-extrabold text-xs uppercase tracking-wider font-mono ${isDarkMode ? 'text-white' : 'text-[#010915]'}`}>Define New Recurrence Blueprint</h4>
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
                    <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Standard Checklist Title</label>
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
                    <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Detailed Description Instructions</label>
                    <textarea
                      required
                      value={tempDesc}
                      onChange={(e) => setTempDesc(e.target.value)}
                      placeholder="Identify active cluster nodes, map pending anomalies, and verify signature certificates..."
                      rows={3}
                      className={`w-full text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans resize-none ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white placeholder-slate-500' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Recurrence Rate</label>
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
                      <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Priority Rank</label>
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
                      <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Schedule Start Date</label>
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
                    <label className={`block text-[9.5px] font-bold uppercase tracking-widest mb-1 ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>Default Responsible Identity</label>
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
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Synchronize Scheduler</span>
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
                      className={`w-full text-xs rounded-lg pl-9 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white placeholder-slate-500' : 'bg-white border-[#E2E8F0] text-slate-800 placeholder-slate-400'}`}
                    />
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-widest font-mono ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>
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
                              className={`text-[10px] font-extrabold uppercase tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer text-center ${
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
                <h4 className={`font-extrabold text-sm uppercase tracking-wider font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-900'}`}>Automated Email Templates Workbench</h4>
                <p className={`text-xs mt-1 max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Configure structural boilerplate layouts for simulated emails. This allows customizable, client-wide alert configurations that will automatically fire during cycle execution and overdue audits.
                </p>
              </div>
              <div className={`px-3 py-2 rounded-lg border flex gap-1.5 items-center ${isDarkMode ? 'bg-[#1E293B] border-emerald-500/20' : 'bg-white border-emerald-200'}`}>
                <label className={`text-[10px] font-mono font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Active Selector:</label>
                <select
                  value={selectedEmailTemplateKey}
                  onChange={(e) => setSelectedEmailTemplateKey(e.target.value as any)}
                  className={`bg-transparent border-none font-extrabold text-xs focus:ring-0 outline-none cursor-pointer ${isDarkMode ? 'text-emerald-400' : 'text-emerald-800'}`}
                >
                  <option value="template_assigned_email">Task Assignment Alert (HTML/Text)</option>
                  <option value="template_delayed_email">Delayed / Overdue Alert (HTML/Text)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* Left Side: Template Editor Box */}
              <div className={`border p-6 rounded-2xl shadow-sm space-y-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                <div className={`flex justify-between items-center border-b pb-2 ${isDarkMode ? 'border-[#334155]' : 'border-[#E2E8F0]'}`}>
                  <div className="flex items-center space-x-1.5">
                    <Edit className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} size={16} />
                    <h4 className={`font-bold text-xs uppercase tracking-wider font-mono ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>Template Code Composer</h4>
                  </div>
                  <span className={`text-[9.5px] font-mono font-bold uppercase ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`}>{selectedEmailTemplateKey}</span>
                </div>

                <div className="space-y-1">
                  <label className={`block text-[10px] font-mono font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Email Content Template Editor</label>
                  <p className={`text-[10px] ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Write custom text or HTML code. Click the visual tokens below to quickly inject placeholders at your current cursor!</p>
                </div>

                {/* Interactive Token badges list */}
                <div className={`p-3 rounded-lg border space-y-2 ${isDarkMode ? 'bg-[#334155] border-[#475569]' : 'bg-slate-50 border-slate-150'}`}>
                  <span className={`block text-[8px] font-black font-mono uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Interactive Placeholders (Click to insert)</span>
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
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold uppercase tracking-widest px-6 py-2.5 rounded-xl shadow-md cursor-pointer transition-all border-none flex items-center space-x-1.5"
                  >
                    <CheckCircle size={13} />
                    <span>Apply Email Layout</span>
                  </button>
                </div>
              </div>

              {/* Right Side: Live HTML / Text simulated email client card preview */}
              <div className={`border rounded-2xl p-6 flex flex-col justify-between shadow-2xl h-full min-h-[420px] ${isDarkMode ? 'bg-[#0F172A] border-[#1E293B] text-slate-100' : 'bg-[#0F172A] border-[#1E293B] text-slate-100'}`}>
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

        {/* SUBTAB 4: Spreadsheets Global Configuration parameters */}
        {activeAdminSubTab === 'settings' && (
          <div className="space-y-4">
            <div className={`border p-4.5 rounded-xl flex items-start gap-3 ${isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50/70 border-blue-200'}`}>
              <Info className={isDarkMode ? 'text-blue-400' : 'text-blue-600'} size={16} />
              <div className={`text-xs leading-normal ${isDarkMode ? 'text-blue-300' : 'text-blue-900'}`}>
                <strong className="block font-bold">Instruction Parameters Guide:</strong>
                These variables represent physical synchronization values used to control scheduler logic. Changes are applied globally and affect all user role mappings.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {settings.map(st => {
                const isTemplateKey = st.Key.startsWith('template_');
                if (isTemplateKey) return null; // We render templates beautifully in the separate Tab!

                return (
                  <div key={st.Key} className={`border rounded-xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-white border-[#E2E8F0]'}`}>
                    <div className="space-y-1">
                      <span className={`text-[10px] font-mono font-extrabold uppercase tracking-widest block ${isDarkMode ? 'text-slate-400' : 'text-[#64748B]'}`}>PARAMETER REGISTER KEY</span>
                      <span className={`font-extrabold font-mono text-xs ${isDarkMode ? 'text-white' : 'text-[#010915]'}`}>{st.Key}</span>
                    </div>
                    <div className="mt-4 flex items-center space-x-2">
                      <input
                        type="text"
                        defaultValue={st.Value}
                        id={`input-st-${st.Key}`}
                        placeholder="Type value..."
                        className={`flex-1 rounded-lg px-3 py-2 text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'bg-[#334155] border-[#475569] text-white' : 'bg-slate-50 border-[#E2E8F0] text-slate-800'}`}
                      />
                      <button 
                        onClick={() => {
                          const input = document.getElementById(`input-st-${st.Key}`) as HTMLInputElement;
                          if (input && input.value !== st.Value) {
                            onUpdateSetting(st.Key, input.value);
                            setSettingSaveFlash(st.Key);
                            setTimeout(() => setSettingSaveFlash(null), 2000);
                          } else {
                            setSettingErrorFlash(st.Key);
                            setTimeout(() => setSettingErrorFlash(null), 2000);
                          }
                        }}
                        className={`text-white rounded-lg text-xs font-extrabold uppercase tracking-widest px-4 py-2 transition-all cursor-pointer border-none flex items-center space-x-0.5 shrink-0 ${
                          settingSaveFlash === st.Key ? 'bg-emerald-600 hover:bg-emerald-500' :
                          settingErrorFlash === st.Key ? 'bg-amber-600 hover:bg-amber-500' :
                          'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {settingSaveFlash === st.Key ? 'Saved!' : settingErrorFlash === st.Key ? 'No Change' : 'Apply'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
