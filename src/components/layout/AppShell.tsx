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
  onSearch?: (query: string) => void;
  onSignOut?: () => void;
}

export default function AppShell({
  children,
  currentView,
  onViewChange,
  pageTitle,
  breadcrumb,
  onQuickCreate,
  onSearch,
  onSignOut,
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
          onQuickCreate={onQuickCreate}
          onSearch={onSearch}
        />
        
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
