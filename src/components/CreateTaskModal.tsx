import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Calendar, ClipboardList, Repeat, UserPlus, Info } from 'lucide-react';
import { User, TaskTemplate, Task, TaskStatus } from '../types';
import { ROLE } from '../constants/status';

interface CreateTaskModalProps {
  currentUser: User;
  usersList: User[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    Title: string;
    Description: string;
    Category: string;
    Priority: 'Low' | 'Medium' | 'High' | 'Critical';
    TaskType: 'One-time' | 'Recurring';
    RecurrenceType: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly' | 'One-time';
    StartDate: string;
    DueDate: string;
    AssignedToEmail: string;
    AttachmentLink: string;
  }) => void;
  preSelectedAssignee?: string;
}

export default function CreateTaskModal({ currentUser, usersList, isOpen, onClose, onSubmit, preSelectedAssignee }: CreateTaskModalProps) {
  const [taskType, setTaskType] = useState<'One-time' | 'Recurring'>('One-time');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Operations');
  const [priority, setPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [recurrenceType, setRecurrenceType] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly'>('Weekly');
  
  // Schedule dates (defaulting to today + offset)
  const todayStr = new Date().toISOString().split('T')[0];
  const nextWeekStr = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  
  const [startDate, setStartDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState(nextWeekStr);
  
  // Set initial assignedToEmail based on preSelectedAssignee
  const [assignedToEmail, setAssignedToEmail] = useState(preSelectedAssignee || '');

  // Reset assignedToEmail when modal opens with new preSelectedAssignee
  React.useEffect(() => {
    if (isOpen && preSelectedAssignee) {
      setAssignedToEmail(preSelectedAssignee);
    }
  }, [isOpen, preSelectedAssignee]);
  
  // Filter eligible assignees based on role
  // Rule: Admin can assign to anyone. Stakeholders can assign to themselves or subordinates (ManagerEmail = stakeholder email)
  const filteredAssignees = usersList.filter(user => {
    if (!user.Active) return false;
    if (currentUser.Role === ROLE.ADMIN) return true;
    if (currentUser.Role === ROLE.STAKEHOLDER) {
      return (user.Email.toLowerCase() === currentUser.Email.toLowerCase()) || (user.ManagerEmail.toLowerCase() === currentUser.Email.toLowerCase());
    }
    return false;
  });

  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [attachmentLink, setAttachmentLink] = useState('');

  // Auto-generate title from description and date
  useEffect(() => {
    if (description.trim() && dueDate) {
      // Extract first few words from description (up to 5 words)
      const words = description.trim().split(/\s+/).slice(0, 5);
      const descriptionSnippet = words.join(' ');
      
      // Format date for title
      const dateObj = new Date(dueDate);
      const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      
      // Generate title
      const generatedTitle = `${descriptionSnippet} - ${formattedDate}`;
      setTitle(generatedTitle);
    }
  }, [description, dueDate]);

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

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || selectedEmails.length === 0) return;

    onSubmit({
      Title: title,
      Description: description,
      Category: category,
      Priority: priority,
      TaskType: taskType,
      RecurrenceType: taskType === 'Recurring' ? recurrenceType : 'One-time',
      StartDate: startDate,
      DueDate: taskType === 'One-time' ? dueDate : startDate, // for Templates, due offset is dynamic
      AssignedToEmail: selectedEmails.join(', '),
      AttachmentLink: attachmentLink
    });

    // Reset fields
    setTitle('');
    setDescription('');
    setCategory('Operations');
    setPriority('Medium');
    setStartDate(todayStr);
    setDueDate(nextWeekStr);
    setAttachmentLink('');
    setSelectedEmails([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-white rounded-xl shadow-xl border border-[#E2E8F0] w-full max-w-2xl overflow-hidden font-sans"
      >
        <div className="bg-[#0F172A] px-6 py-4.5 flex items-center justify-between border-b border-[#1E293B]">
          <div className="flex items-center space-x-2.5">
            <ClipboardList className="text-[#3B82F6]" size={20} />
            <h3 className="text-white font-bold text-base tracking-tight font-sans">Configure New Task Allocation</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Task Type Switcher */}
          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-2">
              Task Scheduling Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTaskType('One-time')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  taskType === 'One-time'
                    ? 'bg-[#2563EB]/10 border-[#2563EB] text-[#2563EB]'
                    : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Calendar size={15} />
                <span>One-Time Task Allocation</span>
              </button>

              <button
                type="button"
                onClick={() => setTaskType('Recurring')}
                className={`py-2 px-3 rounded-lg border text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                  taskType === 'Recurring'
                    ? 'bg-[#2563EB]/10 border-[#2563EB] text-[#2563EB]'
                    : 'bg-white border-[#E2E8F0] text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Repeat size={15} />
                <span>Recurring Schedule Blueprint</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
              Aesthetic Title <span className="text-red-500">*</span>
              <span className="text-blue-500 ml-1">(Auto-generated from description & date)</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 Financial Ledger Verification"
              className="w-full text-xs bg-slate-50 border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              readOnly
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
              Detailed Scope / Instructions <span className="text-red-500">*</span>
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
              <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                <UserPlus size={12} />
                <span>Assigned Recipients (Multiple Allowed)</span>
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
                                {currentUser.Role === 'Admin' ? `${user.Role} • ` : ''}{user.Email}
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

            <div>
              <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                Priority Ranking
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
                <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                  Due Date
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
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                    Recurrence Schedule Frequency
                  </label>
                  <select
                    value={recurrenceType}
                    onChange={(e) => setRecurrenceType(e.target.value as any)}
                    className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  >
                    <option value="Daily">Daily Interval</option>
                    <option value="Weekly">Weekly (Every Monday)</option>
                    <option value="Monthly">Monthly Interval</option>
                    <option value="Quarterly">Quarterly Cycle</option>
                    <option value="Half-yearly">Half-yearly Cycle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                    First Generation Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                  />
                </div>
              </div>
              <div className="text-[11px] text-[#64748B] leading-relaxed font-sans">
                💡 <strong>Heuristic Scheduler Rule:</strong> The automatic cron scheduler checks templates periodically. Real task records are automatically generated on their recurrence schedule, tracking generation pointers dynamically in the system database.
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
              Focal Reference Asset URL (Optional)
            </label>
            <input
              type="url"
              value={attachmentLink}
              onChange={(e) => setAttachmentLink(e.target.value)}
              placeholder="https://example.com/your-assets-folder"
              className="w-full text-xs bg-white border border-[#E2E8F0] rounded-lg px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            />
          </div>

          <div className="pt-4 border-t border-[#E2E8F0] flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 transition-all rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={selectedEmails.length === 0}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Allocate Task
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
