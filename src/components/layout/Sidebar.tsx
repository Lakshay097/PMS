import React, { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut, X, LayoutDashboard, CheckSquare, Calendar, Users, BarChart3, Settings, HelpCircle, Grid3x3 } from 'lucide-react';
import { ROUTES } from '../../constants/routes';
import { isAdminLevel } from '../../constants/status';

interface SidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSignOut: () => void;
  /** Mobile off-canvas state, controlled by AppShell */
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
  userName?: string;
  userEmail?: string;
  userRole?: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  to: string;
  primary?: boolean;
  adminOnly?: boolean;
}

const primaryNavItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={20} />, to: ROUTES.DASHBOARD },
  { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={20} />, to: ROUTES.TASKS },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={20} />, to: ROUTES.REPORTS },
  { id: 'weekly-reports', label: 'Weekly Report', icon: <Calendar size={20} />, to: ROUTES.WEEKLY_REPORTS },
  { id: 'team', label: 'Team', icon: <Users size={20} />, to: ROUTES.TEAM },
  { id: 'schedules', label: 'Schedules', icon: <Calendar size={20} />, to: ROUTES.SCHEDULES, adminOnly: true },
  { id: 'admin', label: 'Admin', icon: <Grid3x3 size={20} />, to: ROUTES.ADMIN, adminOnly: true },
];

const secondaryNavItems: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: <Settings size={20} />, to: ROUTES.SETTINGS },
];

/**
 * Fixes vs previous version:
 * - Mobile: sidebar was permanently fixed at 240px and unreachable/overlapping.
 *   It is now hidden off-canvas (-translate-x-full) and slides in over an
 *   overlay when the hamburger is tapped.
 * - Hardcoded light colors (text-[#0f172a], bg-gray-200) replaced with theme
 *   tokens so dark mode actually applies here.
 * - Collapse toggle (a desktop affordance) is hidden below md.
 * - Body scroll is locked while the mobile drawer is open.
 */
export default function Sidebar({
  isCollapsed = false,
  onToggleCollapse,
  onSignOut,
  isMobileOpen = false,
  onMobileClose,
  userName = 'John Doe',
  userEmail = 'john@example.com',
  userRole = 'Stakeholder',
}: SidebarProps) {
  const location = useLocation();
  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (isMobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isMobileOpen]);

  // Close on Escape (mobile drawer).
  useEffect(() => {
    if (!isMobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileOpen, onMobileClose]);

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.to;
    
    // Hide admin-only items for non-admin users
    if (item.adminOnly && !isAdminLevel(userRole)) {
      return null;
    }
    
    // For external links (like help/docs), use regular anchor
    if (item.to.startsWith('http')) {
      return (
        <a
          key={item.id}
          href={item.to}
          target="_blank"
          rel="noopener noreferrer"
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-secondary hover:bg-gradient-to-r hover:from-[var(--color-surface-2)] hover:to-transparent hover:translate-x-1 ${
            isCollapsed ? 'md:justify-center hover:translate-x-0' : ''
          }`}
          title={isCollapsed ? item.label : undefined}
        >
          <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5 transition-transform duration-200 group-hover:scale-110">{item.icon}</span>
          <span className={isCollapsed ? 'md:hidden' : ''}>{item.label}</span>
        </a>
      );
    }

    // For internal routes, use NavLink
    return (
      <NavLink
        key={item.id}
        to={item.to}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
          isActive
            ? 'bg-gradient-to-r from-[var(--color-primary-soft)] to-transparent text-[var(--color-primary)] shadow-sm'
            : 'text-secondary hover:bg-gradient-to-r hover:from-[var(--color-surface-2)] hover:to-transparent hover:translate-x-1'
        } ${isCollapsed ? 'md:justify-center hover:translate-x-0' : ''}`}
        title={isCollapsed ? item.label : undefined}
        onClick={() => {
          // Close mobile drawer on navigation
          if (isMobileOpen) {
            onMobileClose?.();
          }
        }}
      >
        <span className="shrink-0 [&>svg]:w-5 [&>svg]:h-5 transition-transform duration-200">{item.icon}</span>
        <span className={isCollapsed ? 'md:hidden' : ''}>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'var(--color-overlay)' }}
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={`fixed left-0 top-0 z-50 h-dvh flex flex-col border-r border-token bg-surface
          transition-transform duration-200 ease-out will-change-transform
          w-[280px] max-w-[85vw]
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:z-30 md:transition-[width]
          ${isCollapsed ? 'md:w-[72px]' : 'md:w-[240px]'}`}
      >
        {/* Logo and workspace */}
        <div className="p-4 border-b border-token flex-shrink-0 flex items-center justify-between bg-gradient-to-b from-[var(--color-surface)] to-[var(--color-surface-2)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative">
              <img
                src="/pw-logo.jpg"
                alt="PW logo"
                className="w-9 h-9 rounded-xl object-contain shrink-0 shadow-md ring-2 ring-[var(--color-surface-3)]"
              />
            </div>
            <div className={`min-w-0 ${isCollapsed ? 'md:hidden' : ''}`}>
              <div className="text-sm font-bold text-primary truncate tracking-tight">PW</div>
              <div className="text-xs text-muted truncate font-medium">Workspace</div>
            </div>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={onMobileClose}
            className="md:hidden p-2 -mr-1 rounded-lg text-muted hover:bg-[var(--color-surface-2)] transition-colors"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
          <div className="space-y-1">{primaryNavItems.map(renderNavItem)}</div>
          <div className="pt-4 mt-4 border-t border-token">
            <div className="space-y-1">{secondaryNavItems.map(renderNavItem)}</div>
          </div>
        </nav>

        {/* User + sign out */}
        <div className="border-t border-token p-3 space-y-2 flex-shrink-0 bg-gradient-to-b from-[var(--color-surface-2)] to-[var(--color-surface)]">
          <div className={`flex items-center gap-3 px-1 ${isCollapsed ? 'md:justify-center' : ''}`}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-primary-dark)] flex items-center justify-center shrink-0 shadow-md">
              <span className="text-xs font-bold text-white">
                {userName
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
            </div>
            <div className={`flex-1 min-w-0 ${isCollapsed ? 'md:hidden' : ''}`}>
              <div className="text-sm font-semibold text-primary truncate">{userName}</div>
              <div className="text-xs text-muted truncate">{userEmail}</div>
            </div>
          </div>
          <button
            onClick={onSignOut}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
              text-[var(--color-danger-fg)] hover:bg-[var(--color-danger-bg)] hover:translate-x-1
              ${isCollapsed ? 'md:justify-center hover:translate-x-0' : ''}`}
          >
            <LogOut size={20} className="shrink-0 transition-transform duration-200" />
            <span className={isCollapsed ? 'md:hidden' : ''}>Sign out</span>
          </button>
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden md:flex btn-compact absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6
            bg-surface border border-token rounded-full items-center justify-center
            shadow-card hover:shadow-md transition-shadow z-40 text-secondary"
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>
    </>
  );
}
