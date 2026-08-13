import React, { useState } from 'react';
import { Task, User as UserType } from '../../../types';
import { isAdminLevel } from '../../../constants/status';

interface TaskCardProps {
  task: Task;
  users?: UserType[];
  currentUser?: UserType;
  isDarkMode?: boolean;
  onTaskClick?: (task: Task) => void;
}

/**
 * Shared task card used across Active Tasks, Tasks, and Completed sections.
 *
 * Layout:
 *   Row 1: Title (left) + Status (right), baseline-aligned, text-only
 *   Row 2: "Assigned X days ago" (or "Completed in X days" for completed)
 *   Divider: 0.5px hairline
 *   Row 3: "Assigned: [date] · By: [name] · Due: [date]" (+ Completed for completed)
 *
 * No emoji, no colored badges/dots/backgrounds. All emphasis via typography.
 * Overdue is the ONLY status that gets underline treatment.
 */
export default function TaskCard({
  task,
  users = [],
  currentUser,
  isDarkMode = false,
  onTaskClick,
}: TaskCardProps) {
  const isCompleted = task.Status?.toLowerCase() === 'closed' || task.Status?.toLowerCase() === 'reviewed';

  // ── Date helpers ──────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const daysBetween = (from: Date, to: Date): number => {
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // ── Computed values ───────────────────────────────────────────
  const assignedDate = parseDate(task.CreatedAt);
  const dueDate = parseDate(task.DueDate);
  const completedDate = parseDate(task.CompletionDate);

  // Overdue: not completed AND due date is before today
  const isOverdue = !isCompleted && dueDate !== null && dueDate < today;
  const overdueDays = isOverdue && dueDate ? daysBetween(dueDate, today) : 0;

  // Assigned aging
  const assignedDaysAgo = assignedDate ? daysBetween(assignedDate, today) : 0;

  // Completed duration & delay
  const completedInDays = isCompleted && assignedDate && completedDate
    ? daysBetween(assignedDate, completedDate)
    : 0;
  const delayedDays = isCompleted && completedDate && dueDate && completedDate > dueDate
    ? daysBetween(dueDate, completedDate)
    : 0;

  // ── Status text (right side of Row 1) ─────────────────────────
  let statusText: string;
  let statusClass = 'text-[14px] font-medium tracking-wide text-primary';

  if (isCompleted) {
    statusText = delayedDays > 0 ? `Completed · delayed ${delayedDays} days` : 'Completed';
  } else if (isOverdue) {
    statusText = `Overdue by ${overdueDays} days`;
    // Overdue is the ONLY status with underline treatment
    statusClass = 'text-[15px] font-medium tracking-wide text-primary underline underline-offset-[3px]';
  } else if (task.Status?.toLowerCase() === 'in progress') {
    statusText = 'In progress';
  } else {
    statusText = 'Not started';
  }

  // ── Assigner name resolution ──────────────────────────────────
  const assigner = users.find(u =>
    u.Email?.toLowerCase() === (task.AssignedByEmail || '').toLowerCase()
  );
  const assignerName = assigner?.FullName || task.AssignedByEmail?.split('@')[0] || '—';

  // ── Row 2 text ────────────────────────────────────────────────
  const row2Text = isCompleted
    ? `Completed in ${completedInDays} days`
    : `Assigned ${assignedDaysAgo} days ago`;

  // ── Row 3 metadata ────────────────────────────────────────────
  const metadataParts = [
    `Assigned: ${formatDate(task.CreatedAt)}`,
    `By: ${assignerName}`,
    `Due: ${formatDate(task.DueDate)}`,
  ];
  if (isCompleted) {
    metadataParts.push(`Completed: ${formatDate(task.CompletionDate)}`);
  }
  const metadataText = metadataParts.join(' · ');

  return (
    <div
      onClick={(e) => { e.preventDefault(); onTaskClick?.(task); }}
      className="bg-surface border border-token rounded-xl px-5 py-4 cursor-pointer hover-surface transition-colors"
      style={{ borderWidth: '0.5px' }}
    >
      {/* Row 1: Title + Status */}
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[15px] font-medium text-primary truncate">
          {task.Title || 'Untitled Task'}
        </h4>
        <span className={`shrink-0 ${statusClass}`}>
          {statusText}
        </span>
      </div>

      {/* Row 2: Aging */}
      <p className="text-[13px] text-secondary mt-1">
        {row2Text}
      </p>

      {/* Divider */}
      <div className="my-3" style={{ borderTop: '0.5px solid var(--color-border)' }} />

      {/* Row 3: Metadata */}
      <p className="text-[12px] text-muted">
        {metadataText}
      </p>
    </div>
  );
}
