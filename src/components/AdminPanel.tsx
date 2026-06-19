import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { User as UserType, TaskTemplate, AuditLog, AppSetting, Team } from '../types';
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
  RefreshCw
} from 'lucide-react';

interface AdminPanelProps {
  users: UserType[];
  templates: TaskTemplate[];
  audits: AuditLog[];
  settings: AppSetting[];
  teams: Team[];
  onAddUser: (user: UserType) => void;
  onToggleUserStatus: (email: string) => void;
  onAddTemplate: (template: TaskTemplate) => void;
  onToggleTemplateStatus: (templateId: string) => void;
  onUpdateSetting: (key: string, value: string) => void;
  onUpdateUserRole: (email: string, role: 'Admin' | 'Stakeholder' | 'Sub-stakeholder') => void;
  onApproveUser: (email: string) => void;
  onAddTeam: (team: Team) => void;
  onToggleTeamStatus: (teamId: string) => void;
  onSyncDatabase?: () => void;
  isSyncing?: boolean;
  lastSyncTime?: string;
  dbConnectionStatus?: 'connected' | 'disconnected' | 'error';
}

export default function AdminPanel({
  users,
  templates,
  audits,
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
  onSyncDatabase,
  isSyncing = false,
  lastSyncTime,
  dbConnectionStatus = 'connected',
}: AdminPanelProps) {
  // Master administrative tabs
  const [activeAdminSubTab, setActiveAdminSubTab] = useState<'users' | 'teams' | 'templates' | 'email_templates' | 'audits' | 'settings'>('users');
  
  // Create User state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Admin' | 'Stakeholder'>('Stakeholder');
  const [managerEmail, setManagerEmail] = useState('');
  const [teamSelections, setTeamSelections] = useState<string[]>([]);
  const [password, setPassword] = useState('');
  const [userSuccessMessage, setUserSuccessMessage] = useState<string | null>(null);

  // Create Team state
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamSuccessMessage, setTeamSuccessMessage] = useState<string | null>(null);

  // Search filter inputs
  const [userSearchText, setUserSearchText] = useState('');
  const [auditSearchText, setAuditSearchText] = useState('');
  const [templateSearchText, setTemplateSearchText] = useState('');

  // Define template state
  const [tempTitle, setTempTitle] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [tempCategory, setTempCategory] = useState('Operations');
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
      Category: tempCategory,
      Priority: tempPriority,
      RecurrenceType: tempRecurrence,
      StartDate: tempStartDate || new Date().toISOString().split('T')[0],
      NextGenerationDate: tempStartDate || new Date().toISOString().split('T')[0],
      LastGeneratedDate: null,
      AssignedByEmail: 'admin@trustgrid.com',
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
      .replace(/{Category}/g, "Engineering")
      .replace(/{Priority}/g, "Critical")
      .replace(/{DueDate}/g, "2026-06-25")
      .replace(/{AssignedToEmail}/g, "sales.lead@trustgrid.com")
      .replace(/{AssignedByEmail}/g, "admin@trustgrid.com");
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Admin': return 'bg-red-50 text-red-700 border-red-200';
      case 'Stakeholder': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Sub-stakeholder': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-50 text-slate-700';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-[#E2E8F0] overflow-hidden font-sans">
      
      {/* 1. Header & Real-time Metrics Panels */}
      <div className="bg-[#0F172A] px-6 py-5 border-b border-[#1E293B]">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-red-500/10 rounded-lg">
              <Shield className="text-red-400" size={24} />
            </div>
            <div>
              <h3 className="text-white font-extrabold text-lg tracking-tight font-sans">System Master Workbench</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 uppercase tracking-widest font-mono">Administrative Control Console &bull; Live Memory Session</p>
            </div>
          </div>

          <div className="flex overflow-x-auto gap-1 bg-[#1E293B] rounded-lg p-0.5 w-full lg:w-auto">
            <button
              onClick={() => setActiveAdminSubTab('users')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all select-none cursor-pointer w-full sm:w-auto text-center justify-center ${
                activeAdminSubTab === 'users'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-slate-400 hover:text-[#F8FAFC]'
              }`}
            >
              <Users size={14} />
              <span>Users</span>
            </button>
            <button
              onClick={() => setActiveAdminSubTab('teams')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all select-none cursor-pointer w-full sm:w-auto text-center justify-center ${
                activeAdminSubTab === 'teams'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-slate-400 hover:text-[#F8FAFC]'
              }`}
            >
              <Users size={14} />
              <span>Teams</span>
            </button>
            <button
              onClick={() => setActiveAdminSubTab('templates')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all select-none cursor-pointer w-full sm:w-auto text-center justify-center ${
                activeAdminSubTab === 'templates'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-slate-400 hover:text-[#F8FAFC]'
              }`}
            >
              <Repeat size={14} />
              <span>Templates</span>
            </button>
            <button
              onClick={() => setActiveAdminSubTab('audits')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all select-none cursor-pointer w-full sm:w-auto text-center justify-center ${
                activeAdminSubTab === 'audits'
                  ? 'bg-[#2563EB] text-white shadow-sm'
                  : 'text-slate-400 hover:text-[#F8FAFC]'
              }`}
            >
              <History size={14} />
              <span>Audit Log</span>
            </button>
          </div>
        </div>

        {/* Dynamic statistics analytics strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-5 border-t border-[#1E293B]/60 text-slate-300 font-mono text-xs">
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest block">Users</span>
            <span className="text-xl font-bold font-sans text-white block mt-1">{users.filter(u => u.Active).length} <span className="text-xs text-slate-500 font-normal">Active</span></span>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest block">Teams</span>
            <span className="text-xl font-bold font-sans text-emerald-400 block mt-1">{teams.filter(t => t.Active).length} <span className="text-xs text-slate-500 font-normal font-mono">Active</span></span>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-[#1E293B]">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest block">Templates</span>
            <span className="text-xl font-bold font-sans text-blue-400 block mt-1">{templates.filter(t => t.Active).length} <span className="text-xs text-slate-500 font-normal font-mono">Running</span></span>
          </div>
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-[#1E293B]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest block">Database Sync</span>
              <div className={`w-2 h-2 rounded-full ${
                dbConnectionStatus === 'connected' ? 'bg-emerald-400' : 
                dbConnectionStatus === 'error' ? 'bg-red-400' : 'bg-slate-400'
              }`} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400 font-normal">
                {lastSyncTime ? `Synced ${new Date(lastSyncTime).toLocaleTimeString()}` : 'Not synced'}
              </span>
              {onSyncDatabase && (
                <button
                  onClick={onSyncDatabase}
                  disabled={isSyncing}
                  className="text-cyan-400 hover:text-cyan-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
                  title="Force database synchronization"
                >
                  <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 bg-slate-50/40">
        
        {/* SUBTAB 1: Users Mapping Directory */}
        {activeAdminSubTab === 'users' && (
          <div className="space-y-6">
            
            {/* Pending approvals row if any */}
            {(() => {
              const pendingApprovals = users.filter(u => u.ApprovalStatus === 'pending' && !u.Active);
              if (pendingApprovals.length === 0) return null;
              return (
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-5 space-y-3.5 shadow-xs animate-fade-in">
                  <div className="flex items-center space-x-2 text-amber-800">
                    <Shield size={16} className="text-amber-600 animate-pulse stroke-[2.5]" />
                    <h4 className="font-extrabold text-xs tracking-wider uppercase font-mono">
                      System Access Enrollment Authorization Requests Awaiting Review ({pendingApprovals.length})
                    </h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pendingApprovals.map(req => (
                      <div key={req.UserID} className="bg-white border border-amber-150 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-sm transition-all duration-150">
                        <div>
                          <div className="font-extrabold text-slate-900 text-xs sm:text-sm">{req.FullName}</div>
                          <div className="text-[10px] text-[#2563EB] font-mono font-bold mt-0.5">{req.Email}</div>
                          <div className="text-[10px] text-slate-500 leading-relaxed mt-2 p-1.5 py-1 bg-slate-50 rounded border inline-block">
                            Role Target: <strong className="text-slate-800 font-mono text-[9px] uppercase">{req.Role}</strong> &bull; Manager: {req.ManagerEmail || "Direct Admin Mode"}
                          </div>
                        </div>
                        <button
                          onClick={() => onApproveUser(req.Email)}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-[10px] uppercase tracking-wider px-4 py-2 rounded-lg transition-all shadow-md cursor-pointer border-none flex items-center space-x-1.5"
                        >
                          <CheckSquare size={13} />
                          <span>Approve &amp; Activate</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Provisioning Form */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm h-fit">
                <div className="flex items-center space-x-1.5 border-b border-[#E2E8F0] pb-2 text-[#0F172A]">
                  <Plus size={16} className="text-[#2563EB] stroke-[2.5]" />
                  <h4 className="font-extrabold text-[#010915] text-xs uppercase tracking-wider font-mono">Provision New System Identity</h4>
                </div>
                
                {userSuccessMessage && (
                  <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-150 rounded-lg font-semibold flex items-center gap-1.5 animate-pulse">
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span>{userSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleUserCreateSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5">Full Legal Name</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Rachel Zane"
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5">Official Email Address</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. rachel@trustgrid.com"
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5">Role Authorization</label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value as any)}
                        className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-2 py-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB] cursor-pointer"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Stakeholder">Stakeholder</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5">Teams (Multiple Selection)</label>
                      <div className="space-y-2 max-h-32 overflow-y-auto border border-[#E2E8F0] rounded-lg p-2 bg-white">
                        {teams.map(t => (
                          <label key={t.TeamID} className="flex items-center space-x-2 text-xs cursor-pointer">
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
                              className="rounded border-[#E2E8F0] text-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
                            />
                            <span className="text-slate-800">{t.TeamName}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {role === 'Stakeholder' && (
                    <div>
                      <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5 flex justify-between">
                        <span>Reporting Manager (Optional)</span>
                        <span className="text-[8px] text-indigo-600 font-normal lowercase tracking-normal">Requires Email Match</span>
                      </label>
                      <input
                        type="email"
                        value={managerEmail}
                        onChange={(e) => setManagerEmail(e.target.value)}
                        placeholder="sales.lead@trustgrid.com"
                        className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5">Password (Min 6 characters)</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Authorize Profile</span>
                  </button>
                </form>
              </div>

              {/* Advanced Directory List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={userSearchText}
                      onChange={(e) => setUserSearchText(e.target.value)}
                      placeholder="Search mapping name, email, or role..."
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg pl-9 pr-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>
                  <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-widest font-mono">
                    Session Authorization: {users.length} Identities
                  </span>
                </div>

                <div className="border border-[#E2E8F0] bg-white rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-extrabold uppercase tracking-widest text-[9px] font-mono">
                        <th className="px-4 py-3.5">Details</th>
                        <th className="px-4 py-3.5">Scopes Option</th>
                        <th className="px-4 py-3.5">Reporting Line</th>
                        <th className="px-4 py-3.5">Interactive Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-slate-700">
                      {users
                        .filter(u =>
                          u.FullName.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Email.toLowerCase().includes(userSearchText.toLowerCase()) ||
                          u.Role.toLowerCase().includes(userSearchText.toLowerCase())
                        )
                        .map(user => (
                          <tr key={user.UserID} className={`hover:bg-slate-50/40 transition-colors ${!user.Active ? 'bg-red-50/10' : ''}`}>
                            <td className="px-4 py-3.5">
                              <div className="font-extrabold text-slate-900 text-xs sm:text-sm">{user.FullName}</div>
                              <div className="text-[10px] text-[#475569] font-mono mt-0.5">{user.Email}</div>
                              <div className="text-[9.5px] text-slate-400 mt-1 uppercase font-semibold font-mono tracking-wider">TEAM: {user.TeamNames.join(', ')}</div>
                            </td>
                            <td className="px-4 py-3.5">
                              <select
                                value={user.Role}
                                onChange={(e) => onUpdateUserRole(user.Email, e.target.value as any)}
                                className={`text-[9.5px] uppercase font-mono font-bold px-2 py-1 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer bg-white ${getRoleBadgeColor(user.Role)}`}
                              >
                                <option value="Admin">Admin</option>
                                <option value="Stakeholder">Stakeholder</option>
                                <option value="Sub-stakeholder">Sub-stakeholder</option>
                              </select>
                            </td>
                            <td className="px-4 py-3.5 text-[10.5px] text-[#0F172A] font-mono font-semibold">
                              {user.ManagerEmail ? (
                                <span className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{user.ManagerEmail}</span>
                              ) : (
                                <span className="text-slate-300 font-normal italic">-- Direct Node --</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <button
                                onClick={() => onToggleUserStatus(user.Email)}
                                className={`w-full text-[10px] font-extrabold uppercase tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer text-center ${
                                  user.Active
                                    ? 'bg-[#ECFDF5] border-emerald-200 text-[#065F46] hover:bg-[#D1FAE5]'
                                    : 'bg-[#FEF2F2] border-red-200 text-[#991B1B] hover:bg-[#FEE2E2]'
                                }`}
                              >
                                {user.Active ? '● Active' : '■ Banned'}
                              </button>
                            </td>
                          </tr>
                        ))}
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
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm h-fit">
                <div className="flex items-center space-x-1.5 border-b border-[#E2E8F0] pb-2 text-[#0F172A]">
                  <Plus size={16} className="text-[#2563EB] stroke-[2.5]" />
                  <h4 className="font-extrabold text-[#010915] text-xs uppercase tracking-wider font-mono">Create New Team</h4>
                </div>

                {teamSuccessMessage && (
                  <div className="p-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-150 rounded-lg font-semibold flex items-center gap-1 animate-pulse">
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span>{teamSuccessMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTeamCreateSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5">Team Name</label>
                    <input
                      type="text"
                      required
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="e.g. Engineering Team"
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1.5">Description (Optional)</label>
                    <textarea
                      value={teamDescription}
                      onChange={(e) => setTeamDescription(e.target.value)}
                      placeholder="Team description and purpose..."
                      rows={3}
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB] font-sans resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
                  >
                    <Plus size={14} />
                    <span>Create Team</span>
                  </button>
                </form>
              </div>

              {/* Teams List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-[#0F172A] text-sm uppercase tracking-wider font-mono">All Teams ({teams.length})</h4>
                </div>

                <div className="border border-[#E2E8F0] bg-white rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-extrabold uppercase tracking-widest text-[9px] font-mono">
                        <th className="px-4 py-3.5">Team Details</th>
                        <th className="px-4 py-3.5">Members</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-4 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-slate-700">
                      {teams.map(team => (
                        <tr key={team.TeamID} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="font-extrabold text-slate-900 text-xs sm:text-sm">{team.TeamName}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{team.Description || 'No description'}</div>
                            <div className="text-[9.5px] text-slate-400 mt-1 font-mono">{team.TeamID}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-bold text-slate-800">
                              {users.filter(u => u.TeamIDs.includes(team.TeamID)).length} members
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => onToggleTeamStatus(team.TeamID)}
                              className={`w-full text-[10px] font-extrabold uppercase tracking-widest py-1.5 px-3 rounded-lg border transition-all cursor-pointer text-center ${
                                team.Active
                                  ? 'bg-[#ECFDF5] border-emerald-200 text-[#065F46] hover:bg-[#D1FAE5]'
                                  : 'bg-[#FEF2F2] border-red-200 text-[#991B1B] hover:bg-[#FEE2E2]'
                              }`}
                            >
                              {team.Active ? '● Active' : '■ Inactive'}
                            </button>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <span className="text-[9.5px] text-slate-400 font-mono">{new Date(team.CreatedAt).toLocaleDateString()}</span>
                          </td>
                        </tr>
                      ))}
                      {teams.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-500 text-xs">
                            No teams created yet. Create your first team to get started.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: Recurrence Blueprints Scheduler */}
        {activeAdminSubTab === 'templates' && (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Add Recurrence Blueprint Form */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 space-y-4 shadow-sm h-fit">
                <div className="flex items-center space-x-1.5 border-b border-[#E2E8F0] pb-2 text-[#0F172A]">
                  <Plus size={16} className="text-[#2563EB] stroke-[2.5]" />
                  <h4 className="font-extrabold text-[#010915] text-xs uppercase tracking-wider font-mono">Define New Recurrence Blueprint</h4>
                </div>

                {templateSuccessMessage && (
                  <div className="p-3 text-xs text-emerald-850 bg-emerald-50 border border-emerald-150 rounded-lg font-bold flex items-center gap-1 animate-pulse">
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span>{templateSuccessMessage}</span>
                  </div>
                )}

                {templateErrorMessage && (
                  <div className="p-3 text-xs text-red-850 bg-red-50 border border-red-150 rounded-lg font-bold flex items-center gap-1 animate-pulse">
                    <AlertCircle size={14} className="text-red-600" />
                    <span>{templateErrorMessage}</span>
                  </div>
                )}

                <form onSubmit={handleTemplateCreateSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1">Standard Checklist Title</label>
                    <input
                      type="text"
                      required
                      value={tempTitle}
                      onChange={(e) => setTempTitle(e.target.value)}
                      placeholder="e.g. Fortnightly SOC2 Assets Audit"
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1">Detailed Description Instructions</label>
                    <textarea
                      required
                      value={tempDesc}
                      onChange={(e) => setTempDesc(e.target.value)}
                      placeholder="Identify active cluster nodes, map pending anomalies, and verify signature certificates..."
                      rows={3}
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB] font-sans resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1">Recurrence Rate</label>
                      <select
                        value={tempRecurrence}
                        onChange={(e) => setTempRecurrence(e.target.value as any)}
                        className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-2 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB] cursor-pointer"
                      >
                        <option value="Daily">Daily</option>
                        <option value="Weekly">Weekly</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Half-yearly">Half-yearly</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1">Category</label>
                      <select
                        value={tempCategory}
                        onChange={(e) => setTempCategory(e.target.value)}
                        className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-2 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB] cursor-pointer"
                      >
                        <option value="Operations">Operations</option>
                        <option value="Finance">Finance</option>
                        <option value="Sales">Sales</option>
                        <option value="Engineering">Engineering</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1">Priority Rank</label>
                      <select
                        value={tempPriority}
                        onChange={(e) => setTempPriority(e.target.value as any)}
                        className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-2 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB] cursor-pointer"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Critical">Critical</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1">Schedule Start Date</label>
                      <input
                        type="date"
                        required
                        value={tempStartDate}
                        onChange={(e) => setTempStartDate(e.target.value)}
                        className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-2 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB] cursor-pointer"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[9.5px] font-bold text-[#64748B] uppercase tracking-widest mb-1">Default Responsible Identity</label>
                    <select
                      required
                      value={tempAssignToEmail}
                      onChange={(e) => setTempAssignToEmail(e.target.value)}
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-2 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB] cursor-pointer"
                    >
                      <option value="">Select recipient email...</option>
                      {users.map(u => (
                        <option key={u.Email} value={u.Email}>{u.FullName} ({u.Email})</option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg py-2.5 text-xs font-extrabold uppercase tracking-widest transition-all duration-150 shadow-md cursor-pointer border-none flex items-center justify-center space-x-1"
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
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input
                      type="text"
                      value={templateSearchText}
                      onChange={(e) => setTemplateSearchText(e.target.value)}
                      placeholder="Search blueprints title or recipient..."
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg pl-9 pr-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    />
                  </div>
                  <span className="text-[10px] text-[#64748B] font-bold uppercase tracking-widest font-mono">
                    Blueprints Matrix: {templates.length} Scheduler Threads
                  </span>
                </div>

                <div className="border border-[#E2E8F0] rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-left border-collapse text-xs animate-fade-in">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-extrabold uppercase tracking-widest text-[9px] font-mono">
                        <th className="px-4 py-3.5 w-[40%]">Blueprints Details</th>
                        <th className="px-4 py-3.5">Interval / Rate</th>
                        <th className="px-4 py-3.5">Assigned Target</th>
                        <th className="px-4 py-3.5 text-center">Next Run</th>
                        <th className="px-4 py-3.5 text-center">Switch Toggle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9] text-slate-700">
                      {templates
                        .filter(t => 
                          t.Title.toLowerCase().includes(templateSearchText.toLowerCase()) ||
                          t.AssignedToEmail.toLowerCase().includes(templateSearchText.toLowerCase()) ||
                          t.Category.toLowerCase().includes(templateSearchText.toLowerCase())
                        )
                        .map(tmp => (
                          <tr key={tmp.TemplateID} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="font-extrabold text-[#0F172A] text-xs sm:text-sm">{tmp.Title}</div>
                              <div className="text-[10px] text-slate-500 mt-1 max-w-sm line-clamp-2 leading-relaxed">
                                {tmp.Description}
                              </div>
                              <div className="text-[9.5px] text-[#64748B] font-mono mt-1 w-fit bg-slate-100 rounded px-1.5 py-0.5">
                                ID: {tmp.TemplateID} &bull; PRIORITY: {tmp.Priority}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md border border-indigo-200 font-extrabold uppercase tracking-wider font-mono">
                                {tmp.RecurrenceType}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="font-bold text-slate-800 font-sans">{tmp.AssignedToEmail}</div>
                              <div className="text-[9px] text-[#475569] uppercase font-mono mt-1 font-bold">
                                SCOPE: {tmp.AssignedToRole}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-center text-[#2563EB] font-mono font-extrabold text-[11px]">
                              {tmp.NextGenerationDate}
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <button
                                onClick={() => onToggleTemplateStatus(tmp.TemplateID)}
                                className={`w-full text-[10px] font-extrabold uppercase tracking-widest py-1.5 px-2.5 rounded-lg border transition-all cursor-pointer text-center ${
                                  tmp.Active
                                    ? 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                                    : 'bg-slate-100 border-slate-300 text-slate-500 hover:bg-slate-200'
                                }`}
                              >
                                {tmp.Active ? 'Enabled' : 'Disabled'}
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 3: Specialized Email Template Customisation Workbench (STRICTLY REQUESTED CEILING OPTION) */}
        {activeAdminSubTab === 'email_templates' && (
          <div className="space-y-5 animate-fade-in">
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h4 className="font-extrabold text-emerald-900 text-sm uppercase tracking-wider font-mono">Automated Email Templates Workbench</h4>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl">
                  Configure structural boilerplate layouts for simulated emails. This allows customizable, client-wide alert configurations that will automatically fire during cycle execution and overdue audits.
                </p>
              </div>
              <div className="bg-white px-3 py-2 rounded-lg border border-emerald-200 flex gap-1.5 items-center">
                <label className="text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest">Active Selector:</label>
                <select
                  value={selectedEmailTemplateKey}
                  onChange={(e) => setSelectedEmailTemplateKey(e.target.value as any)}
                  className="bg-transparent border-none text-emerald-800 font-extrabold text-xs focus:ring-0 outline-none cursor-pointer"
                >
                  <option value="template_assigned_email">Task Assignment Alert (HTML/Text)</option>
                  <option value="template_delayed_email">Delayed / Overdue Alert (HTML/Text)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              
              {/* Left Side: Template Editor Box */}
              <div className="bg-white border border-[#E2E8F0] p-6 rounded-2xl shadow-sm space-y-4">
                <div className="flex justify-between items-center border-b border-[#E2E8F0] pb-2">
                  <div className="flex items-center space-x-1.5">
                    <Edit className="text-emerald-600" size={16} />
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider font-mono">Template Code Composer</h4>
                  </div>
                  <span className="text-[9.5px] text-slate-400 font-mono font-bold uppercase">{selectedEmailTemplateKey}</span>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] font-mono font-black text-slate-500 uppercase tracking-widest">Email Content Template Editor</label>
                  <p className="text-[10px] text-slate-400">Write custom text or HTML code. Click the visual tokens below to quickly inject placeholders at your current cursor!</p>
                </div>

                {/* Interactive Token badges list */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-150 space-y-2">
                  <span className="block text-[8px] font-black font-mono text-slate-400 uppercase tracking-widest">Interactive Placeholders (Click to insert)</span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { token: "{TaskID}", desc: "Task Identifier Code" },
                      { token: "{Title}", desc: "Checklist Title" },
                      { token: "{Category}", desc: "Subject Domain" },
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
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-150 text-[10px] sm:text-[11px] font-mono font-extrabold px-2 py-1 rounded transition-all cursor-pointer select-none"
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
                      <span className="text-emerald-600 text-xs font-bold flex items-center space-x-1 animate-pulse">
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
              <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-6 text-slate-100 flex flex-col justify-between shadow-2xl h-full min-h-[420px]">
                <div>
                  <div className="flex items-center justify-between border-b border-[#1E293B] pb-4 mb-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500" />
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono font-bold tracking-widest uppercase">SIMULATED EMAIL CLIENT AGENT v2.1</span>
                  </div>

                  {/* Simulated Mail Header */}
                  <div className="bg-slate-900/80 p-4 rounded-xl border border-[#1E293B] space-y-2 text-slate-300 font-mono text-[10px] leading-relaxed mb-4">
                    <div>
                      <span className="text-slate-500 uppercase">From:</span> auto_alert@trustgrid.live
                    </div>
                    <div>
                      <span className="text-slate-500 uppercase">To:</span> {selectedEmailTemplateKey === 'template_assigned_email' ? 'eng.director@trustgrid.com' : 'sales.lead@trustgrid.com, admin@trustgrid.com'}
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

                <div className="mt-4 pt-3 border-t border-[#1E293B] text-[9.5px] text-slate-400 font-mono font-medium leading-relaxed">
                  Notice: Real-time changes above dynamically replace tags inside the simulation thread. Submit or generate tasks to view actual live results in the simulated logs list!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 4: Central Audit trail logs list */}
        {activeAdminSubTab === 'audits' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-extrabold text-[#0F172A] text-sm uppercase tracking-wider font-mono">Central Audit Trail Ledger</h4>
                <p className="text-xs text-slate-500">Append-only row registers tracking system state transitions.</p>
              </div>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                <input
                  type="text"
                  value={auditSearchText}
                  onChange={(e) => setAuditSearchText(e.target.value)}
                  placeholder="Filter logs by action, table, or actor..."
                  className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg pl-9 pr-3 py-2.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>
            </div>

            {/* Terminal themed display */}
            <div className="bg-[#0F172A] border border-[#1E293B] rounded-2xl p-5 font-mono text-[11px] text-[#CBD5E1] max-h-[500px] overflow-y-auto space-y-3.5 shadow-2xl">
              <div className="text-slate-500 border-b border-[#1E293B] pb-2 flex justify-between select-none">
                <span>[TIMESTAMP] SYSTEM REGISTRY LOG ENTRY</span>
                <span>SYSTEM LOG MONITOR</span>
              </div>
              {audits
                .filter(log =>
                  log.ActionByEmail.toLowerCase().includes(auditSearchText.toLowerCase()) ||
                  log.Action.toLowerCase().includes(auditSearchText.toLowerCase()) ||
                  log.EntityID.includes(auditSearchText) ||
                  log.OldValueJSON.toLowerCase().includes(auditSearchText.toLowerCase()) ||
                  log.NewValueJSON.toLowerCase().includes(auditSearchText.toLowerCase())
                )
                .map(log => (
                  <div key={log.LogID} className="border-b border-[#1E293B]/40 pb-2.5 space-y-1 shadow-xs select-text">
                    <div className="flex justify-between text-slate-400">
                      <span className="text-emerald-400 font-extrabold">[{log.ActionDateTime}]</span>
                      <span className="text-sky-400 font-semibold uppercase">ID: {log.LogID}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-350">
                      <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded font-extrabold text-[10px] uppercase font-mono tracking-wider">
                        {log.EntityType.toUpperCase()}
                      </span>
                      <span className="text-slate-500">ENTITY:</span>
                      <span className="text-white font-extrabold font-mono">{log.EntityID}</span>
                      <span className="text-slate-500">ACTION:</span>
                      <span className="text-yellow-400 font-extrabold font-sans text-xs">{log.Action}</span>
                      <span className="text-slate-500">BY:</span>
                      <span className="text-amber-400 font-semibold">{log.ActionByEmail}</span>
                    </div>
                    {log.OldValueJSON && (
                      <div className="text-rose-450 pl-4 text-xs font-mono leading-relaxed truncate">
                        <span className="text-rose-500 font-black">&#8722; Old State Value:</span> {log.OldValueJSON}
                      </div>
                    )}
                    {log.NewValueJSON && (
                      <div className="text-emerald-450 pr-2 pl-4 text-xs font-mono leading-relaxed truncate">
                        <span className="text-emerald-400 font-black">&#43; New State Value:</span> {log.NewValueJSON}
                      </div>
                    )}
                  </div>
                ))}
              {audits.length === 0 && (
                <div className="text-center py-6 text-slate-500">
                  No registry logs match search parameters.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SUBTAB 5: Spreadsheets Global Configuration parameters */}
        {activeAdminSubTab === 'settings' && (
          <div className="space-y-4">
            <div className="bg-blue-50/70 border border-blue-200 p-4.5 rounded-xl flex items-start gap-3">
              <Info className="text-blue-600 mt-0.5 shrink-0" size={16} />
              <div className="text-xs text-blue-900 leading-normal">
                <strong className="block font-bold">Instruction Parameters Guide:</strong>
                These variables represent physical synchronization values used to control scheduler logic. Changes are applied globally and affect all user role mappings.
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {settings.map(st => {
                const isTemplateKey = st.Key.startsWith('template_');
                if (isTemplateKey) return null; // We render templates beautifully in the separate Tab!

                return (
                  <div key={st.Key} className="bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col justify-between shadow-sm hover:shadow-md transition-shadow">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-[#64748B] font-extrabold uppercase tracking-widest block">PARAMETER REGISTER KEY</span>
                      <span className="font-extrabold text-[#010915] font-mono text-xs">{st.Key}</span>
                    </div>
                    <div className="mt-4 flex items-center space-x-2">
                      <input
                        type="text"
                        defaultValue={st.Value}
                        id={`input-st-${st.Key}`}
                        placeholder="Type value..."
                        className="flex-1 bg-slate-50 border border-[#E2E8F0] rounded-lg px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
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
                          'bg-[#2563EB] hover:bg-[#1d4ed8]'
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
