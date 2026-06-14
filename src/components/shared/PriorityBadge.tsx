import React from 'react';

type PriorityType = 'Low' | 'Medium' | 'High' | 'Critical';

interface PriorityBadgeProps {
  priority: PriorityType;
  size?: 'sm' | 'md';
}

const priorityConfig: Record<PriorityType, { color: string; bgColor: string }> = {
  Low: { color: '#64748b', bgColor: '#f1f5f9' },
  Medium: { color: '#2563eb', bgColor: '#dbeafe' },
  High: { color: '#f59e0b', bgColor: '#fef3c7' },
  Critical: { color: '#dc2626', bgColor: '#fee2e2' },
};

export default function PriorityBadge({ priority, size = 'md' }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-sm px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses}`}
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
      }}
    >
      {priority}
    </span>
  );
}
