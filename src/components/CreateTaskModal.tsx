import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, ClipboardList, Repeat, UserPlus, Info, Users, CheckCircle, Upload, File, X as XIcon } from 'lucide-react';
import { User, TaskTemplate, Task, TaskStatus, Team, SubTeam } from '../types';
import { ROLE, isAdminLevel } from '../constants/status';
import { canAssignWithinTeam } from '../utils/subTeamUtils';
import { uploadFile } from '../api/upload';

interface CreateTaskModalProps {
  currentUser: User;
  usersList: User[];
  teamsList?: Team[];
  subTeamsList?: SubTeam[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    Title: string;
    Description: string;
    Priority: 'Low' | 'Medium' | 'High' | 'Critical';
    TaskType: 'One-time' | 'Recurring';
    RecurrenceType: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly' | 'One-time';
    StartDate: string;
    DueDate: string;
    AssignedToEmail: string;
    AssignedToTeamIDs: string[];
    AttachmentLink: string;
  }) => void;
  preSelectedAssignee?: string;
  preSelectedTeamIDs?: string[];
}

export default function CreateTaskModal({ currentUser, usersList, teamsList = [], subTeamsList = [], isOpen, onClose, onSubmit, preSelectedAssignee, preSelectedTeamIDs }: CreateTaskModalProps) {
  const [taskType, setTaskType] = useState<'One-time' | 'Recurring'>('One-time');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [recurrenceType, setRecurrenceType] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly'>('Weekly');
  
  // Track whether user has manually selected a day (for Weekly recurrence)
  const [userSelectedDay, setUserSelectedDay] = useState(false);
  const [manualWeeklyDay, setManualWeeklyDay] = useState<string>('');
  
  // Schedule dates (defaulting to today + offset)
  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(nextWeekStr);
  
  // Compute the weekday name for Weekly recurrence based on start date
  const getWeekdayName = (dateStr: string): string => {
    const date = new Date(dateStr);
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return weekdays[date.getDay()];
  };
  
  const weeklyDayName = userSelectedDay && manualWeeklyDay ? manualWeeklyDay : getWeekdayName(startDate);
  
  // Set initial assignedToEmail based on preSelectedAssignee
  const [assignedToEmail, setAssignedToEmail] = useState(preSelectedAssignee || '');

  // Reset assignedToEmail when modal opens with new preSelectedAssignee
  React.useEffect(() => {
    if (isOpen && preSelectedAssignee) {
      setAssignedToEmail(preSelectedAssignee);
      // Parse comma-separated emails into selectedEmails array
      const emails = typeof preSelectedAssignee === 'string' 
        ? preSelectedAssignee.split(',').map(e => e.trim()).filter(e => e)
        : [String(preSelectedAssignee)];
      setSelectedEmails(emails);
    } else if (isOpen) {
      setSelectedEmails([]);
    }
    if (isOpen && preSelectedTeamIDs && preSelectedTeamIDs.length > 0) {
      setSelectedTeamIDs(preSelectedTeamIDs);
    } else if (isOpen) {
      setSelectedTeamIDs([]);
    }
    // Reset user selection flag when modal opens
    setUserSelectedDay(false);
  }, [isOpen, preSelectedAssignee, preSelectedTeamIDs]);
  
  // Filter eligible assignees based on role and parent team
  // Rule: Admin can assign to anyone. Other roles can only assign within their parent teams
  const filteredAssignees = usersList.filter(user => {
    if (!user.Active) return false;
    
    // Admins can assign to anyone
    if (isAdminLevel(currentUser.Role)) return true;
    
    // For non-admin users, restrict to users in the same parent team
    const currentUserTeams = new Set(currentUser.TeamIDs || []);
    const userInSameTeam = (user.TeamIDs || []).some(tid => currentUserTeams.has(tid));
    
    if (!userInSameTeam) return false;
    
    if (currentUser.Role === ROLE.STAKEHOLDER) {
      return isAdminLevel(user.Role) || user.Role === ROLE.STAKEHOLDER || user.Email.toLowerCase() === currentUser.Email.toLowerCase();
    }
    if (currentUser.Role === ROLE.SUB_STAKEHOLDER) {
      // Use canAssignWithinTeam to check if assignment is allowed
      return canAssignWithinTeam(currentUser, user, subTeamsList, usersList);
    }
    if (currentUser.Role === ROLE.TEAM_LEADER) {
      // Team leaders can assign to anyone in their team (already filtered above)
      return true;
    }
    // Regular members can assign to anyone in their team (already filtered above)
    return true;
  });

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [selectedTeamIDs, setSelectedTeamIDs] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [attachmentLink, setAttachmentLink] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Filter visible teams based on user's parent team membership
  const currentUserTeams = new Set(currentUser.TeamIDs || []);
  const visibleTeams = teamsList.filter(t => {
    if (!t.Active) return false;
    // Admins see all teams
    if (isAdminLevel(currentUser.Role)) return true;
    // Non-admins only see teams they belong to
    return currentUserTeams.has(t.TeamID);
  });

  // Auto-generate title from priority, description and date
  useEffect(() => {
    if (description.trim() && dueDate) {
      // Extract first few words from description (up to 5 words)
      const words = description.trim().split(/\s+/).slice(0, 5);
      const descriptionSnippet = words.join(' ');
      
      // Format date for title
      const dateObj = new Date(dueDate);
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Generate title with priority
      const generatedTitle = `[${priority}] ${descriptionSnippet} - ${formattedDate}`;
      setTitle(generatedTitle);
    }
  }, [description, dueDate, priority]);

  // Filter stakeholders based on search query
  const filteredStakeholders = filteredAssignees.filter(user =>
    user.FullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.Email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.search-dropdown-container')) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Handle file upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    setIsUploading(true);
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

    setUploadedFiles(prev => [...prev, ...newUploadedFiles]);
    setIsUploading(false);
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setValidationError('Title and description are required');
      setTimeout(() => setValidationError(''), 3000);
      return;
    }
    if (selectedEmails.length === 0 && selectedTeamIDs.length === 0) {
      setValidationError('Task must be assigned to at least one stakeholder');
      setTimeout(() => setValidationError(''), 3000);
      return;
    }

    // Upload files if any
    let combinedAttachmentLinks = attachmentLink;
    if (uploadedFiles.length > 0) {
      setIsUploading(true);
      const uploadedUrls: string[] = [];

      // Generate a temporary taskId for upload (will be replaced by actual taskId after task creation)
      const tempTaskId = `TEMP-${Date.now()}`;

      for (const file of uploadedFiles) {
        try {
          const uploadResult = await uploadFile({
            fileName: file.name,
            fileData: file.data,
            mimeType: file.type,
            taskId: tempTaskId,
            reportId: tempTaskId, // Use same temp ID as reportId for validation
          });
          uploadedUrls.push(uploadResult.webViewLink);
        } catch (error: any) {
          console.error('Error uploading file:', error);
          const errorMessage = error?.response?.data?.error || error?.message || `Failed to upload ${file.name}`;
          setValidationError(`Document upload failed: ${errorMessage}. Please remove the file and try again.`);
          setIsUploading(false);
          return; // Stop submission if any file upload fails
        }
      }

      if (uploadedUrls.length > 0) {
        combinedAttachmentLinks = attachmentLink
          ? `${attachmentLink},${uploadedUrls.join(',')}`
          : uploadedUrls.join(',');
      }

      setIsUploading(false);
    }

    onSubmit({
      Title: title,
      Description: description,
      Priority: priority,
      TaskType: taskType,
      RecurrenceType: taskType === 'Recurring' ? recurrenceType : 'One-time',
      StartDate: startDate,
      DueDate: taskType === 'One-time' ? dueDate : startDate,
      AssignedToEmail: selectedEmails.join(', '),
      AssignedToTeamIDs: selectedTeamIDs,
      AttachmentLink: combinedAttachmentLinks
    });

    // Reset fields
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setStartDate(todayStr);
    setDueDate(nextWeekStr);
    setAttachmentLink('');
    setUploadedFiles([]);
    setSelectedEmails([]);
    setSelectedTeamIDs([]);
    setValidationError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-xl sm:rounded-xl shadow-xl border border-[#E5E7EB] w-full max-w-2xl overflow-hidden font-sans flex flex-col max-h-[90vh] sm:max-h-[85vh]"
      >
        <div className="px-4 sm:px-6 py-3 sm:py-4.5 flex items-center justify-between border-b border-[#E5E7EB] bg-white">
          <div className="flex items-center space-x-1.5 sm:space-x-2.5">
            <ClipboardList className="text-[#2563EB]" size={16} />
            <h3 className="font-bold text-sm sm:text-base tracking-tight font-sans text-slate-900">Configure New Task Allocation</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-3 sm:p-6 space-y-3 sm:space-y-4 flex-1 overflow-y-auto">
          {validationError && (
            <div className="bg-red-50 border border-red-200 text-[10px] sm:text-xs px-3 sm:px-4 py-2 sm:py-3 rounded-lg">
              {validationError}
            </div>
          )}
          {/* Task Type Switcher */}
          <div>
            <label className="block text-[9px] sm:text-[10px] font-bold text-[#64748B] tracking-wider mb-1.5 sm:mb-2">
              Task scheduling type
            </label>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setTaskType('One-time')}
                className={`py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg border text-[10px] sm:text-xs font-bold tracking-wider transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer ${
                  taskType === 'One-time'
                    ? 'bg-[#2563EB]/10 border-[#2563EB] text-[#2563EB]'
                    : 'bg-white border-[#E5E7EB] text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Calendar size={12} className="sm:size-3.5" />
                <span className="hidden sm:inline">One-Time Task Allocation</span>
                <span className="sm:hidden">One-Time</span>
              </button>

              <button
                type="button"
                onClick={() => setTaskType('Recurring')}
                className={`py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg border text-[10px] sm:text-xs font-bold tracking-wider transition-all flex items-center justify-center space-x-1.5 sm:space-x-2 cursor-pointer ${
                  taskType === 'Recurring'
                    ? 'bg-[#2563EB]/10 border-[#2563EB] text-[#2563EB]'
                    : 'bg-white border-[#E5E7EB] text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Repeat size={12} className="sm:size-3.5" />
                <span className="hidden sm:inline">Recurring Schedule Blueprint</span>
                <span className="sm:hidden">Recurring</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
              Aesthetic title <span className="text-red-500">*</span>
              <span className="text-blue-500 ml-1">(Auto-generated from description & date)</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Financial Ledger Verification"
              className="w-full text-xs bg-slate-50 border border-[#E5E7EB] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              readOnly
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
              Detailed scope / instructions <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide clean instructions, links to sheets, criteria for closing tasks, compliance expectations, etc."
              className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg p-3 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            ></textarea>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1.5 flex items-center space-x-1">
                <UserPlus size={12} />
                <span>Assigned recipients {selectedTeamIDs.length > 0 ? '(Auto-filled from team)' : '(Multiple allowed)'}</span>
              </label>
              <div className="relative search-dropdown-container">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search stakeholders by name or email..."
                  className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
                {showDropdown && searchQuery && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredStakeholders.length === 0 ? (
                      <div className="p-3 text-slate-400 text-xs italic">No stakeholders found.</div>
                    ) : (
                      filteredStakeholders.map(user => {
                        const isSelected = selectedEmails.includes(user.Email);
                        return (
                          <div
                            key={user.UserID}
                            onClick={() => {
                              if (!isSelected) {
                                setSelectedEmails([...selectedEmails, user.Email]);
                              }
                              setSearchQuery('');
                              setShowDropdown(false);
                            }}
                            className={`p-2.5 cursor-pointer text-xs hover:bg-slate-50 transition-colors ${
                              isSelected ? 'bg-slate-100 opacity-50' : ''
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{user.FullName}</span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {isAdminLevel(currentUser.Role) ? `${user.Role} • ` : ''}{user.Email}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              {selectedEmails.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {selectedEmails.map(email => {
                    const u = usersList.find(usr => usr.Email === email);
                    return (
                      <span key={email} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-blue-200">
                        <span>{u ? u.FullName : email}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEmails(selectedEmails.filter(e => e !== email))}
                          className="text-blue-500 hover:text-blue-800 p-0.5 hover:bg-transparent inline-flex items-center border-none"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Team Assignment */}
            {teamsList && teamsList.length > 0 && (
              <div>
                <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1.5 flex items-center space-x-1">
                  <Users size={12} />
                  <span>Assign to teams (optional, multiple allowed)</span>
                </label>
                <div className="relative search-dropdown-container">
                  <input
                    type="text"
                    value={teamSearchQuery}
                    onChange={(e) => {
                      setTeamSearchQuery(e.target.value);
                      setShowTeamDropdown(true);
                    }}
                    onFocus={() => setShowTeamDropdown(true)}
                    placeholder="Search teams by name..."
                    className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                  {showTeamDropdown && teamSearchQuery && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-[#E2E8F0] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {visibleTeams.filter(t => t.TeamName.toLowerCase().includes(teamSearchQuery.toLowerCase())).length === 0 ? (
                        <div className="p-3 text-slate-400 text-xs italic">No teams found.</div>
                      ) : (
                        visibleTeams.filter(t => t.TeamName.toLowerCase().includes(teamSearchQuery.toLowerCase())).map(team => {
                          const isSelected = selectedTeamIDs.includes(team.TeamID);
                          const teamUsers = usersList.filter(u => u.TeamIDs.includes(team.TeamID) && u.Active);
                          return (
                            <div
                              key={team.TeamID}
                              onClick={() => {
                                if (!isSelected) {
                                  setSelectedTeamIDs([...selectedTeamIDs, team.TeamID]);
                                  const teamMemberEmails = teamUsers.map(u => u.Email);
                                  setSelectedEmails([...new Set([...selectedEmails, ...teamMemberEmails])]);
                                }
                                setTeamSearchQuery('');
                                setShowTeamDropdown(false);
                              }}
                              className={`p-2.5 cursor-pointer text-xs hover:bg-slate-50 transition-colors ${
                                isSelected ? 'bg-slate-100 opacity-50' : ''
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-900">{team.TeamName}</span>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {teamUsers.length} members
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {selectedTeamIDs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedTeamIDs.map(teamId => {
                      const team = teamsList.find(t => t.TeamID === teamId);
                      return (
                        <span key={teamId} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2.5 py-1 rounded-full border border-emerald-200">
                          <span>{team ? team.TeamName : teamId}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTeamIDs(selectedTeamIDs.filter(id => id !== teamId));
                              // Remove team members from selected emails
                              const team = teamsList.find(t => t.TeamID === teamId);
                              if (team) {
                                const teamMemberEmails = usersList
                                  .filter(u => u.TeamIDs.includes(teamId) && u.Active)
                                  .map(u => u.Email);
                                setSelectedEmails(selectedEmails.filter(email => !teamMemberEmails.includes(email)));
                              }
                            }}
                            className="text-emerald-500 hover:text-emerald-800 p-0.5 hover:bg-transparent inline-flex items-center border-none"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                Priority ranking
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              >
                <option value="Low">Low Priority</option>
                <option value="Medium">Medium Priority</option>
                <option value="High">High Priority</option>
                <option value="Critical">Critical Priority</option>
              </select>
            </div>
          </div>

          {/* Conditional Date Panels */}
          {taskType === 'One-time' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                  Due date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-[#E2E8F0] rounded-lg p-4 space-y-3 shadow-inner">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                    Recurrence schedule frequency
                  </label>
                  <select
                    value={recurrenceType}
                    onChange={(e) => {
                      const newValue = e.target.value as any;
                      setRecurrenceType(newValue);
                      // Reset manual selection when switching recurrence types
                      if (newValue !== 'Weekly') {
                        setUserSelectedDay(false);
                        setManualWeeklyDay('');
                      } else {
                        // When switching TO Weekly, allow auto-computation from start date
                        setUserSelectedDay(false);
                        setManualWeeklyDay('');
                      }
                    }}
                    className="w-full text-xs bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  >
                    <option value="Daily">Daily Interval</option>
                    <option value="Weekly">Weekly (Every {weeklyDayName})</option>
                    <option value="Monthly">Monthly Interval</option>
                    <option value="Quarterly">Quarterly Cycle</option>
                    <option value="Half-yearly">Half-yearly Cycle</option>
                  </select>
                </div>

                {recurrenceType === 'Weekly' && (
                  <div>
                    <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                      Weekly recurrence day
                    </label>
                    <select
                      value={userSelectedDay && manualWeeklyDay ? manualWeeklyDay : getWeekdayName(startDate)}
                      onChange={(e) => {
                        setManualWeeklyDay(e.target.value);
                        setUserSelectedDay(true);
                      }}
                      className="w-full text-xs bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                    >
                      <option value="Sunday">Sunday</option>
                      <option value="Monday">Monday</option>
                      <option value="Tuesday">Tuesday</option>
                      <option value="Wednesday">Wednesday</option>
                      <option value="Thursday">Thursday</option>
                      <option value="Friday">Friday</option>
                      <option value="Saturday">Saturday</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
                    First generation start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
              </div>
              <div className="text-[11px] text-[#64748B] leading-relaxed font-sans">
                💡 <strong>Heuristic Scheduler Rule:</strong> The automatic cron scheduler checks templates periodically. Real task records are automatically generated on their recurrence schedule, tracking generation pointers dynamically in the system database.
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] tracking-wider mb-1">
              Attachments (optional)
            </label>
            <div className="space-y-3">
              {/* File Upload */}
              <div className="border-2 border-dashed border-[#E5E7EB] rounded-lg p-4 hover:border-[#2563EB] transition-colors">
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  accept="*/*"
                  className="hidden"
                  id="task-file-upload"
                />
                <label
                  htmlFor="task-file-upload"
                  className="flex flex-col items-center justify-center cursor-pointer"
                >
                  <Upload size={24} className="text-[#64748B] mb-2" />
                  <p className="text-xs text-[#64748B] font-medium">
                    Click to upload files or drag and drop
                  </p>
                  <p className="text-[10px] text-[#94A3B8] text-center mt-1">
                    All file types accepted (Max 10MB each)
                  </p>
                </label>
              </div>

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between bg-slate-50 border border-[#E5E7EB] rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <File size={14} className="text-[#64748B]" />
                        <span className="text-xs text-slate-700 truncate max-w-[200px]">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeUploadedFile(index)}
                        className="text-[#EF4444] hover:text-[#DC2626] transition-colors"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* URL Input */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="url"
                    value={attachmentLink}
                    onChange={(e) => setAttachmentLink(e.target.value)}
                    placeholder="Or paste a URL"
                    className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 sm:pt-4 border-t border-[#E5E7EB] flex items-center justify-end space-x-2 sm:space-x-3 sticky bottom-0 bg-white pb-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3 sm:px-4 py-1.5 sm:py-2 border border-[#E5E7EB] text-slate-700 hover:bg-slate-50 transition-all rounded-lg text-[10px] sm:text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedEmails.length === 0 && selectedTeamIDs.length === 0}
              className="px-4 sm:px-5 py-1.5 sm:py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-[10px] sm:text-xs font-bold transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Allocate task
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
