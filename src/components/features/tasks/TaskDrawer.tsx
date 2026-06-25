import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, User, FileText, Link as LinkIcon, History, AlertCircle, CheckCircle, TrendingUp, Edit2, Save, Trash, ShieldAlert, CornerRightDown } from 'lucide-react';
import { Task, TaskReport, User as UserType, Team, Subtask } from '../../../types/index';
import { ROLE } from '../../../constants/status';

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
  onCloseTask: (taskId: string, remark: string) => void;
  onUpdateTask?: (taskId: string, fields: Partial<Task>) => void;
  onAddSubtask?: (taskId: string, data: { title: string; assignedTo?: string; dueDate?: string }) => Promise<void>;
  onToggleSubtask?: (subtaskId: string, isDone: boolean) => Promise<void>;
  onDeleteSubtask?: (subtaskId: string) => Promise<void>;
  usersList?: UserType[];
  teamsList?: Team[];
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
  onCloseTask,
  onUpdateTask,
  onAddSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  usersList = [],
  teamsList = [],
}: TaskDrawerProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [closeRemarkInput, setCloseRemarkInput] = useState('');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [etaError, setEtaError] = useState('');

  // Edit Mode states
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editEmails, setEditEmails] = useState<string[]>([]);
  
  // Reassignment states for Admin
  const [reassignUser, setReassignUser] = useState('');
  const [reassignTeam, setReassignTeam] = useState('');
  const [selectedReassignUsers, setSelectedReassignUsers] = useState<string[]>([]);
  const [adminAddToExisting, setAdminAddToExisting] = useState(false);
  const [adminUserSearch, setAdminUserSearch] = useState('');

  // Subordinate delegation state
  const [selectedSubordinates, setSelectedSubordinates] = useState<string[]>([]);
  const subordinates = usersList.filter(u => 
    u.Active && 
    u.ManagerEmail && 
    u.ManagerEmail.toLowerCase() === currentUser.Email.toLowerCase()
  );

  // Subtask division state
  const [showSubtaskDivision, setShowSubtaskDivision] = useState(false);
  const [subtaskDivisionRows, setSubtaskDivisionRows] = useState<Array<{ title: string; assignedTo: string; dueDate: string }>>([]);

  useEffect(() => {
    if (task) {
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
    }
  }, [task, currentUser, usersList]);

  if (!isOpen || !task) return null;

  // Filter reports specifically linked to this Task ID or its subtasks
  const taskSubtasks = subtasks.filter(s => s.TaskID === task.TaskID);
  const taskSubtaskIds = taskSubtasks.map(s => s.SubtaskID);
  const taskReports = reports.filter(r => r.TaskID === task.TaskID || (r.SubtaskID && taskSubtaskIds.includes(r.SubtaskID)));

  console.log(`TaskDrawer: task.TaskID=${task.TaskID}, total reports=${reports.length}, filtered reports=${taskReports.length}`);
  console.log(`TaskDrawer: taskReports=`, taskReports);

  // Styling helpers
  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'Not Started': return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'In Progress': return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Submitted': return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Reviewed': return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'Closed': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Reopened': return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Overdue': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'Low': return 'bg-slate-100 text-slate-600';
      case 'Medium': return 'bg-sky-50 text-sky-700';
      case 'High': return 'bg-orange-50 text-orange-700';
      case 'Critical': return 'bg-red-50 text-red-700 font-bold border border-red-200 animate-pulse';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  // Parse multiple assignees if comma-separated
  const isCurrentUserAssignee = (task.AssignedToEmail || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .includes(currentUser.Email?.toLowerCase() || '');

  // Determine close credentials
  const canCloseTask = currentUser.Role === ROLE.ADMIN ||
    (currentUser.Role === ROLE.STAKEHOLDER && (task.AssignedToTeamIDs || []).some(id => (currentUser.TeamIDs || []).includes(id))) ||
    (isCurrentUserAssignee && currentUser.CanCloseTask);

  // Determine report submittal credentials
  const hasSubordinateAssignee = (task.AssignedToEmail || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .some(email => {
      const u = usersList.find(usr => usr.Email?.toLowerCase() === email);
      return u && u.ManagerEmail && u.ManagerEmail.toLowerCase() === currentUser.Email?.toLowerCase();
    });

  const canSubmitReport = currentUser.Role === ROLE.ADMIN ||
    isCurrentUserAssignee ||
    (currentUser.Role === ROLE.STAKEHOLDER && (
      (task.AssignedByEmail || '').toLowerCase() === currentUser.Email?.toLowerCase() ||
      hasSubordinateAssignee
    ));

  // Determine follow-up credentials
  // Rule: Admins can create follow-ups on any task, assignees can create follow-ups on their assigned tasks
  const canCreateFollowUp = currentUser.Role === ROLE.ADMIN || isCurrentUserAssignee;

  // Determine task editing credentials (Admins only)
  const canEditTask = currentUser.Role === ROLE.ADMIN;

  const handleEditSubmit = () => {
    if (editEmails.length === 0) {
      return;
    }

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

  const handleCloseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeRemarkInput.trim()) return;
    onCloseTask(task.TaskID, closeRemarkInput);
    setCloseRemarkInput('');
    setShowCloseForm(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center font-sans p-4 bg-slate-900/50 backdrop-blur-xs pointer-events-auto">
      {/* Centered Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col pointer-events-auto overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-5 bg-[#0F172A] text-white flex items-center justify-between border-b border-[#1E293B]">
          <div>
            <div className="flex items-center space-x-2">
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${getStatusStyle(task.Status)}`}>
                {task.Status}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${getPriorityStyle(task.Priority)}`}>
                {task.Priority} Priority
              </span>
            </div>
            <h2 className="text-sm font-bold tracking-tight mt-2 text-white line-clamp-1 font-sans">
              {task.Title}
            </h2>
            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
              ID: {task.TaskID} &bull; Type: {task.TaskType}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#E2E8F0] bg-slate-50">
          <button
            onClick={() => setActiveTab('details')}
            className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
              activeTab === 'details'
                ? 'border-[#2563EB] text-[#2563EB] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            <div className="flex items-center justify-center space-x-1.5">
              <FileText size={14} />
              <span>Details</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-3 text-center text-xs font-bold uppercase tracking-wider border-b-2 transition-all relative cursor-pointer ${
              activeTab === 'history'
                ? 'border-[#2563EB] text-[#2563EB] bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'
            }`}
          >
            <div className="flex items-center justify-center space-x-1.5">
              <History size={14} />
              <span>Report Logs ({taskReports.length})</span>
            </div>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'details' ? (
            <div className="space-y-6">
              {isEditing ? (
                <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-4.5 shadow-xs">
                  <div className="flex justify-between items-center pb-2.5 border-b border-slate-200">
                    <span className="text-[10px] font-bold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                      <Edit2 size={13} className="text-[#2563EB]" /> Modify Task Dimensions
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="text-[10px] text-slate-500 hover:text-slate-800 font-bold uppercase tracking-wide cursor-pointer border-none bg-transparent"
                    >
                      Cancel
                    </button>
                  </div>

                  {/* Description Field */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">Detailed Description / Instructions</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      rows={4}
                      className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                      placeholder="Enter detailed instructions, links, criteria for closing..."
                    />
                  </div>

                  {/* Stakeholders Field */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider block mb-1">Add / Remove Stakeholders</label>
                    <div className="border border-[#E2E8F0] rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5 bg-white shadow-inner">
                      {usersList.length === 0 ? (
                        <div className="text-slate-400 text-xs italic py-1">No stakeholders registered.</div>
                      ) : (
                        usersList.filter(u => u.Active).map(user => {
                          const isChecked = editEmails.includes(user.Email);
                          return (
                            <label key={user.UserID} className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-100 rounded-md cursor-pointer text-xs text-slate-800 transition-colors">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setEditEmails(editEmails.filter(e => e !== user.Email));
                                  } else {
                                    setEditEmails([...editEmails, user.Email]);
                                  }
                                }}
                                className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] transition-colors"
                              />
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-900">{user.FullName}</span>
                                <span className="text-[9.5px] text-slate-500 font-mono">
                                  {currentUser.Role === 'Admin' ? `${user.Role} • ` : ''}{user.Email}
                                </span>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Save button */}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleEditSubmit}
                      disabled={editEmails.length === 0 || !editDescription.trim()}
                      className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-xs flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer border-none"
                    >
                      <Save size={13} />
                      <span>Save Changes</span>
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
                        className="flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-[#CBD5E1] text-slate-700 text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 rounded-lg shadow-2xs transition-all cursor-pointer"
                      >
                        <Edit2 size={11} className="text-[#2563EB]" />
                        <span>Edit Task Settings</span>
                      </button>
                    </div>
                  )}

                  {/* Description */}
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider font-sans">Scope Description</h4>
                    <div className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-lg p-3.5 border border-[#E2E8F0]">
                      {task.Description}
                    </div>
                  </div>
                </>
              )}

              {/* Assignment details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg space-y-1">
                  <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest block">Allocated By</span>
                  <div className="flex items-center space-x-2">
                    <User size={14} className="text-slate-400" />
                    <span className="text-xs text-slate-800 font-medium truncate">{task.AssignedByEmail}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-lg space-y-2 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-widest block">Assigned Recipients</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {task.AssignedToEmail.split(',').map((email, idx) => {
                        const trimmed = email.trim();
                        if (trimmed === currentUser.Email) {
                          return (
                            <span key={idx} className="inline-flex items-center bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-200">
                              You ({trimmed})
                            </span>
                          );
                        }
                        return (
                          <span key={idx} className="inline-flex items-center bg-slate-100 text-slate-800 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-200">
                            {trimmed}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {currentUser.Role === 'Admin' && (
                    <span className="text-[9px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono uppercase block w-max">
                      {task.AssignedToRole}
                    </span>
                  )}
                </div>
              </div>

              {/* Stakeholder Task Assignment to Subordinates Section */}
              {currentUser.Role === 'Stakeholder' && isCurrentUserAssignee && task.Status !== 'Closed' && subordinates.length > 0 && (
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-4 space-y-3 shadow-3xs">
                  <div className="flex items-center space-x-1.5 text-blue-900 font-bold text-xs uppercase tracking-wider">
                    <User size={14} className="text-[#2563EB]" />
                    <span>Assign / Delegate to Subordinate</span>
                  </div>
                  <p className="text-[11px] text-blue-700 leading-relaxed font-semibold">
                    As a Stakeholder, you are authorized to assign or delegate this task to members of your team subordinates list.
                  </p>
                  
                  <div className="space-y-3">
                    <div className="border border-[#CBD5E1] rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5 bg-white shadow-inner">
                      {subordinates.length === 0 ? (
                        <div className="text-slate-400 text-xs italic py-1">No subordinates available.</div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                            <button
                              type="button"
                              onClick={() => setSelectedSubordinates(subordinates.map(s => s.Email))}
                              className="text-[9px] text-blue-600 hover:text-blue-800 font-semibold uppercase cursor-pointer border-none bg-transparent"
                            >
                              Select All
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedSubordinates([])}
                              className="text-[9px] text-slate-500 hover:text-slate-700 font-semibold uppercase cursor-pointer border-none bg-transparent"
                            >
                              Clear All
                            </button>
                          </div>
                          {subordinates.map(sub => {
                            const isChecked = selectedSubordinates.includes(sub.Email);
                            return (
                              <label key={sub.UserID} className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-100 rounded-md cursor-pointer text-xs text-slate-800 transition-colors">
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
                                  className="h-4 w-4 rounded border-[#CBD5E1] text-[#2563EB] focus:ring-[#2563EB] transition-colors"
                                />
                                <div className="flex flex-col">
                                  <span className="font-semibold text-slate-900">{sub.FullName}</span>
                                  <span className="text-[9.5px] text-slate-500 font-mono">{sub.Email}</span>
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
                          const currentAssignees = task.AssignedToEmail
                            .split(',')
                            .map(e => e.trim())
                            .filter(Boolean);
                          
                          for (const sub of selectedSubordinates) {
                            if (!currentAssignees.includes(sub)) {
                              currentAssignees.push(sub);
                            }
                          }
                          
                          onUpdateTask(task.TaskID, {
                            AssignedToEmail: currentAssignees.join(', ')
                          });
                          setSelectedSubordinates([]);
                          onClose();
                        }
                      }}
                      disabled={selectedSubordinates.length === 0}
                      className="w-full bg-[#2563EB] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-[11px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg cursor-pointer border-none shadow-3xs transition-transform transform active:scale-95"
                    >
                      {selectedSubordinates.length > 0 
                        ? `Assign ${selectedSubordinates.length} Subordinate${selectedSubordinates.length > 1 ? 's' : ''}`
                        : 'Select Subordinates'
                      }
                    </button>
                  </div>
                </div>
              )}
              
              {/* Subtask Division Section */}
              {currentUser.Role === 'Stakeholder' && isCurrentUserAssignee && task.Status !== 'Closed' && subordinates.length > 0 && (
                <div className="bg-[#F0FDF4] border border-[#86EFAC] rounded-lg p-4 space-y-3 shadow-3xs">
                  <button
                    type="button"
                    onClick={() => setShowSubtaskDivision(!showSubtaskDivision)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <div className="flex items-center space-x-1.5 text-green-900 font-bold text-xs uppercase tracking-wider">
                      <FileText size={14} className="text-[#16A34A]" />
                      <span>Divide into Subtasks</span>
                    </div>
                    <span className={`text-[9px] text-green-700 font-semibold ${showSubtaskDivision ? 'rotate-180' : ''} transition-transform`}>▼</span>
                  </button>
                  
                  {showSubtaskDivision && (
                    <div className="space-y-3 pt-2">
                      <p className="text-[11px] text-green-700 leading-relaxed font-semibold">
                        Divide this task into smaller subtasks and assign each to a different subordinate.
                      </p>
                      
                      {subtaskDivisionRows.map((row, index) => (
                        <div key={index} className="bg-white border border-[#CBD5E1] rounded-lg p-3 space-y-2">
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
                                className="w-full bg-slate-50 border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                              />
                              
                              <select
                                value={row.assignedTo}
                                onChange={(e) => {
                                  const updated = [...subtaskDivisionRows];
                                  updated[index].assignedTo = e.target.value;
                                  setSubtaskDivisionRows(updated);
                                }}
                                className="w-full bg-slate-50 border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
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
                                className="w-full bg-slate-50 border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#16A34A]"
                                placeholder={task.DueDate}
                              />
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => {
                                const updated = subtaskDivisionRows.filter((_, i) => i !== index);
                                setSubtaskDivisionRows(updated);
                              }}
                              className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer border-none"
                            >
                              <Trash size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      <button
                        type="button"
                        onClick={() => setSubtaskDivisionRows([...subtaskDivisionRows, { title: '', assignedTo: '', dueDate: task.DueDate }])}
                        className="w-full bg-white border border-dashed border-[#86EFAC] text-green-700 text-[10.5px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg cursor-pointer hover:bg-green-50 transition-colors"
                      >
                        + Add Subtask Division
                      </button>
                      
                      {subtaskDivisionRows.length > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            for (const row of subtaskDivisionRows) {
                              if (row.title && row.assignedTo && onAddSubtask) {
                                await onAddSubtask(task.TaskID, {
                                  title: row.title,
                                  assignedTo: row.assignedTo,
                                  dueDate: row.dueDate || task.DueDate
                                });
                              }
                            }
                            setShowSubtaskDivision(false);
                            setSubtaskDivisionRows([]);
                          }}
                          disabled={subtaskDivisionRows.some(row => !row.title || !row.assignedTo)}
                          className="w-full bg-[#16A34A] hover:bg-[#15803D] disabled:opacity-50 text-white text-[10.5px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg cursor-pointer border-none shadow-3xs transition-transform transform active:scale-95"
                        >
                          Create Subtask Divisions
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Subtask Display Section */}
              {taskSubtasks.length > 0 && (
                <div className="bg-[#F0FDF4] border border-[#86EFAC] rounded-lg p-4 space-y-3 shadow-3xs">
                  <div className="flex items-center space-x-1.5 text-green-900 font-bold text-xs uppercase tracking-wider">
                    <FileText size={14} className="text-[#16A34A]" />
                    <span>Subtask Divisions ({taskSubtasks.length})</span>
                  </div>
                  
                  <div className="space-y-3">
                    {taskSubtasks.map((subtask) => {
                      const subtaskStatus = subtask.Completed ? 'Closed' : 'In Progress';
                      const assignedUser = usersList.find(u => u.Email === subtask.AssignedTo);
                      const lastReport = reports.find(r => r.SubtaskID === subtask.SubtaskID);
                      
                      return (
                        <div key={subtask.SubtaskID} className="bg-white border border-[#CBD5E1] rounded-lg p-3.5 space-y-2">
                          <div className="flex items-start space-x-2.5">
                            <input
                              type="checkbox"
                              checked={subtask.Completed}
                              onChange={async () => {
                                if (onToggleSubtask) {
                                  await onToggleSubtask(subtask.SubtaskID, !subtask.Completed);
                                }
                              }}
                              className="h-4 w-4 mt-0.5 rounded border-[#CBD5E1] text-[#16A34A] focus:ring-[#16A34A] transition-colors cursor-pointer"
                            />
                            <div className="flex-1 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-slate-900">{subtask.Title}</span>
                                <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${getStatusStyle(subtaskStatus)}`}>
                                  {subtaskStatus}
                                </span>
                              </div>
                              
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
                                {subtask.AssignedTo && (
                                  <div className="flex items-center space-x-1">
                                    <User size={11} className="text-slate-400" />
                                    <span>Assigned to: {subtask.AssignedTo}</span>
                                  </div>
                                )}
                                {subtask.DueDate && (
                                  <div className="flex items-center space-x-1">
                                    <Calendar size={11} className="text-slate-400" />
                                    <span>Due: {subtask.DueDate}</span>
                                  </div>
                                )}
                              </div>
                              
                              {lastReport && (
                                <div className="bg-blue-50 border border-blue-100 rounded px-2 py-1.5 mt-2">
                                  <div className="text-[9px] text-blue-700 font-medium mb-0.5">Last update:</div>
                                  <div className="text-[10px] text-slate-700 italic">"{lastReport.WorkSummary}"</div>
                                </div>
                              )}
                            </div>
                            
                            {onDeleteSubtask && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (onDeleteSubtask) {
                                    await onDeleteSubtask(subtask.SubtaskID);
                                  }
                                }}
                                className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 cursor-pointer border-none"
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
              {currentUser.Role === 'Admin' && task.Status !== 'Closed' && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-4 space-y-3 shadow-3xs">
                  <div className="flex items-center space-x-1.5 text-amber-950 font-bold text-xs uppercase tracking-wider">
                    <User size={14} className="text-[#D97706]" />
                    <span>Reassign Task (Admin)</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed font-semibold">
                    Reassign this task to an active user or to an entire team (all team members will be assigned).
                  </p>
                  
                  <div className="space-y-3">
                    {/* User Reassignment */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider block">Reassign to User</label>
                      
                      <input
                        type="text"
                        placeholder="Search users..."
                        value={adminUserSearch}
                        onChange={(e) => setAdminUserSearch(e.target.value)}
                        className="w-full bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#D97706]"
                      />
                      
                      <div className="border border-[#CBD5E1] rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5 bg-white shadow-inner">
                        {usersList.filter(u => u.Active && (adminUserSearch === '' || u.FullName.toLowerCase().includes(adminUserSearch.toLowerCase()) || u.Email.toLowerCase().includes(adminUserSearch.toLowerCase()))).length === 0 ? (
                          <div className="text-slate-400 text-xs italic py-1">No active users found.</div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                              <button
                                type="button"
                                onClick={() => setSelectedReassignUsers(usersList.filter(u => u.Active && (adminUserSearch === '' || u.FullName.toLowerCase().includes(adminUserSearch.toLowerCase()) || u.Email.toLowerCase().includes(adminUserSearch.toLowerCase()))).map(u => u.Email))}
                                className="text-[9px] text-amber-700 hover:text-amber-900 font-semibold uppercase cursor-pointer border-none bg-transparent"
                              >
                                Select All
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedReassignUsers([])}
                                className="text-[9px] text-slate-500 hover:text-slate-700 font-semibold uppercase cursor-pointer border-none bg-transparent"
                              >
                                Clear All
                              </button>
                            </div>
                            {usersList.filter(u => u.Active && (adminUserSearch === '' || u.FullName.toLowerCase().includes(adminUserSearch.toLowerCase()) || u.Email.toLowerCase().includes(adminUserSearch.toLowerCase()))).map(user => {
                              const isChecked = selectedReassignUsers.includes(user.Email);
                              return (
                                <label key={user.UserID} className="flex items-center space-x-2.5 p-1.5 hover:bg-slate-100 rounded-md cursor-pointer text-xs text-slate-800 transition-colors">
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
                                    className="h-4 w-4 rounded border-[#CBD5E1] text-[#D97706] focus:ring-[#D97706] transition-colors"
                                  />
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-900">{user.FullName}</span>
                                    <span className="text-[9.5px] text-slate-500 font-mono">{user.Email}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </>
                        )}
                      </div>
                      
                      <label className="flex items-center space-x-2 text-[10px] text-slate-700 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={adminAddToExisting}
                          onChange={(e) => setAdminAddToExisting(e.target.checked)}
                          className="h-4 w-4 rounded border-[#CBD5E1] text-[#D97706] focus:ring-[#D97706] transition-colors"
                        />
                        <span>Add to existing assignees (append instead of replace)</span>
                      </label>
                      
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedReassignUsers.length > 0 && onUpdateTask) {
                            let newAssignees: string[];
                            
                            if (adminAddToExisting) {
                              const currentAssignees = task.AssignedToEmail
                                .split(',')
                                .map(e => e.trim())
                                .filter(Boolean);
                              
                              for (const user of selectedReassignUsers) {
                                if (!currentAssignees.includes(user)) {
                                  currentAssignees.push(user);
                                }
                              }
                              newAssignees = currentAssignees;
                            } else {
                              newAssignees = selectedReassignUsers;
                            }
                            
                            const firstUser = usersList.find(u => u.Email === newAssignees[0]);
                            onUpdateTask(task.TaskID, {
                              AssignedToEmail: newAssignees.join(', '),
                              AssignedToRole: firstUser ? firstUser.Role : 'Stakeholder',
                              AssignedToTeamIDs: firstUser ? firstUser.TeamIDs : [],
                              TeamID: firstUser && firstUser.TeamIDs.length > 0 ? firstUser.TeamIDs[0] : ''
                            });
                            setSelectedReassignUsers([]);
                            setAdminUserSearch('');
                            onClose();
                          }
                        }}
                        disabled={selectedReassignUsers.length === 0}
                        className="w-full bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white text-[10.5px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg cursor-pointer border-none shadow-3xs transition-transform transform active:scale-95"
                      >
                        {selectedReassignUsers.length > 0 
                          ? `${adminAddToExisting ? 'Add' : 'Reassign'} ${selectedReassignUsers.length} User${selectedReassignUsers.length > 1 ? 's' : ''}`
                          : 'Select Users'
                        }
                      </button>
                    </div>

                    {/* Team Reassignment */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-[#64748B] uppercase tracking-wider block">Reassign to Team</label>
                      <div className="flex gap-2">
                        <select
                          id="admin-reassign-team-select"
                          value={reassignTeam}
                          onChange={(e) => {
                            setReassignTeam(e.target.value);
                            setReassignUser(''); // clear user select
                          }}
                          className="bg-white border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#D97706] flex-grow"
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
                              const teamObj = (teamsList || []).find(t => t.TeamID === reassignTeam);
                              const teamMembers = usersList.filter(u => u.Active && u.TeamIDs.includes(reassignTeam));
                              if (teamObj) {
                                const commaEmails = teamMembers.map(u => u.Email).join(', ');
                                onUpdateTask(task.TaskID, {
                                  AssignedToEmail: commaEmails || 'unassigned@PMS.com',
                                  AssignedToRole: teamMembers.length > 0 ? teamMembers[0].Role : 'Stakeholder',
                                  AssignedToTeamIDs: [reassignTeam],
                                  TeamID: reassignTeam
                                });
                                setReassignTeam('');
                                onClose();
                              }
                            }
                          }}
                          disabled={!reassignTeam}
                          className="bg-[#D97706] hover:bg-[#B45309] disabled:opacity-50 text-white text-[10.5px] font-bold uppercase tracking-wider px-3.5 py-2 rounded-lg flex-shrink-0 cursor-pointer border-none shadow-3xs transition-transform transform active:scale-95"
                        >
                          Reassign Team
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Metadata details */}
              <div className="bg-slate-50 border border-[#E2E8F0] rounded-lg divide-y divide-[#E2E8F0]">
                <div className="p-3 flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium font-sans">Start Date</span>
                  <span className="text-slate-800 font-mono">{task.StartDate}</span>
                </div>
                <div className="p-3 flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium font-sans">Schedule Due Date</span>
                  <span className="text-slate-800 font-mono">{task.DueDate}</span>
                </div>
                {task.CompletionDate && (
                  <div className="p-3 flex justify-between items-center text-xs bg-emerald-50/50">
                    <span className="text-emerald-700 font-medium">Completed Date</span>
                    <span className="text-emerald-800 font-mono font-semibold">{task.CompletionDate}</span>
                  </div>
                )}
              </div>

              {/* ETA Management Section */}
              {task.Status !== 'Closed' && (
                <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 space-y-2.5 font-sans shadow-3xs">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                    <h4 className="text-[10px] font-black text-[#64748B] uppercase tracking-wider">
                      Timeline &amp; ETA Adjustments
                    </h4>
                    <span className={`text-[10px] px-1.5 rounded font-mono font-black uppercase leading-none ${
                      (task.EtaRequestCount || 0) >= 3 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
                    }`}>
                      Extended: {task.EtaRequestCount || 0}/3
                    </span>
                  </div>
                  
                  {task.OriginalDueDate && task.OriginalDueDate !== task.DueDate && (
                    <p className="text-[10px] text-slate-550 font-mono">
                      Original Scheduled Due Date: <span className="font-bold line-through text-slate-400">{task.OriginalDueDate}</span>
                    </p>
                  )}

                  {((task.EtaRequestCount || 0) < 3) ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                        Need extra time? Propose a new estimated date. These updates notify system administrators and teammates automatically.
                      </p>
                      {etaError && (
                        <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-lg">
                          {etaError}
                        </div>
                      )}
                      <div className="flex items-center space-x-2">
                        <input
                          type="date"
                          id={`new-eta-input-${task.TaskID}`}
                          className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-850 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                          defaultValue={task.DueDate}
                          min={getTomorrowDate()}
                        />
                        <button
                          onClick={() => {
                            const inputEl = document.getElementById(`new-eta-input-${task.TaskID}`) as HTMLInputElement;
                            if (inputEl && inputEl.value) {
                              const newEta = inputEl.value;
                              const today = getCurrentLocalDate();
                              
                              // Validate that new ETA is strictly greater than today
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
                          className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 text-white rounded-lg text-[10.5px] font-bold uppercase tracking-wider border-none cursor-pointer text-center whitespace-nowrap transition-all shadow-3xs"
                        >
                          Change ETA
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[10.5px] text-red-650 font-semibold bg-red-50/50 p-2.5 rounded-lg border border-red-100 italic leading-relaxed">
                      ⚠️ Maximum threshold of 3 ETA extension modifications has been reached for this task slot.
                    </p>
                  )}
                </div>
              )}

              {/* Lineage References */}
              {(task.ParentTaskID || task.TemplateID || task.FollowUpCount > 0) && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Lineage References</h4>
                  <div className="bg-blue-900/5 border border-blue-500/10 p-3 rounded-lg text-xs space-y-1.5 text-slate-700">
                    {task.ParentTaskID && (
                      <div className="flex justify-between">
                        <span>Parent Source ID:</span>
                        <span className="font-mono font-semibold text-blue-700">{task.ParentTaskID}</span>
                      </div>
                    )}
                    {task.TemplateID && (
                      <div className="flex justify-between">
                        <span>Template Origin:</span>
                        <span className="font-mono font-semibold text-purple-700">{task.TemplateID}</span>
                      </div>
                    )}
                    {task.FollowUpCount > 0 && (
                      <div className="flex justify-between">
                        <span>Follow-up Lineage Count:</span>
                        <span className="font-semibold text-amber-700">{task.FollowUpCount} issued</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {task.AttachmentLink && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Reference Attachment</h4>
                  <a
                    href={task.AttachmentLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center space-x-2 text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg p-3 text-slate-700 transition"
                  >
                    <LinkIcon size={14} className="text-slate-400" />
                    <span className="truncate flex-1 font-mono text-[11px] text-blue-600 underline">
                      {task.AttachmentLink}
                    </span>
                  </a>
                </div>
              )}

              {/* Follow-Up Reason */}
              {task.FollowUpReason && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 font-sans">
                  <div className="flex items-center space-x-1 text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">
                    <CornerRightDown size={14} className="text-amber-600" />
                    <span>Follow-Up Reason</span>
                  </div>
                  <p className="text-xs text-amber-700 italic leading-relaxed">
                    &ldquo;{task.FollowUpReason}&rdquo;
                  </p>
                </div>
              )}

              {/* Closing Notes */}
              {task.CloseRemark && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 font-sans">
                  <div className="flex items-center space-x-1 text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-1">
                    <CheckCircle size={14} className="text-emerald-600" />
                    <span>Audit Close Remarks</span>
                  </div>
                  <p className="text-xs text-emerald-700 italic leading-relaxed">
                    &ldquo;{task.CloseRemark}&rdquo;
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {taskReports.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-medium">
                  No status reports logged for this task record.
                </div>
              ) : (
                <div className="relative border-l border-[#E2E8F0] pl-4 ml-2 space-y-4">
                  {taskReports.map((report, rIdx) => {
                    const subtask = report.SubtaskID ? taskSubtasks.find(s => s.SubtaskID === report.SubtaskID) : null;
                    return (
                      <div 
                        key={report.ReportID} 
                        className="relative bg-white border border-[#E2E8F0] rounded-lg p-3.5 shadow-xs cursor-pointer hover:shadow-sm transition-shadow"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Prevent opening task modal - reports are already fully displayed
                          console.log('Report clicked:', report.ReportID);
                        }}
                      >
                        {/* Timeline Dot */}
                        <span className="absolute -left-[25px] top-4 w-2.5 h-2.5 rounded-full bg-[#2563EB] border-2 border-white shadow-xs" />
                        
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] font-mono text-slate-400 font-bold">{report.ReportDate}</span>
                            {subtask ? (
                              <span className="text-[9px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                SUBTASK: {subtask.Title}
                              </span>
                            ) : (
                              <span className="text-[9px] bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                                PARENT TASK
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded font-mono font-bold">
                            {report.StatusUpdate}
                          </span>
                        </div>

                        <div className="mt-2 text-xs text-slate-800 font-medium">
                          {report.WorkSummary}
                        </div>

                      {report.Blockers && (
                        <div className="mt-2 bg-amber-50 text-amber-800 text-[11px] p-2 rounded border border-amber-200/50 flex items-start space-x-1.5">
                          <AlertCircle size={12} className="text-amber-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <strong className="font-semibold text-xs block mb-0.5">BLOCKERS IDENTIFIED:</strong> {report.Blockers}
                          </div>
                        </div>
                      )}

                      {report.NextAction && (
                        <div className="mt-2 text-[11px] text-[#64748B] font-medium">
                          &bull; <strong>Next Immediate step:</strong> {report.NextAction}
                        </div>
                      )}

                      {report.AttachmentLink ? (
                        <div className="mt-2.5 space-y-1">
                          {report.AttachmentLink.split(',').map((url, idx) => (
                            <a
                              key={idx}
                              href={url.trim()}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center space-x-1.5 text-[10px] text-blue-600 hover:underline font-bold"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <LinkIcon size={11} className="text-blue-500" />
                              <span>Attachment {idx + 1}</span>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2.5 text-[10px] text-slate-400 italic">
                          No attachment
                        </div>
                      )}

                      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[9px] text-[#64748B] font-mono">
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
        <div className="p-4 border-t border-[#E2E8F0] bg-slate-50 flex flex-col space-y-2">
          {/* Close Task form */}
          {showCloseForm && (
            <form onSubmit={handleCloseSubmit} className="bg-white border border-[#E2E8F0] rounded-xl p-4.5 space-y-3 mb-2 shadow-sm">
              <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider block">
                Close Notes / Audit Findings
              </label>
              <textarea
                required
                rows={2}
                value={closeRemarkInput}
                onChange={(e) => setCloseRemarkInput(e.target.value)}
                placeholder="Declare clearing audit parameters. Accounts verified? Balance matched?"
                className="w-full text-xs border border-[#E2E8F0] rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCloseForm(false)}
                  className="px-3 py-1.5 text-slate-500 hover:bg-slate-150 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer border-none"
                >
                  Confirm Closing
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-2 gap-2">
            {canSubmitReport && task.Status !== 'Closed' && (
              <button
                onClick={onOpenReportModal}
                className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-xs font-bold uppercase tracking-wider py-3 px-4 rounded-lg flex items-center justify-center space-x-2 shadow-xs cursor-pointer border-none"
              >
                <TrendingUp size={14} />
                <span>Submit Report</span>
              </button>
            )}

            {canCloseTask && task.Status !== 'Closed' && !showCloseForm && (
              <button
                onClick={() => setShowCloseForm(true)}
                className="bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold uppercase tracking-wider py-3 px-4 rounded-lg flex items-center justify-center space-x-2 shadow-xs cursor-pointer border-none"
              >
                <CheckCircle size={14} />
                <span>Mark As Closed</span>
              </button>
            )}

            {canCreateFollowUp && (
              <button
                onClick={onOpenFollowUpModal}
                className="bg-[#D97706] hover:bg-[#B45309] col-span-2 text-white text-xs font-bold uppercase tracking-wider py-3 px-4 rounded-lg flex items-center justify-center space-x-2 shadow-xs cursor-pointer border-none"
              >
                <CheckCircle size={14} />
                <span>Trigger Linked Follow-Up</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
