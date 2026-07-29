import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  LogOut,
  Menu,
  MoreVertical,
  Plus,
  RefreshCw,
  User,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { Moon, Sun } from 'lucide-react';

interface TopBarProps {
  title: string;
  breadcrumb?: string;
  onLogout: () => void;
  syncStatus?: 'synced' | 'syncing' | 'error';
  onManualSync?: () => void;
  onQuickCreate?: () => void;
  /** Opens the off-canvas sidebar on mobile */
  onOpenMobileNav?: () => void;
}

/**
 * Fixes vs previous version:
 * - Hamburger button (md:hidden) so the sidebar is reachable on mobile.
 * - px-6 → px-4 sm:px-6, title truncates instead of overflowing.
 * - Hardcoded text-[#0f172a] / hover:bg-gray-100 replaced with tokens
 *   so dark mode works.
 * - Theme toggle lives here (uses global ThemeContext).
 * - User menu closes on outside click.
 */
export default function TopBar({
  title,
  breadcrumb,
  onLogout,
  syncStatus = 'synced',
  onManualSync,
  onQuickCreate,
  onOpenMobileNav,
}: TopBarProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isDarkMode, toggleTheme } = useTheme();

  useEffect(() => {
    if (!showUserMenu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showUserMenu]);

  const syncStyles: Record<string, string> = {
    synced: 'bg-[var(--color-success-bg)] text-[var(--color-success-fg)]',
    syncing: 'bg-[var(--color-info-bg)] text-[var(--color-info-fg)]',
    error: 'bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)]',
  };

  return (
    <header className="h-14 sm:h-16 bg-surface border-b border-token flex items-center justify-between gap-2 px-4 sm:px-6 sticky top-0 z-20">
      {/* Left: hamburger (mobile) + title */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onOpenMobileNav}
          className="md:hidden p-2 -ml-2 rounded-md text-secondary hover-surface shrink-0"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        {breadcrumb && (
          <span className="hidden sm:inline text-sm text-muted shrink-0">{breadcrumb}</span>
        )}
        <h1 className="text-base sm:text-xl font-semibold text-primary truncate">{title}</h1>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {onQuickCreate && (
          <button
            onClick={onQuickCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium
              text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New task</span>
          </button>
        )}

        <button
          onClick={onManualSync}
          className={`btn-compact flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium
            hover:opacity-80 transition-opacity ${syncStyles[syncStatus]}`}
          aria-label={
            syncStatus === 'synced' ? 'Synced — tap to sync again'
            : syncStatus === 'syncing' ? 'Syncing'
            : 'Sync failed — tap to retry'
          }
        >
          {syncStatus === 'synced' && <CheckCircle2 size={14} />}
          {syncStatus === 'syncing' && <RefreshCw size={14} className="animate-spin" />}
          {syncStatus === 'error' && <AlertCircle size={14} />}
          <span className="hidden sm:inline">
            {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing…' : 'Sync failed'}
          </span>
        </button>

        <button
          onClick={toggleTheme}
          className="p-2 rounded-md text-secondary hover-surface"
          aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowUserMenu((s) => !s)}
            className="flex items-center gap-1 p-1.5 rounded-md hover-surface"
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
            aria-label="Account menu"
          >
            <div className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center">
              <User size={16} className="text-muted" />
            </div>
            <MoreVertical size={16} className="text-muted hidden sm:block" />
          </button>

          {showUserMenu && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-48 bg-surface border border-token rounded-lg shadow-modal py-1 z-30"
            >
              <button
                role="menuitem"
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm
                  text-[var(--color-danger-fg)] hover:bg-[var(--color-danger-bg)] transition-colors"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}