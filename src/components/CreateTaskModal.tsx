import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, ClipboardList, Repeat, UserPlus, Info, Users, CheckCircle, Upload, File, X as XIcon } from 'lucide-react';
import { User, TaskTemplate, Task, TaskStatus, Team, SubTeam } from '../types';
import { ROLE, isAdminLevel } from '../constants/status';
import { canAssignWithinTeam } from '../utils/subTeamUtils';
import { uploadFile } from '../api/upload';
import { useTheme } from '../contexts/ThemeContext';

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
  const { isDarkMode } = useTheme();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-2 sm:p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-[#0E1320] rounded-2xl shadow-2xl border border-[#212A3D] w-full max-w-[560px] overflow-hidden font-sans flex flex-col max-h-[88vh]"
        style={{
          background: 'linear-gradient(180deg, #0E1320 0%, #0B0F1A 100%)',
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02) inset'
        }}
      >
        <div className="px-6 py-5.5 flex items-center justify-between border-b border-[#212A3D]">
          <div className="flex items-center gap-3">
            <div className="w-8.5 h-8.5 rounded-lg bg-[rgba(76,110,245,0.12)] border border-[rgba(76,110,245,0.35)] flex items-center justify-center text-[#4C6EF5]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="18" height="18">
                <rect x="6" y="4" width="12" height="17" rx="2"/>
                <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>
                <path d="M9 12h6M9 16h4"/>
              </svg>
            </div>
            <h3 className="font-semibold text-[17px] text-[#EDF0F7] tracking-tight" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Configure New Task Allocation</h3>
          </div>
          <button 
            onClick={onClose} 
            className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-[#5C6478] bg-transparent border border-transparent hover:bg-[#131928] hover:text-[#EDF0F7] hover:border-[#29334A] transition-all cursor-pointer"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5.5 space-y-5 flex-1 overflow-y-auto" style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#29334A transparent'
        }}>
          {validationError && (
            <div className="bg-[rgba(240,87,122,0.1)] border border-[rgba(240,87,122,0.3)] text-[12.5px] px-4 py-3 rounded-lg text-[#F0577A]">
              {validationError}
            </div>
          )}
          {/* Task Type Switcher */}
          <div>
            <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2.5 flex items-center gap-1.5">
              Task scheduling type
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTaskType('One-time')}
                className={`py-3 px-3.5 rounded-[10px] border text-[13.5px] font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  taskType === 'One-time'
                    ? 'bg-[rgba(76,110,245,0.12)] border-[#4C6EF5] text-[#9FB4FF] shadow-[0_0_0_3px_rgba(76,110,245,0.28)_inset,0_4px_14px_-6px_rgba(76,110,245,0.28)]'
                    : 'bg-[#131928] border-[#29334A] text-[#9AA3B8] hover:bg-[#171F32] hover:text-[#EDF0F7]'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
                  <rect x="3" y="5" width="18" height="16" rx="2"/>
                  <path d="M3 10h18M8 3v4M16 3v4"/>
                </svg>
                One-Time Task Allocation
              </button>

              <button
                type="button"
                onClick={() => setTaskType('Recurring')}
                className={`py-3 px-3.5 rounded-[10px] border text-[13.5px] font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  taskType === 'Recurring'
                    ? 'bg-[rgba(76,110,245,0.12)] border-[#4C6EF5] text-[#9FB4FF] shadow-[0_0_0_3px_rgba(76,110,245,0.28)_inset,0_4px_14px_-6px_rgba(76,110,245,0.28)]'
                    : 'bg-[#131928] border-[#29334A] text-[#9AA3B8] hover:bg-[#171F32] hover:text-[#EDF0F7]'
                }`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="15" height="15">
                  <path d="M17 2l4 4-4 4"/>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                  <path d="M7 22l-4-4 4-4"/>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                </svg>
                Recurring Schedule Blueprint
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2 flex items-center gap-1.5">
              Title <span className="text-[#F0577A]">*</span>
              <span className="text-[#4C6EF5] opacity-85 text-[12px] font-medium">(Auto-generated from description & date)</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="[Medium] d - Aug 7"
              className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] px-3.5 py-3 text-[#EDF0F7] placeholder-[#4B5468] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] transition-all"
              readOnly
              style={{ fontStyle: 'normal' }}
            />
          </div>

          <div>
            <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
              Detailed scope / instructions <span className="text-[#F0577A]">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide clean instructions, links to sheets, criteria for closing tasks, compliance expectations, etc."
              className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] p-3.5 text-[#EDF0F7] placeholder-[#4B5468] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] transition-all resize-y min-h-[96px] leading-relaxed"
              style={{ fontFamily: 'Inter, sans-serif' }}
            ></textarea>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2 flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14" className="text-[#5C6478]">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <span>Assigned recipients (Multiple allowed)</span>
              </label>
              {/* Raise this wrapper's stacking context while the results are open so the
                  dropdown paints above the Priority select and date fields below it. */}
              <div className={`relative search-dropdown-container ${showDropdown ? 'z-30' : ''}`}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Search stakeholders by name or email..."
                  className="w-full text-[14px] rounded-[10px] px-3.5 py-3 focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] bg-[#131928] border-[#29334A] text-[#EDF0F7] placeholder-[#4B5468] hover:bg-[#171F32] transition-all"
                />
                {showDropdown && searchQuery && (
                  <div className="absolute z-30 w-full mt-1 border rounded-lg shadow-lg max-h-48 overflow-y-auto bg-[#131928] border-[#29334A]">
                    {filteredStakeholders.length === 0 ? (
                      <div className="p-3 text-[#9AA3B8] text-[12.5px] italic">No stakeholders found.</div>
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
                            className={`p-2.5 cursor-pointer text-[12.5px] hover:bg-[#171F32] transition-colors ${
                              isSelected ? 'bg-[#171F32] opacity-50' : ''
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-[#EDF0F7]">{user.FullName}</span>
                              <span className="text-[10px] text-[#5C6478] font-mono">
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
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedEmails.map(email => {
                    const u = usersList.find(usr => usr.Email === email);
                    return (
                      <span key={email} className="inline-flex items-center gap-1.5 bg-[#17223D] border border-[#2C3F6E] text-[#8FB2FF] text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
                        <span>{u ? u.FullName : email}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedEmails(selectedEmails.filter(e => e !== email))}
                          className="w-4 h-4 rounded-full bg-[rgba(143,178,255,0.14)] text-[#8FB2FF] flex items-center justify-center hover:bg-[rgba(143,178,255,0.28)] transition-colors border-none"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
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
                <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2 flex items-center gap-1.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14" className="text-[#5C6478]">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span>Assign to teams (optional, multiple allowed)</span>
                </label>
                {/* Same fix for the team results dropdown. */}
                <div className={`relative search-dropdown-container ${showTeamDropdown ? 'z-30' : ''}`}>
                  <input
                    type="text"
                    value={teamSearchQuery}
                    onChange={(e) => {
                      setTeamSearchQuery(e.target.value);
                      setShowTeamDropdown(true);
                    }}
                    onFocus={() => setShowTeamDropdown(true)}
                    placeholder="Search teams by name..."
                    className="w-full text-[14px] rounded-[10px] px-3.5 py-3 focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] bg-[#131928] border-[#29334A] text-[#EDF0F7] placeholder-[#4B5468] hover:bg-[#171F32] transition-all"
                  />
                  {showTeamDropdown && teamSearchQuery && (
                    <div className="absolute z-30 w-full mt-1 border rounded-lg shadow-lg max-h-48 overflow-y-auto bg-[#131928] border-[#29334A]">
                      {visibleTeams.filter(t => t.TeamName.toLowerCase().includes(teamSearchQuery.toLowerCase())).length === 0 ? (
                        <div className="p-3 text-[#9AA3B8] text-[12.5px] italic">No teams found.</div>
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
                              className={`p-2.5 cursor-pointer text-[12.5px] hover:bg-[#171F32] transition-colors ${
                                isSelected ? 'bg-[#171F32] opacity-50' : ''
                              }`}
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-[#EDF0F7]">{team.TeamName}</span>
                                <span className="text-[10px] text-[#5C6478] font-mono">
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
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedTeamIDs.map(teamId => {
                      const team = teamsList.find(t => t.TeamID === teamId);
                      return (
                        <span key={teamId} className="inline-flex items-center gap-1.5 bg-[#17223D] border border-[#2C3F6E] text-[#8FB2FF] text-[12.5px] font-semibold px-3 py-1.5 rounded-full">
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
                            className="w-4 h-4 rounded-full bg-[rgba(143,178,255,0.14)] text-[#8FB2FF] flex items-center justify-center hover:bg-[rgba(143,178,255,0.28)] transition-colors border-none"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
                Priority ranking
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#E7B84B] shadow-[0_0_0_3px_rgba(231,184,75,0.18)]"></span>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] pl-8 pr-10 py-3 text-[#EDF0F7] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] appearance-none cursor-pointer transition-all"
                  style={{
                    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\' viewBox=\'0 0 10 6\'%3E%3Cpath d=\'M1 1l4 4 4-4\' stroke=\'%239AA3B8\' stroke-width=\'1.6\' fill=\'none\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E")',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 14px center'
                  }}
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
          </div>

          {/* Conditional Date Panels */}
          {taskType === 'One-time' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] px-3.5 py-3 text-[#EDF0F7] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] transition-all"
                  style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.01em', colorScheme: 'dark' }}
                />
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
                  Due date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] px-3.5 py-3 text-[#EDF0F7] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] transition-all"
                  style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.01em', colorScheme: 'dark' }}
                />
              </div>
            </div>
          ) : (
            <div className="bg-[#131928] border border-[#29334A] rounded-[10px] p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
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
                    className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] px-3.5 py-3 text-[#EDF0F7] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] transition-all"
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
                    <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
                      Weekly recurrence day
                    </label>
                    <select
                      value={userSelectedDay && manualWeeklyDay ? manualWeeklyDay : getWeekdayName(startDate)}
                      onChange={(e) => {
                        setManualWeeklyDay(e.target.value);
                        setUserSelectedDay(true);
                      }}
                      className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] px-3.5 py-3 text-[#EDF0F7] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] transition-all"
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
                  <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
                    First generation start date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-[14px] bg-[#131928] border border-[#29334A] rounded-[10px] px-3.5 py-3 text-[#EDF0F7] focus:outline-none focus:border-[#E7B84B] focus:shadow-[0_0_0_3px_rgba(231,184,75,0.18)] transition-all"
                    style={{ fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.01em', colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <div className="text-[11px] text-[#9AA3B8] leading-relaxed font-sans">
                💡 <strong>Heuristic Scheduler Rule:</strong> The automatic cron scheduler checks templates periodically. Real task records are automatically generated on their recurrence schedule, tracking generation pointers dynamically in the system database.
              </div>
            </div>
          )}

          <div>
            <label className="block text-[12.5px] font-semibold text-[#9AA3B8] tracking-wide mb-2">
              Attachments (optional)
            </label>
            <div className="space-y-3">
              {/* File Upload */}
              <div className="border-2 border-dashed border-[#29334A] rounded-[10px] p-4 hover:border-[#4C6EF5] transition-colors">
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
                  <Upload size={24} className="text-[#5C6478] mb-2" />
                  <p className="text-[14px] text-[#9AA3B8] font-medium">
                    Click to upload files or drag and drop
                  </p>
                  <p className="text-[10px] text-[#5C6478] text-center mt-1">
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
                      className="flex items-center justify-between bg-[#131928] border border-[#29334A] rounded-[10px] px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <File size={14} className="text-[#5C6478]" />
                        <span className="text-[12.5px] text-[#EDF0F7] truncate max-w-[200px]">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeUploadedFile(index)}
                        className="text-[#F0577A] hover:text-[#F0577A] transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-[#212A3D] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-[#29334A] text-[#9AA3B8] hover:bg-[#131928] hover:text-[#EDF0F7] transition-all rounded-[10px] text-[12.5px] font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading}
              className="px-5 py-2.5 bg-[#4C6EF5] hover:bg-[#3B5BD9] text-white rounded-[10px] text-[12.5px] font-semibold transition-all shadow-sm flex items-center gap-2 cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Create Task'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}