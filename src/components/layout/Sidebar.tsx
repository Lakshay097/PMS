import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutDashboard, CheckSquare, Calendar, Users, BarChart3, Settings, HelpCircle, LogOut, Grid3x3 } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onSignOut?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
  adminOnly?: boolean;
}

const primaryNavItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={20} /> },
  { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={20} /> },
  { id: 'schedules', label: 'Schedules', icon: <Calendar size={20} /> },
  { id: 'team', label: 'Team', icon: <Users size={20} /> },
  { id: 'reports', label: 'Reports', icon: <BarChart3 size={20} /> },
  { id: 'admin', label: 'Admin', icon: <Grid3x3 size={20} />, adminOnly: true },
];

const secondaryNavItems: NavItem[] = [
  { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
  { id: 'help', label: 'Help / Docs', icon: <HelpCircle size={20} /> },
];

export default function Sidebar({ currentView, onViewChange, isCollapsed = false, onToggleCollapse, onSignOut }: SidebarProps) {
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const renderNavItem = (item: NavItem) => {
    const isActive = currentView === item.id;
    
    return (
      <div
        key={item.id}
        className="relative"
        onMouseEnter={() => isCollapsed && setShowTooltip(item.id)}
        onMouseLeave={() => setShowTooltip(null)}
      >
        <button
          onClick={() => onViewChange(item.id)}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
            isActive
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[#0f172a] hover:bg-gray-100'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title={isCollapsed ? item.label : undefined}
        >
          {item.icon}
          {!isCollapsed && <span className="text-sm font-medium">{item.label}</span>}
        </button>
        
        {isCollapsed && showTooltip === item.id && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-50">
            {item.label}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-surface border-r border-[var(--color-border)] flex flex-col transition-all duration-300 z-30 ${
        isCollapsed ? 'w-[72px]' : 'w-[240px]'
      }`}
    >
      {/* Logo and workspace */}
      <div className="p-4 border-b border-[var(--color-border)] flex-shrink-0">
        <div className="flex items-center gap-2">
          <img src="/pw-logo.jpg" alt="PW Logo" className="w-8 h-8 object-contain" />
          {!isCollapsed && (
            <div>
              <div className="text-sm font-semibold text-[#0f172a]">PW</div>
              <div className="text-xs text-muted">Workspace</div>
            </div>
          )}
        </div>
      </div>

      {/* Primary navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1">
          {primaryNavItems.map(renderNavItem)}
        </div>
        
        <div className="pt-4 mt-4 border-t border-[var(--color-border)]">
          <div className="space-y-1">
            {secondaryNavItems.map(renderNavItem)}
          </div>
        </div>
      </nav>

      {/* Bottom: user + sign out - pinned to bottom */}
      <div className="border-t border-[var(--color-border)] p-3 space-y-1 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-[#0f172a]">JD</span>
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-[#0f172a] truncate">John Doe</div>
              <div className="text-xs text-muted truncate">john@example.com</div>
            </div>
          )}
        </div>
        <div className="relative group">
          <button
            onClick={onSignOut}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-red-600 hover:bg-red-50 ${
              isCollapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut size={20} />
            {!isCollapsed && <span className="text-sm font-medium">Sign out</span>}
          </button>
          {isCollapsed && (
            <div className="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap z-50 delay-150 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              Sign out
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-surface border border-[var(--color-border)] rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-shadow z-40"
      >
        {isCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </aside>
  );
}
