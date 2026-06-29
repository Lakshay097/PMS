import React from 'react';
import { Trash2, CheckSquare, Download, X } from 'lucide-react';

interface BulkAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  variant?: 'danger' | 'primary' | 'default';
}

interface BulkActionBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
}

export default function BulkActionBar({ selectedCount, actions, onClear }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white border border-[#E5E7EB] rounded-lg shadow-2xl px-4 py-3 flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{selectedCount} selected</span>
      </div>
      
      <div className="h-6 w-px bg-slate-200" />
      
      <div className="flex items-center gap-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              action.variant === 'danger'
                ? 'text-red-600 hover:bg-red-50'
                : action.variant === 'primary'
                ? 'text-blue-600 hover:bg-blue-50'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
      
      <div className="h-6 w-px bg-slate-200" />
      
      <button
        onClick={onClear}
        className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-slate-600"
      >
        <X size={16} />
      </button>
    </div>
  );
}
