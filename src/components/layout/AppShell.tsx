import React, { useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppShellProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  pageTitle: string;
  breadcrumb?: string;
  onQuickCreate?: () => void;
  onSignOut?: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  syncStatus?: 'synced' | 'syncing' | 'error';
  onManualSync?: () => void;
}

export default function AppShell({
  children,
  currentView,
  onViewChange,
  pageTitle,
  breadcrumb,
  onQuickCreate,
  onSignOut,
  isDarkMode = false,
  onToggleTheme,
  syncStatus,
  onManualSync,
}: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-[var(--color-background)]">
      <Sidebar
        currentView={currentView}
        onViewChange={onViewChange}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onSignOut={onSignOut}
      />
      
      <main
        className={`flex-1 flex flex-col transition-all duration-300 ${
          isSidebarCollapsed ? 'ml-[72px]' : 'ml-[240px]'
        }`}
      >
        <TopBar
          title={pageTitle}
          breadcrumb={breadcrumb}
          onLogout={onSignOut}
          syncStatus={syncStatus}
          onManualSync={onManualSync}
        />
        
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
