import React from 'react';

interface TimelineItemProps {
  title: string;
  timestamp: string;
  description?: string;
  actor?: string;
  icon?: React.ReactNode;
  status?: 'default' | 'success' | 'warning' | 'danger';
}

const statusColors = {
  default: 'bg-gray-300',
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger)]',
};

export default function TimelineItem({
  title,
  timestamp,
  description,
  actor,
  icon,
  status = 'default',
}: TimelineItemProps) {
  return (
    <div className="flex gap-3 pb-4 last:pb-0">
      <div className="flex flex-col items-center">
        <div className={`w-2 h-2 rounded-full ${statusColors[status]} mt-1.5`} />
        <div className="w-0.5 flex-1 bg-gray-200 mt-1" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {icon && <span className="text-muted">{icon}</span>}
              <h4 className="text-sm font-medium text-[#0f172a]">{title}</h4>
            </div>
            {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
            {actor && <p className="text-xs text-muted mt-0.5">by {actor}</p>}
          </div>
          <span className="text-xs text-muted whitespace-nowrap">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}
