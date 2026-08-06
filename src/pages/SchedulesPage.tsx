import React, { useState } from 'react';
import { Task, User as UserType, TaskTemplate } from '../types';
import { Repeat, Plus, Search, Edit2, Trash2, Clock, Calendar, AlertCircle, User } from 'lucide-react';
import { isAdminLevel } from '../constants/status';

interface SchedulesPageProps {
  tasks: Task[];
  currentUser?: UserType;
  users?: UserType[];
  templates?: TaskTemplate[];
  onAddTemplate?: (template: TaskTemplate) => void;
  onToggleTemplateStatus?: (templateId: string) => void;
  isDarkMode?: boolean;
}

export default function SchedulesPage({
  tasks,
  currentUser,
  users = [],
  templates = [],
  onAddTemplate,
  onToggleTemplateStatus,
  isDarkMode = false,
}: SchedulesPageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Form state for new template
  const [tempTitle, setTempTitle] = useState('');
  const [tempDesc, setTempDesc] = useState('');
  const [tempPriority, setTempPriority] = useState<('Low' | 'Medium' | 'High' | 'Critical')[]>(['Medium']);
  const [tempRecurrence, setTempRecurrence] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly'>('Monthly');
  const [tempAssignToEmail, setTempAssignToEmail] = useState('');
  const [tempStartDate, setTempStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [templateSuccessMessage, setTemplateSuccessMessage] = useState<string | null>(null);
  const [templateErrorMessage, setTemplateErrorMessage] = useState<string | null>(null);

  // Filter templates based on search
  const filteredTemplates = templates.filter(t => {
    const q = searchQuery.toLowerCase();
    return t.Title.toLowerCase().includes(q) || 
           t.Description.toLowerCase().includes(q) ||
           t.AssignedToEmail.toLowerCase().includes(q);
  });

  const handleCreateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    setTemplateErrorMessage(null);

    if (!tempTitle.trim() || !tempDesc.trim() || !tempAssignToEmail) {
      setTemplateErrorMessage('Enter a title, description, and an assignee email.');
      return;
    }
    if (!tempStartDate || Number.isNaN(new Date(tempStartDate).getTime())) {
      setTemplateErrorMessage('Choose a valid start date.');
      return;
    }

    const matchedUser = users.find(u => u.Email.toLowerCase() === tempAssignToEmail.toLowerCase());
    if (!matchedUser) {
      setTemplateErrorMessage('Assignee email doesn\'t match any existing user.');
      return;
    }

    if (!currentUser) {
      setTemplateErrorMessage('User not authenticated.');
      return;
    }

    const newId = `TMP-${Date.now()}`;
    const now = new Date().toISOString();

    onAddTemplate?.({
      TemplateID: newId,
      Title: tempTitle.trim(),
      Description: tempDesc.trim(),
      Priority: tempPriority,
      RecurrenceType: tempRecurrence,
      StartDate: tempStartDate,
      NextGenerationDate: '',
      LastGeneratedDate: '',
      AssignedByEmail: currentUser.Email,
      AssignedToEmail: tempAssignToEmail,
      AssignedToRole: 'Stakeholder',
      TeamID: '',
      Active: true,
      CreatedAt: now,
      UpdatedAt: now,
    });

    setTemplateSuccessMessage(`Schedule template ${newId} created.`);
    setTimeout(() => setTemplateSuccessMessage(null), 3000);
    setTempTitle('');
    setTempDesc('');
    setTempPriority(['Medium']);
    setTempAssignToEmail('');
    setIsCreateModalOpen(false);
  };

  const getRecurrenceColor = (recurrence: string) => {
    switch (recurrence) {
      case 'Daily': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Weekly': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'Monthly': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Quarterly': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Half-yearly': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-slate-500/10 text-secondary border-slate-500/20';
    }
  };

  const getPriorityColor = (priority: string | string[]) => {
    const priorities = Array.isArray(priority) ? priority : [priority];
    // Use the highest priority for styling
    const priorityOrder = ['Low', 'Medium', 'High', 'Critical'];
    const highestPriority = priorities.reduce((highest, current) => {
      return priorityOrder.indexOf(current) > priorityOrder.indexOf(highest) ? current : highest;
    }, 'Low');

    switch (highestPriority) {
      case 'Critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'High': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Medium': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Low': return 'bg-green-500/10 text-green-400 border-green-500/20';
      default: return 'bg-slate-500/10 text-secondary border-slate-500/20';
    }
  };

  if (!currentUser || !isAdminLevel(currentUser.Role)) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-yellow-800">
              You don't have permission to access Schedules. This feature is for administrators only.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-xl p-6 bg-surface border-token">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-semibold text-lg text-primary">
              Recurring Task Schedules
            </h3>
            <p className="text-sm mt-1 text-muted">
              Manage recurring task templates that auto-generate task instances
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center space-x-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            <span>Create Schedule</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search schedules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
          />
        </div>

        {filteredTemplates.length === 0 ? (
          <div className={`p-12 text-center text-muted`}>
            {searchQuery ? 'No schedules match your search' : 'No recurring task schedules configured yet'}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTemplates.map(template => (
              <div key={template.TemplateID} className={`border rounded-lg p-4 ${isDarkMode ? 'bg-[#1E293B] border-[#334155]' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className={`font-medium text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                        {template.Title}
                      </h4>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${getRecurrenceColor(template.RecurrenceType)}`}>
                        {template.RecurrenceType}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded border ${getPriorityColor(template.Priority)}`}>
                        {Array.isArray(template.Priority) ? template.Priority.join(', ') : template.Priority}
                      </span>
                      {!template.Active && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 border-gray-500/20">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className={`text-sm mb-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      {template.Description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted">
                      <div className="flex items-center gap-1">
                        <User size={12} />
                        <span>{template.AssignedToEmail}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar size={12} />
                        <span>Start: {template.StartDate}</span>
                      </div>
                      {template.LastGeneratedDate && (
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>Last: {template.LastGeneratedDate}</span>
                        </div>
                      )}
                      {template.NextGenerationDate && (
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>Next: {template.NextGenerationDate}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onToggleTemplateStatus?.(template.TemplateID)}
                      className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-[#334155]' : 'hover:bg-slate-200'}`}
                      title={template.Active ? 'Deactivate' : 'Activate'}
                    >
                      {template.Active ? (
                        <AlertCircle size={16} className={isDarkMode ? 'text-green-400' : 'text-green-600'} />
                      ) : (
                        <AlertCircle size={16} className={isDarkMode ? 'text-gray-400' : 'text-gray-500'} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className={`w-full max-w-lg rounded-xl p-6 shadow-2xl border ${isDarkMode ? 'bg-[#0F141F] border-token' : 'bg-surface border-token'}`}>
            <div className="flex items-center justify-between mb-6">
              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Create Recurring Schedule
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className={`p-1 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-[#1E293B] text-secondary' : 'hover:bg-slate-100 text-slate-500'}`}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTemplate} className="space-y-4">
              {templateErrorMessage && (
                <div className={`p-3 rounded-lg text-sm ${isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'}`}>
                  {templateErrorMessage}
                </div>
              )}

              {templateSuccessMessage && (
                <div className={`p-3 rounded-lg text-sm ${isDarkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-50 text-green-700'}`}>
                  {templateSuccessMessage}
                </div>
              )}

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Title
                </label>
                <input
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                  placeholder="e.g., Weekly Status Report"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Description
                </label>
                <textarea
                  value={tempDesc}
                  onChange={(e) => setTempDesc(e.target.value)}
                  rows={3}
                  className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                  placeholder="Describe the recurring task..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Priority (select multiple)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(['Low', 'Medium', 'High', 'Critical'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          if (tempPriority.includes(p)) {
                            setTempPriority(tempPriority.filter(pr => pr !== p));
                          } else {
                            setTempPriority([...tempPriority, p]);
                          }
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                          tempPriority.includes(p)
                            ? 'bg-blue-600 text-white'
                            : isDarkMode
                              ? 'bg-[#1E293B] border border-[#334155] text-slate-300 hover:border-blue-500'
                              : 'bg-slate-50 border border-slate-200 text-slate-600 hover:border-blue-500'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Recurrence
                  </label>
                  <select
                    value={tempRecurrence}
                    onChange={(e) => setTempRecurrence(e.target.value as any)}
                    className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Quarterly">Quarterly</option>
                    <option value="Half-yearly">Half-yearly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Assign to (Email)
                </label>
                <input
                  type="email"
                  value={tempAssignToEmail}
                  onChange={(e) => setTempAssignToEmail(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Start Date
                </label>
                <input
                  type="date"
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDarkMode ? 'bg-[#1E293B] border-[#334155] text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-[#1E293B] text-white hover:bg-[#334155]' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                  Create Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
