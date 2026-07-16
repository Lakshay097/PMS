import React from 'react';
import { Paperclip } from 'lucide-react';

interface TimelineItemProps {
  title: string;
  timestamp: string;
  description?: string;
  actor?: string;
  icon?: React.ReactNode;
  status?: 'default' | 'success' | 'warning' | 'danger';
  attachments?: string[];
}

const statusColors = {
  default: 'bg-gray-300',
  success: 'bg-[var(--color-success)]',
  warning: 'bg-[var(--color-warning)]',
  danger: 'bg-[var(--color-danger)]',
};

// Helper function to extract filename from URL
function getFileNameFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const fileName = pathname.split('/').pop();
    if (!fileName || fileName === '/') {
      return url;
    }
    if (!fileName.includes('.')) {
      return url;
    }
    return fileName;
  } catch {
    return url;
  }
}

export default function TimelineItem({
  title,
  timestamp,
  description,
  actor,
  icon,
  status = 'default',
  attachments,
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
            {attachments && attachments.length > 0 && (
              <div className="mt-2 space-y-1">
                {attachments.map((link, idx) => (
                  <a
                    key={idx}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline"
                  >
                    <Paperclip size={12} />
                    <span className="truncate">{getFileNameFromUrl(link)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <span className="text-xs text-muted whitespace-nowrap">{timestamp}</span>
        </div>
      </div>
    </div>
  );
}
