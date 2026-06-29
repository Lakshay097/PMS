import React, { useState } from 'react';
import { User, MoreVertical, LogOut, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TopBarProps {
  title: string;
  breadcrumb?: string;
  onLogout?: () => void;
  syncStatus?: 'synced' | 'syncing' | 'error';
  onManualSync?: () => void;
}

export default function TopBar({ title, breadcrumb, onLogout, syncStatus = 'synced', onManualSync }: TopBarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="h-16 bg-surface border-b border-[var(--color-border)] flex items-center justify-between px-6 sticky top-0 z-20">
      {/* Left: Page title and breadcrumb */}
      <div className="flex items-center gap-3">
        {breadcrumb && (
          <span className="text-sm text-muted">{breadcrumb}</span>
        )}
        <h1 className="text-xl font-semibold text-[#0f172a]">{title}</h1>
      </div>

      {/* Right: Sync status + Profile */}
      <div className="flex items-center gap-3">
        {/* Sync status indicator */}
        <button
          onClick={onManualSync}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${
            syncStatus === 'synced'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : syncStatus === 'syncing'
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}
          title={`Sync status: ${syncStatus}`}
        >
          {syncStatus === 'synced' && <CheckCircle2 size={14} />}
          {syncStatus === 'syncing' && <RefreshCw size={14} className="animate-spin" />}
          {syncStatus === 'error' && <AlertCircle size={14} />}
          <span className="hidden sm:inline">
            {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Sync Failed'}
          </span>
        </button>

        {/* User menu - positioned at far right */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <User size={16} className="text-muted" />
            </div>
            <MoreVertical size={16} className="text-muted" />
          </button>
          
          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-surface border border-[var(--color-border)] rounded-lg shadow-lg z-50">
              <div className="p-3 border-b border-[var(--color-border)]">
                <div className="text-sm font-medium text-[#0f172a]">John Doe</div>
                <div className="text-xs text-muted">john@example.com</div>
              </div>
              <div className="p-1">
                <button className="w-full text-left px-3 py-2 text-sm text-[#0f172a] hover:bg-gray-100 rounded-md">
                  Profile
                </button>
                <button className="w-full text-left px-3 py-2 text-sm text-[#0f172a] hover:bg-gray-100 rounded-md">
                  Settings
                </button>
                {onLogout && (
                  <button 
                    onClick={onLogout}
                    className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-gray-100 rounded-md flex items-center gap-2"
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
