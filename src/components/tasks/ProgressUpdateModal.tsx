import React, { useState } from 'react';
import Modal from '../shared/Modal';
import FormField from '../shared/FormField';
import StatusBadge from '../shared/StatusBadge';
import { Calendar, AlertTriangle, ArrowRight, Save, X } from 'lucide-react';
import { Task, TaskStatus } from '../../types';

interface ProgressUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSubmit: (data: ProgressUpdateData) => void;
}

export interface ProgressUpdateData {
  status: TaskStatus;
  workSummary: string;
  blockers: string;
  nextAction: string;
  newEta?: string;
  attachment?: string;
}

export default function ProgressUpdateModal({ isOpen, onClose, task, onSubmit }: ProgressUpdateModalProps) {
  const [status, setStatus] = useState<TaskStatus>('In Progress');
  const [workSummary, setWorkSummary] = useState('');
  const [blockers, setBlockers] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [newEta, setNewEta] = useState('');
  const [attachment, setAttachment] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!workSummary.trim()) {
      newErrors.workSummary = 'Work summary is required';
    }

    if (newEta && new Date(newEta) < new Date()) {
      newErrors.newEta = 'New ETA cannot be in the past';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit({
        status,
        workSummary,
        blockers,
        nextAction,
        newEta: newEta || undefined,
        attachment: attachment || undefined,
      });
      handleClose();
    }
  };

  const handleSaveDraft = () => {
    // Save draft logic
    handleClose();
  };

  const handleClose = () => {
    setStatus('In Progress');
    setWorkSummary('');
    setBlockers('');
    setNextAction('');
    setNewEta('');
    setAttachment('');
    setErrors({});
    onClose();
  };

  if (!task) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="lg" title="Submit Progress Update">
      <div className="p-6 space-y-6">
        {/* Task Summary Header */}
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[#0f172a] mb-1">{task.Title}</h3>
              <div className="flex items-center gap-2 text-sm text-muted">
                <span>ID: {task.TaskID}</span>
                <span>•</span>
                <span>Due: {new Date(task.DueDate).toLocaleDateString()}</span>
              </div>
            </div>
            <StatusBadge status={task.Status} />
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Status */}
          <FormField label="Status" required error={errors.status}>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            >
              <option value="Not Started">Not Started</option>
              <option value="In Progress">In Progress</option>
              <option value="Submitted">Submitted</option>
              <option value="Reviewed">Reviewed</option>
              <option value="Closed">Closed</option>
              <option value="Overdue">Overdue</option>
            </select>
          </FormField>

          {/* Work Summary */}
          <FormField label="Work Summary" required error={errors.workSummary} helperText="Describe the progress made on this task">
            <textarea
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              placeholder="What progress have you made?"
              rows={4}
              className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
            />
          </FormField>

          {/* Blockers */}
          <FormField label="Blockers" error={errors.blockers} helperText="Any obstacles preventing progress?">
            <textarea
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              placeholder="Describe any blockers or issues..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
            />
          </FormField>

          {/* Next Action */}
          <FormField label="Next Action" error={errors.nextAction} helperText="What's the next step?">
            <textarea
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              placeholder="What will you do next?"
              rows={2}
              className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
            />
          </FormField>

          {/* ETA Adjustment */}
          <FormField label="New ETA (optional)" error={errors.newEta} helperText="Adjust the due date if needed">
            <div className="relative">
              <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="date"
                value={newEta}
                onChange={(e) => setNewEta(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </div>
          </FormField>

          {/* Attachment */}
          <FormField label="Attachment Link (optional)" error={errors.attachment}>
            <input
              type="url"
              value={attachment}
              onChange={(e) => setAttachment(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
            />
          </FormField>
        </div>

        {/* Validation Summary */}
        {Object.keys(errors).length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="text-sm text-danger">
              Please fix the errors above before submitting.
            </div>
          </div>
        )}
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
          onClick={handleSaveDraft}
          className="flex items-center gap-2 px-4 py-2 border border-[var(--color-border)] rounded-md text-sm text-[#0f172a] hover:bg-gray-50 transition-colors"
        >
          <Save size={16} />
          <span>Save draft</span>
        </button>
        <button
          onClick={handleSubmit}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <span>Submit update</span>
          <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
