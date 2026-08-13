import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, User, FileText, Link as LinkIcon, History, AlertCircle, CheckCircle, TrendingUp, Edit2, Save, Trash, ShieldAlert, CornerRightDown, Upload, File, Image as ImageIcon } from 'lucide-react';
import { Task, TaskReport, User as UserType, Team, Subtask, SubTeam } from '../../../types/index';
import { ROLE, isAdminLevel } from '../../../constants/status';
import { uploadFile } from '../../../api/upload';
import { getAllSubordinates } from '../../../utils/userUtils';
import { canAssignWithinTeam, isSubTeamLeader, isTeamLeader } from '../../../utils/subTeamUtils';


// Helper function to derive a human-readable label and file extension from an
// attachment URL, so downloadable notes/reports (PDF, PPT, Excel, etc.) show
// what they actually are instead of a generic "Attachment N".
const getAttachmentMeta = (url: string): { label: string; ext: string } => {
  const cleanUrl = url.split('?')[0];
  const rawName = decodeURIComponent(cleanUrl.split('/').pop() || 'file');
  const extMatch = rawName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch ? extMatch[1] : '').toLowerCase();

  const typeLabels: Record<string, string> = {
    pdf: 'PDF',
    ppt: 'PowerPoint',
    pptx: 'PowerPoint',
    xls: 'Excel',
    xlsx: 'Excel',
    csv: 'CSV',
    doc: 'Word',
    docx: 'Word',
    png: 'Image',
    jpg: 'Image',
    jpeg: 'Image',
  };

  const label = typeLabels[ext] ? `${typeLabels[ext]} (${rawName})` : rawName;
  return { label, ext };
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

// Helper function to get current local date in YYYY-MM-DD format
const getCurrentLocalDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface TaskDrawerProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  reports: TaskReport[];
  subtasks: Subtask[];
  onOpenReportModal: () => void;
  onOpenFollowUpModal: () => void;
  onResendFollowUpEmail: () => void;
  onCloseTask: (taskId: string, remark: string, attachmentLink?: string) => void;
  onUpdateTask?: (taskId: string, fields: Partial<Task>) => void;
  onAddSubtask?: (taskId: string, data: { title: string; assignedTo?: string; dueDate?: string }) => Promise<void>;
  onToggleSubtask?: (subtaskId: string, isDone: boolean) => Promise<void>;
  onDeleteSubtask?: (subtaskId: string) => Promise<void>;
  usersList?: UserType[];
  teamsList?: Team[];
  subTeamsList?: SubTeam[];
}

export default function TaskDrawer({
  task,
  isOpen,
  onClose,
  currentUser,
  reports,
  subtasks,
  onOpenReportModal,
  onOpenFollowUpModal,
  onResendFollowUpEmail,
  onCloseTask,
  onUpdateTask,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  usersList = [],
  teamsList = [],
  subTeamsList = [],
}: TaskDrawerProps) {

  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [closeRemarkInput, setCloseRemarkInput] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [etaError, setEtaError] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; data: string }>>([]);
  const [isClosingTask, setIsClosingTask] = useState(false);

  // Edit Mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editEmails, setEditEmails] = useState<string[]>([]);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  // Reassignment states for Admin
  const [reassignUser, setReassignUser] = useState('');
  const [reassignTeam, setReassignTeam] = useState('');
  const [selectedReassignUsers, setSelectedReassignUsers] = useState<string[]>([]);
  const [adminAddToExisting, setAdminAddToExisting] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState('');

  // Subtask division state
  const [showSubtaskDivision, setShowSubtaskDivision] = useState(false);
  const [subtaskDivisionRows, setSubtaskDivisionRows] = useState<Array<{ title: string; assignedTo: string; dueDate: string }>>([]);
  const [selectedSubordinates, setSelectedSubordinates] = useState<string[]>([]);

  // useEffect MUST remain above any early return to satisfy React Rules of Hooks.
  useEffect(() => {
    if (task && currentUser) {
      setEditDescription(task.Description);
      setEditEmails((task.AssignedToEmail || '').split(',').map(e => e.trim()).filter(Boolean));
      setIsEditing(false);
      setReassignUser('');
      setReassignTeam('');
      setSelectedReassignUsers([]);
      setSelectedSubordinates([]);
      setAdminAddToExisting(false);
      setAdminUserSearch('');
      setShowSubtaskDivision(false);
      setSubtaskDivisionRows([]);
      setAssigneeSearchQuery('');
      setShowAssigneeDropdown(false);
    }
  }, [task, currentUser, usersList]);

  // Close assignee dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.assignee-dropdown-container')) {
        setShowAssigneeDropdown(false);
      }
    };

    if (showAssigneeDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAssigneeDropdown]);

  if (!isOpen || !task || !currentUser) return null;

  const assignableUsers = usersList.filter(user =>
    canAssignWithinTeam(currentUser, user, subTeamsList)
  );

  const subordinateEmails = getAllSubordinates(currentUser.Email, usersList);
  const subordinates = usersList.filter(u =>
    u.Active && subordinateEmails.includes(u.Email) && canAssignWithinTeam(currentUser, u, subTeamsList)
  );

  const taskSubtasks = subtasks.filter(s => s.TaskID === task.TaskID);
  const taskSubtaskIds = taskSubtasks.map(s => s.SubtaskID);
  const taskReports = reports.filter(r => r.TaskID === task.TaskID || (r.SubtaskID && taskSubtaskIds.includes(r.SubtaskID)));

  // Styling helpers — translucent colored treatments read well on both themes
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Not Started': return 'bg-surface-1 text-secondary border-token';
      case 'In Progress': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
      case 'Submitted': return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
      case 'Reviewed': return 'bg-teal-500/10 text-teal-500 border-teal-500/30';
      case 'Closed': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
      case 'Reopened': return 'bg-rose-500/10 text-rose-500 border-rose-500/30';
      case 'Overdue': return 'bg-red-500/10 text-red-500 border-red-500/30';
      default: return 'bg-surface-1 text-secondary border-token';
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Low': return 'bg-surface-1 text-secondary';
      case 'Medium': return 'bg-sky-500/10 text-sky-500';
      case 'High': return 'bg-orange-500/10 text-orange-500';
      case 'Critical': return 'bg-red-500/10 text-red-500 font-bold border border-red-500/30 animate-pulse';
      default: return 'bg-surface-1 text-secondary';
    }
  };

  const getPriorityStyles = (priorities: string[]) => {
    if (!Array.isArray(priorities)) return getPriorityStyle(priorities);
    if (priorities.length === 0) return getPriorityStyle('Low');
    if (priorities.length === 1) return getPriorityStyle(priorities[0]);
    if (priorities.includes('Critical')) return 'bg-red-500/10 text-red-500 font-bold border border-red-500/30';
    if (priorities.includes('High')) return 'bg-orange-500/10 text-orange-500';
    if (priorities.includes('Medium')) return 'bg-sky-500/10 text-sky-500';
    return 'bg-surface-1 text-secondary';
  };

  const isCurrentUserAssignee = (task.AssignedToEmail || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .includes(currentUser.Email?.toLowerCase() || '');

  const canCloseTask = isAdminLevel(currentUser.Role) ||
    (currentUser.Role === ROLE.STAKEHOLDER && (task.AssignedToTeamIDs || []).some(id => (currentUser.TeamIDs || []).includes(id))) ||
    (isCurrentUserAssignee && currentUser.CanCloseTask);

  const hasSubordinateAssignee = currentUser ? (task.AssignedToEmail || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .some(email => {
      const allSubEmails = getAllSubordinates(currentUser.Email, usersList);
      return allSubEmails.map(s => s.toLowerCase()).includes(email);
    }) : false;

  const canSubmitReport = isAdminLevel(currentUser.Role) ||
    isCurrentUserAssignee ||
    (currentUser.Role === ROLE.STAKEHOLDER && (
      (task.AssignedByEmail || '').toLowerCase() === currentUser.Email?.toLowerCase() ||
      hasSubordinateAssignee
    ));

  const canCreateFollowUp = isAdminLevel(currentUser.Role) || isCurrentUserAssignee;
  const canEditTask = isAdminLevel(currentUser.Role);

  const handleEditSubmit = () => {
    if (editEmails.length === 0) return;

    const firstEmail = editEmails[0];
    const firstUser = usersList.find(u => u.Email === firstEmail);
    const assignedRole = firstUser ? firstUser.Role : ROLE.STAKEHOLDER;
    const assignedTeamIDs = firstUser ? firstUser.TeamIDs : [];
    const primaryTeamID = assignedTeamIDs.length > 0 ? assignedTeamIDs[0] : '';

    if (onUpdateTask) {
      onUpdateTask(task.TaskID, {
        Description: editDescription,
        AssignedToEmail: editEmails.join(', '),
        AssignedToRole: assignedRole as any,
        AssignedToTeamIDs: assignedTeamIDs,
        TeamID: primaryTeamID
      });
    }
    setIsEditing(false);
  };

  const handleCloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeRemarkInput.trim()) return;

    setIsClosingTask(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of uploadedFiles) {
        try {
          const uploadData = await uploadFile({
            fileName: file.name,
            fileData: file.data,
            mimeType: file.type,
            taskId: task.TaskID
          });
          uploadedUrls.push(uploadData.webViewLink);
        } catch (uploadError) {
        }
      }

      const links = [...uploadedUrls];
      if (attachmentLink.trim()) {
        links.push(attachmentLink.trim());
      }

      const finalLink = links.length > 0 ? links.join(', ') : undefined;
      onCloseTask(task.TaskID, closeRemarkInput, finalLink);

      setCloseRemarkInput('');
      setAttachmentLink('');
      setUploadedFiles([]);
      setShowCloseForm(false);
    } catch (err) {
    } finally {
      setIsClosingTask(false);
    }
  };

  return (
<div className="fixed inset-0 z-[100] flex items-center justify-center font-sans p-2 sm:p-4 bg-[var(--color-overlay)] backdrop-blur-sm pointer-events-auto">
      {/* Centered Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-2xl max-h-[90vh] sm:max-h-[85vh] rounded-xl sm:rounded-2xl shadow-modal flex flex-col pointer-events-auto overflow-hidden bg-surface"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-5 flex items-center justify-between border-b bg-surface-2 border-token">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1.5 sm:space-x-2">
              <span className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 rounded-full border font-bold ${getStatusStyle(task.Status)}`}>
                {task.Status}
              </span>
              <span className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-md font-bold ${getPriorityStyles(task.Priority)}`}>
                {Array.isArray(task.Priority) ? task.Priority.join(', ') : task.Priority} Priority
              </span>
            </div>
            <h2 className="text-xs sm:text-sm font-bold tracking-tight mt-1.5 sm:mt-2 text-primary line-clamp-1 font-sans">
              {task.Title}
            </h2>
            <span className="text-[9px] sm:text-[10px] text-muted font-mono block mt-0.5">
              ID: {task.TaskID} &bull; Type: {task.TaskType}
            </span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary p-1.5 sm:p-1 rounded-lg hover-surface transition-colors cursor-pointer flex-shrink-0">
            <X size={18} className="sm:size-[20px]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-token bg-surface-1">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-2.5 sm:py-3 text-center text-[10px] sm:text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'details'
                ? 'border-[#2563EB] text-[#2563EB] bg-surface'
                : 'border-transparent text-muted hover:text-primary hover-surface'
            }`}
          >
            <div className="flex items-center justify-center space-x-1 sm:space-x-1.5">
              <FileText size={12} className="sm:size-[14px]" />
              <span className="hidden sm:inline">Details</span>
              <span className="sm:hidden">Details</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2.5 sm:py-3 text-center text-[10px] sm:text-xs font-bold border-b-2 transition-all relative cursor-pointer ${
              activeTab === 'history'
                ? 'border-[#2563EB] text-[#2563EB] bg-surface'
                : 'border-transparent text-muted hover:text-primary hover-surface'
            }`}
          >
            <div className="flex items-center justify-center space-x-1 sm:space-x-1.5">
              <History size={12} className="sm:size-[14px]" />
              <span className="hidden sm:inline">Report Logs ({taskReports.length})</span>
              <span className="sm:hidden">Logs ({taskReports.length})</span>
            </div>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
          {activeTab === 'details' ? (
            <div className="space-y-6">
              {isEditing ? (
                <div className="space-y-4 rounded-xl p-4.5 shadow-card bg-surface-1 border-token">
                  <div className="flex justify-between items-center pb-2.5 border-b border-token">
                    <span className="text-[10px] font-bold tracking-wider flex items-center gap-1.5 text-primary">
                      <Edit2 size={13} className="text-[#2563EB]" /> Modify task dimensions
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="text-[10px] font-bold cursor-pointer border-none bg-transparent text-muted hover:text-primary"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-wider block text-muted">Detailed description / instructions</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                      className="w-full text-xs rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-surface border-token text-primary placeholder:text-muted"
                      placeholder="Enter detailed instructions, links, criteria for closing..."
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold tracking-wider block text-muted">Assigned recipients</label>
                    <div className="relative assignee-dropdown-container">
                      <input
                        type="text"
                        value={assigneeSearchQuery}
                        onChange={(e) => {
                          setAssigneeSearchQuery(e.target.value);
                          setShowAssigneeDropdown(true);
                        }}
                        onFocus={() => setShowAssigneeDropdown(true)}
                        placeholder="Search users to assign..."
                        className="w-full text-xs rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-surface border-token text-primary placeholder:text-muted"
                      />
                      {showAssigneeDropdown && assigneeSearchQuery && (
                        <div className="absolute z-10 w-full mt-1 border rounded-lg shadow-lg max-h-48 overflow-y-auto bg-surface border-token">
                          {assignableUsers.filter(user =>
                            user.FullName.toLowerCase().includes(assigneeSearchQuery.toLowerCase()) ||
                            user.Email.toLowerCase().includes(assigneeSearchQuery.toLowerCase())
                          ).length === 0 ? (
                            <div className="p-2 text-xs text-muted italic">No users found.</div>
                          ) : (
                            assignableUsers.filter(user =>
                              user.FullName.toLowerCase().includes(assigneeSearchQuery.toLowerCase()) ||
                              user.Email.toLowerCase().includes(assigneeSearchQuery.toLowerCase())
                            ).map(user => {
                              const isSelected = editEmails.includes(user.Email);
                              return (
                                <div
                                  key={user.UserID}
                                  onClick={() => {
                                    if (!isSelected) {
                                      setEditEmails([...editEmails, user.Email]);
                                    }
                                    setAssigneeSearchQuery('');
                                    setShowAssigneeDropdown(false);
                                  }}
                                  className={`p-2 cursor-pointer text-xs hover-surface transition-colors ${
                                    isSelected ? 'opacity-50' : ''
                                  }`}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-primary">{user.FullName}</span>
                                    <span className="text-[9px] text-muted font-mono">{user.Email}</span>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                    {editEmails.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {editEmails.map(email => {
                          const u = usersList.find(usr => usr.Email === email);
                          return (
                            <span key={email} className="inline-flex items-center gap-1 bg-surface-2 border border-token text-primary text-[10px] font-semibold px-2 py-0.5 rounded">
                              <span>{u ? u.FullName : email}</span>
                              <button
                                type="button"
                                onClick={() => setEditEmails(editEmails.filter(e => e !== email))}
                                className="w-3 h-3 rounded-full bg-surface text-muted flex items-center justify-center hover:text-red-500 transition-colors border-none"
                              >
                                <X size={8} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleEditSubmit}
                      disabled={editEmails.length === 0 || !editDescription.trim()}
                      className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold tracking-wider transition-all shadow-card flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer border-none"
                    >
                      <Save size={13} />
                      <span>Save changes</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {canEditTask && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="flex items-center space-x-1.5 text-[10px] font-bold tracking-wider py-1.5 px-3 rounded-lg shadow-card transition-all cursor-pointer bg-surface border border-token text-primary hover-surface">
                        <Edit2 size={11} className="text-[#2563EB]" />
                        <span>Edit task settings</span>
                      </button>
                    </div>
                  )}

                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold tracking-wider font-sans text-muted">Scope description</h4>
                    <div className="text-xs leading-relaxed whitespace-pre-wrap rounded-lg p-3.5 border border-token text-primary bg-surface-1">
                      {task.Description}
                    </div>
                  </div>
                </>
              )}

              {/* Assignment details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg space-y-1 bg-surface-1 border-token">
                  <span className="text-[10px] font-bold tracking-widest block text-muted">Allocated by</span>
                  <div className="flex items-center space-x-2">
                    <User size={14} className="text-secondary" />
                    <span className="text-xs font-medium truncate text-primary">{task.AssignedByEmail}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg space-y-2 flex flex-col justify-between bg-surface-1 border-token">
                  <div>
                    <span className="text-[10px] font-bold tracking-widest block text-muted">Assigned recipients</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {task.AssignedToEmail.split(',').map((email, idx) => {
                        const trimmed = email.trim();
                        if (trimmed === currentUser.Email) {
                          return (
                            <span key={idx} className="inline-flex items-center bg-blue-500/10 text-blue-500 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-500/30">
                              You ({trimmed})
                            </span>
                          );
                        }
                        return (
                          <span key={idx} className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded border border-token bg-surface text-primary">
                            {trimmed}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {isAdminLevel(currentUser.Role) && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono uppercase block w-max bg-surface-2 text-secondary">
                      {task.AssignedToRole}
                    </span>
                  )}
                </div>
              </div>

              {/* Stakeholder Task Assignment to Subordinates Section */}
              {currentUser.Role === ROLE.STAKEHOLDER && isCurrentUserAssignee && task.Status !== 'Closed' && subordinates.length > 0 && (
                <div className="rounded-lg p-4 space-y-3 shadow-card bg-blue-500/10 border-blue-500/30">
                  <div className="flex items-center space-x-1.5 font-bold text-xs tracking-wider text-blue-500">
                    <User size={14} className="text-[#2563EB]" />
                    <span>Assign / delegate to subordinate</span>
                  </div>
                  <p className="text-[11px] leading-relaxed font-semibold text-blue-500/80">
                    As a Stakeholder, you are authorized to assign or delegate this task to members of your team subordinates list.
                  </p>

                  <div className="space-y-3">
                    <div className="border border-token rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5 shadow-inner bg-surface">
                      {subordinates.length === 0 ? (
                        <div className="text-secondary text-xs italic py-1">No subordinates available.</div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between pb-1.5 border-b border-token">
                            <button
                              type="button"
                              onClick={() => setSelectedSubordinates(subordinates.map(s => s.Email))}
                              className="text-[9px] font-semibold cursor-pointer border-none bg-transparent text-blue-500 hover:text-blue-600"
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedSubordinates([])}
                              className="text-[9px] font-semibold cursor-pointer border-none bg-transparent text-muted hover:text-primary"
                            >
                              Clear all
                            </button>
                          </div>
                          {subordinates.map(sub => {
                            const isChecked = selectedSubordinates.includes(sub.Email);
                            return (
                              <label key={sub.UserID} className="flex items-center space-x-2.5 p-1.5 rounded-md cursor-pointer text-xs transition-colors hover-surface text-primary">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setSelectedSubordinates(selectedSubordinates.filter(e => e !== sub.Email));
                                    } else {
                                      setSelectedSubordinates([...selectedSubordinates, sub.Email]);
                                    }
                                  }}
                                  className="h-4 w-4 rounded transition-colors border-token-strong text-[#2563EB] focus:ring-[#2563EB]"
                                />
                                <div className="flex flex-col">
                                  <span className="font-semibold text-primary">{sub.FullName}</span>
                                  <span className="text-[9.5px] font-mono text-muted">{sub.Email}</span>
                                </div>
                              </label>
                            );
                          })}
                        </>
                      )}
                    </div>

                    <button
                      id="subordinate-assign-btn"
                      type="button"
                      onClick={() => {
                        if (selectedSubordinates.length > 0 && onUpdateTask) {
                          const currentAssignees = task.AssignedToEmail.split(',').map(e => e.trim()).filter(Boolean);
                          for (const sub of selectedSubordinates) {
                            if (!currentAssignees.includes(sub)) currentAssignees.push(sub);
                          }
                          onUpdateTask(task.TaskID, { AssignedToEmail: currentAssignees.join(', ') });
                          setSelectedSubordinates([]);
                          onClose();
                        }
                      }}
                      disabled={selectedSubordinates.length === 0}
                      className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-[11px] font-bold tracking-wider px-3.5 py-2 rounded-lg cursor-pointer border-none shadow-card transition-transform transform active:scale-95"
                    >
                      {selectedSubordinates.length > 0
                        ? `Assign ${selectedSubordinates.length} subordinate${selectedSubordinates.length > 1 ? 's' : ''}`
                        : 'Select subordinates'
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* Subtask Division Section */}
              {currentUser.Role === ROLE.STAKEHOLDER && isCurrentUserAssignee && task.Status !== 'Closed' && subordinates.length > 0 && (
                <div className="rounded-lg p-4 space-y-3 shadow-card bg-emerald-500/10 border-emerald-500/30">
                  <button
                    type="button"
                    onClick={() => setShowSubtaskDivision(!showSubtaskDivision)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <div className="flex items-center space-x-1.5 font-bold text-xs tracking-wider text-emerald-500">
                      <FileText size={14} className="text-[#16A34A]" />
                      <span>Divide into subtasks</span>
                    </div>
                    <span className={`text-[9px] font-semibold ${showSubtaskDivision ? 'rotate-180' : ''} transition-transform text-emerald-500`}>▼</span>
                  </button>

                  {showSubtaskDivision && (
                    <div className="space-y-3 pt-2">
                      <p className="text-[11px] leading-relaxed font-semibold text-emerald-500/80">
                        Divide this task into smaller subtasks and assign each to a different subordinate.
                      </p>

                      {subtaskDivisionRows.map((row, index) => (
                        <div key={index} className="border border-token rounded-lg p-3 space-y-2 bg-surface">
                          <div className="flex justify-between items-start">
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                placeholder="Subtask title/scope"
                                value={row.title}
                                onChange={(e) => {
                                  const updated = [...subtaskDivisionRows];
                                  updated[index].title = e.target.value;
                                  setSubtaskDivisionRows(updated);
                                }}
                                className="w-full rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#16A34A] bg-surface border-token text-primary placeholder:text-muted"
                              />
                              <select
                                value={row.assignedTo}
                                onChange={(e) => {
                                  const updated = [...subtaskDivisionRows];
                                  updated[index].assignedTo = e.target.value;
                                  setSubtaskDivisionRows(updated);
                                }}
                                className="w-full rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#16A34A] bg-surface border-token text-primary"
                              >
                                <option value="">-- Select subordinate --</option>
                                {subordinates.map(sub => (
                                  <option key={sub.UserID} value={sub.Email}>
                                    {sub.FullName} ({sub.Email})
                                  </option>
                                ))}
                              </select>
                              <input
                                type="date"
                                value={row.dueDate}
                                onChange={(e) => {
                                  const updated = [...subtaskDivisionRows];
                                  updated[index].dueDate = e.target.value;
                                  setSubtaskDivisionRows(updated);
                                }}
                                className="w-full rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#16A34A] bg-surface border-token text-primary"
                                placeholder={task.DueDate}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = subtaskDivisionRows.filter((_, i) => i !== index);
                                setSubtaskDivisionRows(updated);
                              }}
                              className="p-1 rounded cursor-pointer border-none text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => setSubtaskDivisionRows([...subtaskDivisionRows, { title: '', assignedTo: '', dueDate: task.DueDate }])}
                        className="w-full border border-dashed border-token-strong text-[10.5px] font-bold tracking-wider px-3.5 py-2 rounded-lg cursor-pointer transition-colors bg-surface text-emerald-600 hover:bg-emerald-500/10"
                      >
                        + Add subtask division
                      </button>

                      {subtaskDivisionRows.length > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            for (const row of subtaskDivisionRows) {
                              if (row.title && row.assignedTo && onAddSubtask) {
                                await onAddSubtask(task.TaskID, { title: row.title, assignedTo: row.assignedTo, dueDate: row.dueDate || task.DueDate });
                              }
                            }
                            setShowSubtaskDivision(false);
                            setSubtaskDivisionRows([]);
                          }}
                          disabled={subtaskDivisionRows.some(row => !row.title || !row.assignedTo)}
                          className="w-full bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white text-[10.5px] font-bold tracking-wider px-3.5 py-2 rounded-lg cursor-pointer border-none shadow-card transition-transform transform active:scale-95"
                        >
                          Create subtask divisions
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Subtask Display Section */}
              {taskSubtasks.length > 0 && (
                <div className="rounded-lg p-4 space-y-3 shadow-card bg-emerald-500/10 border-emerald-500/30">
                  <div className="flex items-center space-x-1.5 font-bold text-xs tracking-wider text-emerald-500">
                    <FileText size={14} className="text-[#16A34A]" />
                    <span>Subtask divisions ({taskSubtasks.length})</span>
                  </div>

                  <div className="space-y-3">
                    {taskSubtasks.map((subtask) => {
                      const subtaskStatus = subtask.Completed ? 'Closed' : 'In Progress';
                      const lastReport = reports.find(r => r.SubtaskID === subtask.SubtaskID);
                      return (
                        <div key={subtask.SubtaskID} className="border border-token rounded-lg p-3.5 space-y-2 bg-surface">
                          <div className="flex items-start space-x-2.5">
                            <input
                              type="checkbox"
                              checked={subtask.Completed}
                              onChange={async () => {
                                if (onToggleSubtask) await onToggleSubtask(subtask.SubtaskID, !subtask.Completed);
                              }}
                              className="h-4 w-4 mt-0.5 rounded transition-colors cursor-pointer border-token-strong text-[#16A34A] focus:ring-[#16A34A]"
                            />
                            <div className="flex-1 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-primary">{subtask.Title}</span>
                                <span className={`text-[9px] px-2 py-0.5 rounded font-bold tracking-wider ${getStatusStyle(subtaskStatus)}`}>
                                  {subtaskStatus}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-secondary">
                                {subtask.AssignedTo && (
                                  <div className="flex items-center space-x-1">
                                    <User size={11} className="text-secondary" />
                                    <span>Assigned to: {subtask.AssignedTo}</span>
                                  </div>
                                )}
                                {subtask.DueDate && (
                                  <div className="flex items-center space-x-1">
                                    <Calendar size={11} className="text-secondary" />
                                    <span>Due: {subtask.DueDate}</span>
                                  </div>
                                )}
                              </div>
                              {lastReport && (
                                <div className="border border-token rounded px-2 py-1.5 mt-2 bg-blue-500/10">
                                  <div className="text-[9px] font-medium mb-0.5 text-blue-500">Last update:</div>
                                  <div className="text-[10px] italic text-secondary">"{lastReport.WorkSummary}"</div>
                                </div>
                              )}
                            </div>
                            {onDeleteSubtask && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (onDeleteSubtask) await onDeleteSubtask(subtask.SubtaskID);
                                }}
                                className="p-1 rounded cursor-pointer border-none text-red-400 hover:text-red-500 hover:bg-red-500/10"
                              >
                                <Trash size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Admin Reassign Task Section */}
              {isAdminLevel(currentUser.Role) && task.Status !== 'Closed' && (
                <div className="rounded-lg p-4 space-y-3 shadow-card bg-amber-500/10 border-amber-500/30">
                  <div className="flex items-center space-x-1.5 font-bold text-xs tracking-wider text-amber-500">
                    <User size={14} className="text-[#D97706]" />
                    <span>Reassign task (admin)</span>
                  </div>
                  <p className="text-[11px] leading-relaxed font-semibold text-amber-500/80">
                    Reassign this task to an active user or to an entire team (all team members will be assigned).
                  </p>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold tracking-wider block text-muted">Reassign to user</label>
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={adminUserSearch}
                        onChange={(e) => setAdminUserSearch(e.target.value)}
                        className="w-full rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#D97706] bg-surface border-token text-primary placeholder:text-muted"
                      />
                      <div className="border border-token rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5 shadow-inner bg-surface">
                        {assignableUsers.filter(u => u.Active && (adminUserSearch === '' || u.FullName.toLowerCase().includes(adminUserSearch.toLowerCase()) || u.Email.toLowerCase().includes(adminUserSearch.toLowerCase()))).length === 0 ? (
                          <div className="text-secondary text-xs italic py-1">No active users found.</div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between pb-1.5 border-b border-token">
                              <button
                                type="button"
                                onClick={() => setSelectedReassignUsers(assignableUsers.filter(u => u.Active && (adminUserSearch === '' || u.FullName.toLowerCase().includes(adminUserSearch.toLowerCase()) || u.Email.toLowerCase().includes(adminUserSearch.toLowerCase()))).map(u => u.Email))}
                                className="text-[9px] font-semibold cursor-pointer border-none bg-transparent text-amber-600 hover:text-amber-700"
                              >
                                Select all
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedReassignUsers([])}
                                className="text-[9px] font-semibold cursor-pointer border-none bg-transparent text-muted hover:text-primary"
                              >
                                Clear all
                              </button>
                            </div>
                            {assignableUsers.filter(u => u.Active && (adminUserSearch === '' || u.FullName.toLowerCase().includes(adminUserSearch.toLowerCase()) || u.Email.toLowerCase().includes(adminUserSearch.toLowerCase()))).map(user => {
                              const isChecked = selectedReassignUsers.includes(user.Email);
                              return (
                                <label key={user.UserID} className="flex items-center space-x-2.5 p-1.5 rounded-md cursor-pointer text-xs transition-colors hover-surface text-primary">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      if (isChecked) {
                                        setSelectedReassignUsers(selectedReassignUsers.filter(e => e !== user.Email));
                                      } else {
                                        setSelectedReassignUsers([...selectedReassignUsers, user.Email]);
                                      }
                                    }}
                                    className="h-4 w-4 rounded transition-colors border-token-strong text-[#D97706] focus:ring-[#D97706]"
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-primary">{user.FullName}</span>
                                    <span className="text-[9.5px] font-mono text-muted">{user.Email}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </>
                        )}
                      </div>
                      <label className="flex items-center space-x-2 text-[10px] font-semibold cursor-pointer text-secondary">
                        <input
                          type="checkbox"
                          checked={adminAddToExisting}
                          onChange={(e) => setAdminAddToExisting(e.target.checked)}
                          className="h-4 w-4 rounded transition-colors border-token-strong text-[#D97706] focus:ring-[#D97706]"
                        />
                        <span>Add to existing assignees (append instead of replace)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedReassignUsers.length > 0 && onUpdateTask) {
                            let newAssignees: string[];
                            if (adminAddToExisting) {
                              const currentAssignees = task.AssignedToEmail.split(',').map(e => e.trim()).filter(Boolean);
                              for (const user of selectedReassignUsers) {
                                if (!currentAssignees.includes(user)) currentAssignees.push(user);
                              }
                              newAssignees = currentAssignees;
                            } else {
                              newAssignees = selectedReassignUsers;
                            }
                            const firstUser = usersList.find(u => u.Email === newAssignees[0]);
                            onUpdateTask(task.TaskID, {
                              AssignedToEmail: newAssignees.join(', '),
                              AssignedToRole: (firstUser ? firstUser.Role : 'Stakeholder') as 'Admin' | 'Stakeholder' | 'Sub-stakeholder',
                              AssignedToTeamIDs: firstUser ? firstUser.TeamIDs : [],
                              TeamID: firstUser && firstUser.TeamIDs.length > 0 ? firstUser.TeamIDs[0] : ''
                            });
                            setSelectedReassignUsers([]);
                            setAdminUserSearch('');
                            onClose();
                          }
                        }}
                        disabled={selectedReassignUsers.length === 0}
                        className="w-full bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white text-[10.5px] font-bold tracking-wider px-3.5 py-2 rounded-lg cursor-pointer border-none shadow-card transition-transform transform active:scale-95"
                      >
                        {selectedReassignUsers.length > 0
                          ? `${adminAddToExisting ? 'Add' : 'Reassign'} ${selectedReassignUsers.length} User${selectedReassignUsers.length > 1 ? 's' : ''}`
                          : 'Select users'
                        }
                      </button>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-bold tracking-wider block text-muted">Reassign to team</label>
                      <div className="flex gap-2">
                        <select
                          id="admin-reassign-team-select"
                          value={reassignTeam}
                          onChange={(e) => {
                            setReassignTeam(e.target.value);
                            setReassignUser('');
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#D97706] flex-grow bg-surface border-token text-primary"
                        >
                          <option value="">-- Select active team --</option>
                          {(teamsList || []).filter(t => t.Active).map(t => (
                            <option key={t.TeamID} value={t.TeamID}>
                              {t.TeamName} ({t.TeamID})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            if (reassignTeam && onUpdateTask) {
                              const teamMembers = assignableUsers.filter(u => u.Active && u.TeamIDs.includes(reassignTeam));
                              const commaEmails = teamMembers.map(u => u.Email).join(', ');
                              onUpdateTask(task.TaskID, {
                                AssignedToEmail: commaEmails || 'unassigned@PMS.com',
                                AssignedToRole: (teamMembers.length > 0 ? teamMembers[0].Role : 'Stakeholder') as 'Admin' | 'Stakeholder' | 'Sub-stakeholder',
                                AssignedToTeamIDs: [reassignTeam],
                                TeamID: reassignTeam
                              });
                              setReassignTeam('');
                              onClose();
                            }
                          }}
                          disabled={!reassignTeam}
                          className="bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white text-[10.5px] font-bold tracking-wider px-3.5 py-2 rounded-lg flex-shrink-0 cursor-pointer border-none shadow-card transition-transform transform active:scale-95"
                        >
                          Reassign team
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata details */}
<div className="rounded-lg divide-y divide-[var(--color-border)] bg-surface-1 border border-token">
                <div className="p-3 flex justify-between items-center text-xs">
                  <span className="font-medium font-sans text-muted">Start Date</span>
                  <span className="font-mono text-primary">{task.StartDate}</span>
                </div>
                <div className="p-3 flex justify-between items-center text-xs">
                  <span className="font-medium font-sans text-muted">Schedule Due Date</span>
                  <span className="font-mono text-primary">{task.DueDate}</span>
                </div>
                {task.CompletionDate && (
                  <div className="p-3 flex justify-between items-center text-xs bg-emerald-500/10">
                    <span className="font-medium text-emerald-500">Completed Date</span>
                    <span className="font-mono font-semibold text-emerald-500">{task.CompletionDate}</span>
                  </div>
                )}
              </div>

              {/* ETA Management Section */}
              {task.Status !== 'Closed' && (
                <div className="rounded-xl p-3.5 space-y-2.5 font-sans shadow-card bg-surface border-token">
                  <div className="flex justify-between items-center border-b pb-1.5 border-token">
                    <h4 className="text-[10px] font-black tracking-wider text-muted">Timeline & ETA adjustments</h4>
                    <span className={`text-[10px] px-1.5 rounded font-mono font-black leading-none ${
                      (task.EtaRequestCount || 0) >= 3 ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'
                    }`}>
                      Extended: {task.EtaRequestCount || 0}/3
                    </span>
                  </div>

                  {task.OriginalDueDate && task.OriginalDueDate !== task.DueDate && (
                    <p className="text-[10px] font-mono text-muted">
                      Original Scheduled Due Date: <span className="font-bold line-through text-secondary">{task.OriginalDueDate}</span>
                    </p>
                  )}

                  {((task.EtaRequestCount || 0) < 3) ? (
                    <div className="space-y-2">
                      <p className="text-[11px] leading-relaxed font-medium text-secondary">
                        Need extra time? Propose a new estimated date. These updates notify system administrators and teammates automatically.
                      </p>
                      {etaError && (
                        <div className="text-xs px-3 py-2 rounded-lg bg-red-500/10 border-red-500/30 text-red-500">
                          {etaError}
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <input
                          type="date"
                          id={`new-eta-input-${task.TaskID}`}
                          className="flex-1 text-xs rounded-lg px-2.5 py-1.5 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 bg-surface border-token text-primary"
                          defaultValue={task.DueDate}
                          min={getTomorrowDate()}
                        />
                        <button
                          onClick={() => {
                            const inputEl = document.getElementById(`new-eta-input-${task.TaskID}`) as HTMLInputElement;
                            if (inputEl && inputEl.value) {
                              const newEta = inputEl.value;
                              const today = getCurrentLocalDate();
                              if (newEta <= today) {
                                setEtaError('ETA must be set to a date after today. Please select a future date.');
                                setTimeout(() => setEtaError(''), 3000);
                                return;
                              }
                              if (newEta === task.DueDate) return;
                              if (onUpdateTask) {
                                onUpdateTask(task.TaskID, {
                                  DueDate: newEta,
                                  OriginalDueDate: task.OriginalDueDate || task.DueDate,
                                  EtaRequestCount: (task.EtaRequestCount || 0) + 1
                                });
                              }
                            }
                          }}
className="px-3.5 py-1.5 rounded-lg text-[10.5px] font-bold tracking-wider border-none cursor-pointer text-center whitespace-nowrap transition-all shadow-card bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-text-inverse)]"
                        >
                          Change ETA
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10.5px] font-semibold p-2.5 rounded-lg border italic leading-relaxed bg-red-500/10 border-red-500/30 text-red-500">
                      ⚠️ Maximum threshold of 3 ETA extension modifications has been reached for this task slot.
                    </p>
                  )}
                </div>
              )}

              {/* Lineage References */}
              {(task.ParentTaskID || task.TemplateID || task.FollowUpCount > 0) && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold tracking-wider text-muted">Lineage references</h4>
                  <div className="border border-token p-3 rounded-lg text-xs space-y-1.5 bg-blue-500/10 text-primary">
                    {task.ParentTaskID && (
                      <div className="flex justify-between">
                        <span>Parent Source ID:</span>
                        <span className="font-mono font-semibold text-blue-500">{task.ParentTaskID}</span>
                      </div>
                    )}
                    {task.TemplateID && (
                      <div className="flex justify-between">
                        <span>Template Origin:</span>
                        <span className="font-mono font-semibold text-purple-500">{task.TemplateID}</span>
                      </div>
                    )}
                    {task.FollowUpCount > 0 && (
                      <div className="flex justify-between">
                        <span>Follow-up Lineage Count:</span>
                        <span className="font-semibold text-amber-500">{task.FollowUpCount} issued</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {task.AttachmentLink && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold tracking-wider text-muted">Reference attachment</h4>
                  <a
                    href={task.AttachmentLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-2 text-xs border border-token rounded-lg p-3 transition bg-surface hover-surface text-primary"
                  >
                    <LinkIcon size={14} className="text-secondary" />
                    <span className="truncate flex-1 font-mono text-[11px] underline text-blue-500">{task.AttachmentLink}</span>
                  </a>
                </div>
              )}

              {/* Follow-Up Reason */}
              {task.FollowUpReason && (
                <div className="rounded-lg p-3.5 font-sans bg-amber-500/10 border-amber-500/30">
                  <div className="flex items-center space-x-1 text-xs font-semibold tracking-wider mb-1 text-amber-500">
                    <CornerRightDown size={14} className="text-amber-500" />
                    <span>Follow-up reason</span>
                  </div>
                  <p className="text-xs italic leading-relaxed text-amber-500/80">
                    &ldquo;{task.FollowUpReason}&rdquo;
                  </p>
                </div>
              )}

              {/* Closing Notes */}
              {task.CloseRemark && (
                <div className="rounded-lg p-3.5 font-sans bg-emerald-500/10 border-emerald-500/30">
                  <div className="flex items-center space-x-1 text-xs font-semibold tracking-wider mb-1 text-emerald-500">
                    <CheckCircle size={14} className="text-emerald-500" />
                    <span>Audit close remarks</span>
                  </div>
                  <p className="text-xs italic leading-relaxed text-emerald-500/80">
                    &ldquo;{task.CloseRemark}&rdquo;
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {taskReports.length === 0 ? (
                <div className="text-center py-8 text-xs font-medium text-secondary">
                  No status reports logged for this task record.
                </div>
              ) : (
                <div className="relative border-l border-token pl-4 ml-2 space-y-4">
                  {taskReports.map((report, rIdx) => {
                    const subtask = report.SubtaskID ? taskSubtasks.find(s => s.SubtaskID === report.SubtaskID) : null;
                    return (
                      <div
                        key={report.ReportID || `report-fallback-${rIdx}`}
                        className="relative border border-token rounded-lg p-3.5 shadow-card cursor-pointer hover:shadow-sm transition-shadow bg-surface"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="absolute -left-[25px] top-4 w-2.5 h-2.5 rounded-full bg-[#2563EB] border-2 shadow-card border-surface" />

                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono font-bold text-secondary">{report.ReportDate}</span>
                            {subtask ? (
                              <span className="text-[9px] border border-token px-2 py-0.5 rounded font-bold tracking-wider bg-purple-500/10 text-purple-500">
                                Subtask: {subtask.Title}
                              </span>
                            ) : (
                              <span className="text-[9px] border border-token px-2 py-0.5 rounded font-bold tracking-wider bg-surface-2 text-secondary">
                                Parent task
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] border border-token px-2 py-0.5 rounded font-mono font-bold bg-surface-2 text-primary">
                            {task.Status}
                          </span>
                        </div>

                        <div className="mt-2 text-xs font-medium text-primary">{report.WorkSummary}</div>

                        {report.Blockers && (
                          <div className="mt-2 text-[11px] p-2 rounded border border-token flex items-start space-x-1.5 bg-amber-500/10 text-amber-600">
                            <AlertCircle size={12} className="mt-0.5 flex-shrink-0 text-amber-500" />
                            <div>
                              <strong className="font-semibold text-xs block mb-0.5">BLOCKERS IDENTIFIED:</strong> {report.Blockers}
                            </div>
                          </div>
                        )}

                        {report.NextAction && (
                          <div className="mt-2 text-[11px] font-medium text-muted">
                            &bull; <strong>Next Immediate step:</strong> {report.NextAction}
                          </div>
                        )}

                        {report.AttachmentLink ? (
                          <div className="mt-2.5 space-y-1">
                            {report.AttachmentLink.split(',').map((url, idx) => {
                              const trimmedUrl = url.trim();
                              const { label, ext } = getAttachmentMeta(trimmedUrl);
                              const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
                              return (
                                <a
                                  key={idx}
                                  href={trimmedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  download
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex items-center space-x-1.5 text-[10px] hover:underline font-bold text-blue-500"
                                  title={`Download ${label}`}
                                >
                                  {isImage ? <ImageIcon size={11} className="text-blue-500" /> : <File size={11} className="text-blue-500" />}
                                  <span className="truncate max-w-[220px]">{label}</span>
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-2.5 text-[10px] italic text-secondary">No attachment</div>
                        )}

                        <div className="mt-3 pt-2.5 border-t border-token flex items-center justify-between text-[9px] font-mono text-muted">
                          <span>LODGED BY: {report.SubmittedByEmail}</span>
                          <span>ID: {report.ReportID}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions panel */}
        <div className="p-4 border-t border-token flex flex-col space-y-2 bg-surface-1">
          {showCloseForm && (
            <form onSubmit={handleCloseSubmit} className="rounded-xl p-4.5 space-y-3 mb-2 shadow-card bg-surface border-token">
              <label className="block text-[10px] font-bold tracking-wider text-muted">Close notes / audit findings</label>
              <textarea
                required
                rows={2}
                value={closeRemarkInput}
                onChange={(e) => setCloseRemarkInput(e.target.value)}
                placeholder="Declare clearing audit parameters. Accounts verified? Balance matched?"
                className="w-full text-xs border border-token rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-surface text-primary placeholder:text-muted"
              />

              <div className="space-y-1">
                <label className="block text-[10px] font-bold tracking-wider mb-1 flex items-center space-x-1 text-muted">
                  <LinkIcon size={12} />
                  <span>Attachment / deliverable URI (optional)</span>
                </label>
                <input
                  type="url"
                  value={attachmentLink}
                  onChange={(e) => setAttachmentLink(e.target.value)}
                  placeholder="https://example.com/your-deliverable-link"
                  className="w-full text-xs border border-token rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#2563EB] bg-surface text-primary placeholder:text-muted"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] font-bold tracking-wider mb-1 flex items-center space-x-1 text-muted">
                  <Upload size={12} />
                  <span>Upload files / photos (optional)</span>
                </label>
<div className="border-2 border-dashed border-token rounded-lg p-4 bg-[color-mix(in_srgb,var(--color-surface-1)_50%,transparent)]">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []) as File[];
                      files.forEach((file: File) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const base64Data = event.target?.result as string;
                          setUploadedFiles(prev => [...prev, { name: file.name, type: file.type, data: base64Data }]);
                        };
                        reader.readAsDataURL(file);
                      });
                    }}
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    id="closure-file-upload"
                  />
                  <label htmlFor="closure-file-upload" className="flex flex-col items-center justify-center cursor-pointer">
                    <Upload className="text-secondary mb-2" size={20} />
                    <p className="text-xs text-center text-secondary">Click to upload files or drag and drop</p>
                    <p className="text-[10px] text-secondary text-center mt-1">Images, PDFs, Documents (Max 10MB each)</p>
                  </label>
                </div>
                {uploadedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[10px] font-bold tracking-wider text-muted">Uploaded files:</p>
                    {uploadedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between border border-token rounded-lg p-2 bg-surface">
                        <div className="flex items-center space-x-2">
                          {file.type.startsWith('image/') ? <ImageIcon className="text-blue-500" size={14} /> : <File className="text-secondary" size={14} />}
                          <span className="text-xs truncate max-w-[200px] text-primary">{file.name}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== index))}
                          className="text-red-500 hover:text-red-600 transition-colors border-none bg-transparent cursor-pointer"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  disabled={isClosingTask}
                  onClick={() => setShowCloseForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider cursor-pointer text-muted hover-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isClosingTask}
                  className="px-4 py-1.5 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg text-xs font-bold tracking-wider cursor-pointer border-none disabled:opacity-50"
                >
                  {isClosingTask ? 'Closing task...' : 'Confirm closing'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {canSubmitReport && task.Status !== 'Closed' && (
              <button
                onClick={onOpenReportModal}
                className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-[10px] sm:text-xs font-bold tracking-wider py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg flex items-center justify-center space-x-1.5 sm:space-x-2 shadow-card cursor-pointer border-none"
              >
                <TrendingUp size={12} className="sm:size-[14px]" />
                <span className="hidden sm:inline">Submit report</span>
                <span className="sm:hidden">Report</span>
              </button>
            )}

            {canCloseTask && task.Status !== 'Closed' && !showCloseForm && (
              <button
                onClick={() => setShowCloseForm(true)}
                className="bg-[#0F172A] hover:bg-[#1E293B] text-white text-[10px] sm:text-xs font-bold tracking-wider py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg flex items-center justify-center space-x-1.5 sm:space-x-2 shadow-card cursor-pointer border-none"
              >
                <CheckCircle size={12} className="sm:size-[14px]" />
                <span className="hidden sm:inline">Mark as closed</span>
                <span className="sm:hidden">Close</span>
              </button>
            )}

            {canCreateFollowUp && (
              <button
                onClick={onOpenFollowUpModal}
                className="bg-[#D97706] hover:bg-[#B45309] col-span-1 sm:col-span-2 text-white text-[10px] sm:text-xs font-bold tracking-wider py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg flex items-center justify-center space-x-1.5 sm:space-x-2 shadow-card cursor-pointer border-none"
              >
                <CheckCircle size={12} className="sm:size-[14px]" />
                <span className="hidden sm:inline">Trigger linked follow-up</span>
                <span className="sm:hidden">Follow-up</span>
              </button>
            )}

            {task.RequiresFollowUp === 'Yes' && (
              <button
                onClick={onResendFollowUpEmail}
                className="bg-[#2563EB] hover:bg-[#1d4ed8] col-span-1 sm:col-span-2 text-white text-[10px] sm:text-xs font-bold tracking-wider py-2.5 sm:py-3 px-3 sm:px-4 rounded-lg flex items-center justify-center space-x-1.5 sm:space-x-2 shadow-card cursor-pointer border-none"
              >
                <CornerRightDown size={12} className="sm:size-[14px]" />
                <span className="hidden sm:inline">Resend follow-up email</span>
                <span className="sm:hidden">Resend email</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
