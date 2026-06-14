import React from 'react';
import { X } from 'lucide-react';

interface FilterChipProps {
  label: string;
  active?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

export default function FilterChip({ label, active, onRemove, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-surface border border-[var(--color-border)] text-[#0f172a] hover:bg-gray-50'
      }`}
    >
      {label}
      {active && onRemove && (
        <X
          size={14}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="hover:opacity-70"
        />
      )}
    </button>
  );
}
