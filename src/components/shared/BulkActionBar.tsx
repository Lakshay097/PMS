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
  isDarkMode?: boolean;
}

export default function BulkActionBar({ selectedCount, actions, onClear, isDarkMode = false }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-lg shadow-2xl px-4 py-3 flex items-center gap-4 ${isDarkMode ? 'bg-[#0F141F] border-[#1E293B]' : 'bg-white border-[#E5E7EB]'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium text-primary`}>{selectedCount} selected</span>
      </div>
      
      <div className={`h-6 w-px ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
      
      <div className="flex items-center gap-2">
        {actions.map((action, index) => (
          <button
            key={index}
            onClick={action.onClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              action.variant === 'danger'
                ? isDarkMode ? 'text-red-400 hover:bg-red-900/30' : 'text-red-600 hover:bg-red-50'
                : action.variant === 'primary'
                ? isDarkMode ? 'text-blue-400 hover:bg-blue-900/30' : 'text-blue-600 hover:bg-blue-50'
                : isDarkMode ? 'text-secondary hover:text-primary hover-surface' : 'text-secondary hover:text-primary hover-surface'
            }`}
          >
            {action.icon}
            <span className={`text-${action.variant === 'danger' ? 'red' : action.variant === 'primary' ? 'blue' : 'secondary'}`}>{action.label}</span>
          </button>
        ))}
      </div>
      
      <div className={`h-6 w-px ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`} />
      
      <button
        onClick={onClear}
        className={`p-1.5 rounded-md transition-colors ${isDarkMode ? 'hover-surface text-secondary hover:text-primary' : 'hover-surface text-secondary hover:text-primary'}`}
      >
        <X size={16} />
      </button>
    </div>
  );
}
