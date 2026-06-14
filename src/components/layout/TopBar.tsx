import React, { useState, useEffect } from 'react';
import { Search, Plus, Bell, Sun, Moon, User, MoreVertical, LogOut } from 'lucide-react';

interface TopBarProps {
  title: string;
  breadcrumb?: string;
  onQuickCreate?: () => void;
  onSearch?: (query: string) => void;
  onLogout?: () => void;
}

export default function TopBar({ title, breadcrumb, onQuickCreate, onSearch, onLogout }: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('trustgrid_theme');
    return savedTheme === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('trustgrid_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    onSearch?.(query);
  };

  return (
    <header className="h-16 bg-surface border-b border-[var(--color-border)] flex items-center justify-between px-6 sticky top-0 z-20">
      {/* Left: Page title and breadcrumb */}
      <div className="flex items-center gap-3 flex-1">
        {breadcrumb && (
          <span className="text-sm text-muted">{breadcrumb}</span>
        )}
        <h1 className="text-xl font-semibold text-[#0f172a]">{title}</h1>
      </div>

      {/* Center: Global search */}
      <div className="flex-1 max-w-md mx-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search tasks, people, schedules..."
            value={searchQuery}
            onChange={handleSearch}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-[var(--color-border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
          />
        </div>
      </div>

      {/* Right: Quick actions */}
      <div className="flex items-center gap-2 flex-1 justify-end">
        {/* Quick create */}
        {onQuickCreate && (
          <button
            onClick={onQuickCreate}
            className="flex items-center gap-2 px-3 py-2 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Quick Create</span>
          </button>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors relative"
          >
            <Bell size={20} className="text-muted" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--color-danger)] rounded-full" />
          </button>
          
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-surface border border-[var(--color-border)] rounded-lg shadow-lg z-50">
              <div className="p-3 border-b border-[var(--color-border)]">
                <h3 className="text-sm font-semibold text-[#0f172a]">Notifications</h3>
              </div>
              <div className="p-3 text-sm text-muted text-center">
                No new notifications
              </div>
            </div>
          )}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
          title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDarkMode ? <Sun size={20} className="text-muted" /> : <Moon size={20} className="text-muted" />}
        </button>

        {/* User menu */}
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
