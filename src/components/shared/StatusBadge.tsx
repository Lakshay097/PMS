import React from 'react';

type StatusType = 'Not Started' | 'In Progress' | 'Submitted' | 'Reviewed' | 'Closed' | 'Reopened' | 'Overdue';

interface StatusBadgeProps {
  status: StatusType;
  size?: 'sm' | 'md';
}

const statusConfig: Record<StatusType, { color: string; bgColor: string }> = {
  'Not Started': { color: '#64748b', bgColor: '#f1f5f9' },
  'In Progress': { color: '#2563eb', bgColor: '#dbeafe' },
  'Submitted': { color: '#f59e0b', bgColor: '#fef3c7' },
  'Reviewed': { color: '#8b5cf6', bgColor: '#ede9fe' },
  'Closed': { color: '#16a34a', bgColor: '#dcfce7' },
  'Reopened': { color: '#ea580c', bgColor: '#ffedd5' },
  'Overdue': { color: '#dc2626', bgColor: '#fee2e2' },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status];
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses}`}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
      }}
    >
      {status}
    </span>
  );
}
