import React, { useState } from 'react';
import Modal from '../shared/Modal';
import FormField from '../shared/FormField';
import { Calendar, Save, X } from 'lucide-react';
import { Task, TaskStatus } from '../../types';

interface TaskCreationFormProps {
  isOpen: boolean;
  onClose: () => void;
  task?: Task | null;
  onSubmit: (data: TaskFormData) => void;
  users?: { email: string; name: string }[];
  teams?: { id: string; name: string }[];
}

export interface TaskFormData {
  title: string;
  description: string;
  category: string;
  taskType: 'One-time' | 'Recurring';
  recurrenceType: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Half-yearly' | 'One-time';
  startDate: string;
  dueDate: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  assigneeEmail: string;
  assignedByEmail: string;
  teamId: string;
  attachmentLink: string;
}

export default function TaskCreationForm({
  isOpen,
  onClose,
  task,
  onSubmit,
  users = [],
  teams = [],
}: TaskCreationFormProps) {
  const [formData, setFormData] = useState<TaskFormData>({
    title: task?.Title || '',
    description: task?.Description || '',
    category: task?.Category || '',
    taskType: task?.TaskType || 'One-time',
    recurrenceType: task?.RecurrenceType || 'One-time',
    startDate: task?.StartDate || new Date().toISOString().split('T')[0],
    dueDate: task?.DueDate || '',
    priority: task?.Priority || 'Medium',
    assigneeEmail: task?.AssignedToEmail || '',
    assignedByEmail: task?.AssignedByEmail || '',
    teamId: task?.TeamID || '',
    attachmentLink: task?.AttachmentLink || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (!formData.description.trim()) {
      newErrors.description = 'Description is required';
    }

    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    }

    if (!formData.assigneeEmail) {
      newErrors.assigneeEmail = 'Assignee is required';
    }

    if (!formData.teamId) {
      newErrors.teamId = 'Team is required';
    }

    if (formData.startDate && formData.dueDate && new Date(formData.dueDate) < new Date(formData.startDate)) {
      newErrors.dueDate = 'Due date must be after start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(formData);
      handleClose();
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      category: '',
      taskType: 'One-time',
      recurrenceType: 'One-time',
      startDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      priority: 'Medium',
      assigneeEmail: '',
      assignedByEmail: '',
      teamId: '',
      attachmentLink: '',
    });
    setErrors({});
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl" title={task ? 'Edit Task' : 'Create Task'}>
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <FormField label="Title" required error={errors.title}>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Task title"
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </FormField>

            <FormField label="Description" required error={errors.description}>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the task..."
                rows={4}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
              />
            </FormField>

            <FormField label="Category">
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Development, Design, Marketing"
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </FormField>

            <FormField label="Task Type">
              <select
                value={formData.taskType}
                onChange={(e) => setFormData({ ...formData, taskType: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              >
                <option value="One-time">One-time</option>
                <option value="Recurring">Recurring</option>
              </select>
            </FormField>

            {formData.taskType === 'Recurring' && (
              <FormField label="Recurrence Type">
                <select
                  value={formData.recurrenceType}
                  onChange={(e) => setFormData({ ...formData, recurrenceType: e.target.value as any })}
                  className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Half-yearly">Half-yearly</option>
                </select>
              </FormField>
            )}

            <FormField label="Priority">
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </FormField>

            <FormField label="Attachment Link (optional)">
              <input
                type="url"
                value={formData.attachmentLink}
                onChange={(e) => setFormData({ ...formData, attachmentLink: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </FormField>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <FormField label="Start Date">
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                />
              </div>
            </FormField>

            <FormField label="Due Date" required error={errors.dueDate}>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                />
              </div>
            </FormField>

            <FormField label="Assignee" required error={errors.assigneeEmail}>
              <select
                value={formData.assigneeEmail}
                onChange={(e) => setFormData({ ...formData, assigneeEmail: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              >
                <option value="">Select assignee</option>
                {users.map((user) => (
                  <option key={user.email} value={user.email}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Assigned By">
              <select
                value={formData.assignedByEmail}
                onChange={(e) => setFormData({ ...formData, assignedByEmail: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              >
                <option value="">Select assigner</option>
                {users.map((user) => (
                  <option key={user.email} value={user.email}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Team" required error={errors.teamId}>
              <select
                value={formData.teamId}
                onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              >
                <option value="">Select team</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </FormField>

            {/* Notification Preview */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-[#0f172a] mb-2">Notification Preview</h4>
              <p className="text-xs text-muted">
                An email notification will be sent to {formData.assigneeEmail || 'the assignee'} when this task is created.
              </p>
            </div>

            {/* Visibility Notes */}
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="text-sm font-medium text-[#0f172a] mb-2">Visibility</h4>
              <p className="text-xs text-muted">
                This task will be visible to the assignee, assigner, and team members with appropriate permissions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
        <button
          onClick={handleClose}
          className="px-4 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <Save size={16} />
          <span>{task ? 'Save changes' : 'Create task'}</span>
        </button>
      </div>
    </Modal>
  );
}
