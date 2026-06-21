import React, { useState } from 'react';
import { Mail, Send, Save, Copy, RotateCcw, Smartphone, Monitor, Code } from 'lucide-react';
import { logger } from '../../../utils/logger';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: 'task-assignment' | 'progress-update' | 'overdue-alert' | 'system-notification';
}

interface EmailTemplatesEditorProps {
  onBack?: () => void;
}

export default function EmailTemplatesEditor({ onBack }: EmailTemplatesEditorProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate>({
    id: '1',
    name: 'Task Assignment',
    subject: 'New task assigned: {{task_title}}',
    body: 'Hello {{assignee_name}},\n\nYou have been assigned a new task:\n\nTask: {{task_title}}\nDue Date: {{due_date}}\nPriority: {{priority}}\n\nPlease review and start working on this task.\n\nBest regards,\nPMS Team',
    category: 'task-assignment',
  });

  const [subject, setSubject] = useState(selectedTemplate.subject);
  const [body, setBody] = useState(selectedTemplate.body);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showRawHtml, setShowRawHtml] = useState(false);

  const templates: EmailTemplate[] = [
    {
      id: '1',
      name: 'Task Assignment',
      subject: 'New task assigned: {{task_title}}',
      body: 'Hello {{assignee_name}},\n\nYou have been assigned a new task:\n\nTask: {{task_title}}\nDue Date: {{due_date}}\nPriority: {{priority}}\n\nPlease review and start working on this task.\n\nBest regards,\nPMS Team',
      category: 'task-assignment',
    },
    {
      id: '2',
      name: 'Progress Update',
      subject: 'Progress update on {{task_title}}',
      body: 'Hello,\n\nA progress update has been submitted for task: {{task_title}}\n\nStatus: {{status}}\nProgress: {{percent_complete}}%\n\nView the task for more details.\n\nBest regards,\nPMS Team',
      category: 'progress-update',
    },
    {
      id: '3',
      name: 'Overdue Alert',
      subject: 'OVERDUE: {{task_title}}',
      body: 'Hello {{assignee_name}},\n\nThe following task is now overdue:\n\nTask: {{task_title}}\nDue Date: {{due_date}}\n\nPlease address this immediately.\n\nBest regards,\nPMS Team',
      category: 'overdue-alert',
    },
    {
      id: '4',
      name: 'System Notification',
      subject: 'System Notification: {{notification_type}}',
      body: 'Hello,\n\n{{notification_message}}\n\nThis is an automated notification from PMS.\n\nBest regards,\nPMS Team',
      category: 'system-notification',
    },
  ];

  const variables = [
    { name: '{{task_title}}', description: 'Task title' },
    { name: '{{assignee_name}}', description: 'Assignee full name' },
    { name: '{{due_date}}', description: 'Task due date' },
    { name: '{{priority}}', description: 'Task priority' },
    { name: '{{status}}', description: 'Current status' },
    { name: '{{percent_complete}}', description: 'Completion percentage' },
    { name: '{{notification_type}}', description: 'Notification type' },
    { name: '{{notification_message}}', description: 'Notification message' },
  ];

  const handleTemplateSelect = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    setSubject(template.subject);
    setBody(template.body);
  };

  const handleSave = () => {
    // Save logic
    logger.log('Saving template:', { subject, body });
  };

  const handleTestSend = () => {
    // Test send logic
    logger.log('Sending test email');
  };

  const handleDuplicate = () => {
    // Duplicate logic
    logger.log('Duplicating template');
  };

  const handleRestoreDefault = () => {
    // Restore default logic
    const defaultTemplate = templates.find(t => t.id === selectedTemplate.id);
    if (defaultTemplate) {
      setSubject(defaultTemplate.subject);
      setBody(defaultTemplate.body);
    }
  };

  const insertVariable = (variable: string) => {
    setBody(body + variable);
  };

  const getPreviewContent = () => {
    let content = body
      .replace(/{{task_title}}/g, 'Complete Project Documentation')
      .replace(/{{assignee_name}}/g, 'John Doe')
      .replace(/{{due_date}}/g, 'December 31, 2024')
      .replace(/{{priority}}/g, 'High')
      .replace(/{{status}}/g, 'In Progress')
      .replace(/{{percent_complete}}/g, '75')
      .replace(/{{notification_type}}/g, 'System Update')
      .replace(/{{notification_message}}/g, 'The system has been updated successfully.');

    return content.split('\n').map((line, i) => (
      <p key={i} className="mb-2 last:mb-0">{line || <br />}</p>
    ));
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-sm text-[var(--color-accent)] hover:underline"
              >
                ← Admin
              </button>
            )}
            <h1 className="text-xl font-semibold text-[#0f172a]">Email Templates</h1>
          </div>
          <p className="text-sm text-muted mt-1">Manage notification and alert templates</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestoreDefault}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
          >
            <RotateCcw size={16} />
            <span>Restore default</span>
          </button>
          <button
            onClick={handleDuplicate}
            className="flex items-center gap-2 px-3 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
          >
            <Copy size={16} />
            <span>Duplicate</span>
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Save size={16} />
            <span>Save</span>
          </button>
        </div>
      </div>

      {/* Two-column split editor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Template selector and editor */}
        <div className="space-y-4">
          {/* Template selector */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-medium text-[#0f172a] mb-3">Select Template</h3>
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className={`w-full text-left p-3 rounded-md transition-colors ${
                    selectedTemplate.id === template.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Mail size={16} className="text-muted" />
                    <span className="text-sm font-medium text-[#0f172a]">{template.name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Subject line */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
            <label className="block text-sm font-medium text-[#0f172a] mb-2">Subject Line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
              className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            />
          </div>

          {/* Message body editor */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#0f172a]">Message Body</label>
              <button
                onClick={() => setShowRawHtml(!showRawHtml)}
                className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
              >
                <Code size={12} />
                <span>{showRawHtml ? 'Visual' : 'Raw HTML'}</span>
              </button>
            </div>
            {showRawHtml ? (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Email body in HTML..."
                rows={12}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
              />
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Email body..."
                rows={12}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
              />
            )}
          </div>

          {/* Variable chips */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-medium text-[#0f172a] mb-3">Available Variables</h3>
            <div className="flex flex-wrap gap-2">
              {variables.map((variable) => (
                <button
                  key={variable.name}
                  onClick={() => insertVariable(variable.name)}
                  className="px-3 py-1.5 bg-blue-50 text-[var(--color-accent)] rounded-md text-xs font-medium hover:bg-blue-100 transition-colors"
                  title={variable.description}
                >
                  {variable.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Live preview */}
        <div className="space-y-4">
          <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-[#0f172a]">Live Preview</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-2 rounded-md transition-colors ${
                    previewDevice === 'desktop' ? 'bg-blue-100 text-[var(--color-accent)]' : 'hover:bg-gray-100'
                  }`}
                >
                  <Monitor size={16} />
                </button>
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-2 rounded-md transition-colors ${
                    previewDevice === 'mobile' ? 'bg-blue-100 text-[var(--color-accent)]' : 'hover:bg-gray-100'
                  }`}
                >
                  <Smartphone size={16} />
                </button>
              </div>
            </div>

            {/* Preview container */}
            <div
              className={`bg-white border border-gray-200 rounded-lg p-6 ${
                previewDevice === 'mobile' ? 'max-w-sm mx-auto' : ''
              }`}
            >
              <div className="border-b border-gray-200 pb-4 mb-4">
                <div className="text-xs text-muted mb-1">Subject:</div>
                <div className="text-sm font-medium text-[#0f172a]">
                  {subject
                    .replace(/{{task_title}}/g, 'Complete Project Documentation')
                    .replace(/{{notification_type}}/g, 'System Update')}
                </div>
              </div>
              <div className="text-sm text-[#0f172a] whitespace-pre-line">
                {getPreviewContent()}
              </div>
            </div>

            {/* Test send action */}
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <button
                onClick={handleTestSend}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
              >
                <Send size={16} />
                <span>Send test email</span>
              </button>
            </div>
          </div>

          {/* Template info */}
          <div className="bg-surface rounded-lg border border-[var(--color-border)] p-4">
            <h3 className="text-sm font-medium text-[#0f172a] mb-3">Template Information</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Name:</span>
                <span className="text-[#0f172a]">{selectedTemplate.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Category:</span>
                <span className="text-[#0f172a] capitalize">{selectedTemplate.category.replace('-', ' ')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Last modified:</span>
                <span className="text-[#0f172a]">Today</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
