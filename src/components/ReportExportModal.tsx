// src/components/ReportExportModal.tsx
// "Choose what to see and download" modal.
// Lets the user pick stakeholders, sections (active / completed / overdue /
// not worked on), report details, attachments, and a date range — then
// generates the styled stakeholder PDF.

import React, { useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import { Task, TaskReport, User } from '../types';
import {
  generateStakeholderReport,
  ReportExportOptions,
  DEFAULT_EXPORT_OPTIONS,
} from '../utils/stakeholderReportGenerator';

interface ReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  reports: TaskReport[];
  users: User[];
  isDarkMode: boolean;
}

export default function ReportExportModal({
  isOpen,
  onClose,
  tasks,
  reports,
  users,
  isDarkMode,
}: ReportExportModalProps) {
  const [options, setOptions] = useState<ReportExportOptions>({ ...DEFAULT_EXPORT_OPTIONS });
  const [isGenerating, setIsGenerating] = useState(false);

  if (!isOpen) return null;

  // Stakeholders = users who have at least one assigned task
  const stakeholders = users.filter(u =>
    tasks.some(t => t.AssignedToEmail === u.Email)
  );

  const toggleSection = (key: keyof ReportExportOptions) =>
    setOptions(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleStakeholder = (email: string) =>
    setOptions(prev => ({
      ...prev,
      stakeholderEmails: prev.stakeholderEmails.includes(email)
        ? prev.stakeholderEmails.filter(e => e !== email)
        : [...prev.stakeholderEmails, email],
    }));

  const allSelected = options.stakeholderEmails.length === 0;

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const blob = await generateStakeholderReport(tasks, reports, users, options);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Stakeholder-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
    } catch (error) {
    } finally {
      setIsGenerating(false);
    }
  };

  const panel = isDarkMode
    ? 'bg-[#0F141F] border-[#1E293B] text-slate-200'
    : 'bg-white border-[#E5E7EB] text-slate-800';
  const subtle = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-sm border transition-colors ${
      active
        ? 'bg-blue-600 border-blue-600 text-white'
        : isDarkMode
          ? 'border-[#1E293B] text-slate-300 hover:border-blue-500'
          : 'border-slate-300 text-slate-600 hover:border-blue-500'
    }`;

  const sections: { key: keyof ReportExportOptions; label: string; hint: string }[] = [
    { key: 'includeSummaryDashboard', label: 'Summary overview', hint: 'Totals across all stakeholders' },
    { key: 'includeOverdueTasks', label: 'Overdue tasks', hint: 'Past due date, not completed' },
    { key: 'includeActiveTasks', label: 'Active tasks', hint: 'In progress with submitted reports' },
    { key: 'includeReports', label: 'Report details', hint: 'Work summary, blockers, next actions' },
    { key: 'includeCompletedTasks', label: 'Completed tasks', hint: 'Finished work' },
    { key: 'includeNotWorkedOn', label: 'Tasks not worked on', hint: 'No reports submitted yet' },
    { key: 'includeAttachments', label: 'Attachments', hint: 'Embed images, link other files' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border ${panel}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-inherit">
          <div>
            <h2 className="text-lg font-semibold">Download stakeholder report</h2>
            <p className={`text-sm ${subtle}`}>Choose what to include, then download as PDF</p>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg hover:bg-slate-500/10`}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Stakeholder picker */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Stakeholders</h3>
            <div className="flex flex-wrap gap-2">
              <button
                className={chip(allSelected)}
                onClick={() => setOptions(prev => ({ ...prev, stakeholderEmails: [] }))}
              >
                All stakeholders
              </button>
              {stakeholders.map(u => (
                <button
                  key={u.Email}
                  className={chip(options.stakeholderEmails.includes(u.Email))}
                  onClick={() => toggleStakeholder(u.Email)}
                >
                  {u.FullName || u.Email}
                </button>
              ))}
            </div>
          </div>

          {/* Section toggles */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Sections to include</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sections.map(s => (
                <label
                  key={s.key}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                    isDarkMode ? 'border-[#1E293B] hover:border-blue-600' : 'border-slate-200 hover:border-blue-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-blue-600"
                    checked={Boolean(options[s.key])}
                    onChange={() => toggleSection(s.key)}
                  />
                  <span>
                    <span className="block text-sm font-medium">{s.label}</span>
                    <span className={`block text-xs ${subtle}`}>{s.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Report date range (optional)</h3>
            <div className="flex gap-3">
              <input
                type="date"
                value={options.dateFrom || ''}
                onChange={e => setOptions(prev => ({ ...prev, dateFrom: e.target.value || undefined }))}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                  isDarkMode ? 'bg-[#0B0F17] border-[#1E293B]' : 'bg-white border-slate-300'
                }`}
              />
              <input
                type="date"
                value={options.dateTo || ''}
                onChange={e => setOptions(prev => ({ ...prev, dateTo: e.target.value || undefined }))}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                  isDarkMode ? 'bg-[#0B0F17] border-[#1E293B]' : 'bg-white border-slate-300'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-5 border-t border-inherit">
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm border ${
              isDarkMode ? 'border-[#1E293B] hover:bg-slate-500/10' : 'border-slate-300 hover:bg-slate-50'
            }`}
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {isGenerating ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}