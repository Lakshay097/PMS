import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

interface AppShellProps {
  children: React.ReactNode;
  currentView: string;
  onViewChange: (view: string) => void;
  pageTitle: string;
  breadcrumb?: string;
  onQuickCreate?: () => void;
  onSignOut: () => void;
  syncStatus?: 'synced' | 'syncing' | 'error';
  onManualSync?: () => void;
}

/**
 * Responsive app shell.
 *
 * Desktop (md and up): permanent sidebar, main content offset by its width.
 * Mobile: sidebar becomes an off-canvas drawer opened from a hamburger in
 * the top bar; main content is full width (no ml-[240px] pushing content
 * off screen, which caused the "content does not fit" problem).
 */
export default function AppShell({
  children,
  currentView,
  onViewChange,
  pageTitle,
  breadcrumb,
  onQuickCreate,
  onSignOut,
  syncStatus,
  onManualSync,
}: AppShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Close the mobile drawer whenever navigation happens.
  const handleViewChange = (view: string) => {
    setIsMobileNavOpen(false);
    onViewChange(view);
  };

  // If the window grows past the breakpoint, drop the mobile drawer state
  // so scroll-lock never gets stuck.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setIsMobileNavOpen(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <div className="flex h-dvh bg-app">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((c) => !c)}
        onSignOut={onSignOut}
        isMobileOpen={isMobileNavOpen}
        onMobileClose={() => setIsMobileNavOpen(false)}
      />

      <main
        className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ml-0 ${
          isSidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[240px]'
        }`}
      >
        <TopBar
          title={pageTitle}
          breadcrumb={breadcrumb}
          onLogout={onSignOut}
          syncStatus={syncStatus}
          onManualSync={onManualSync}
          onQuickCreate={onQuickCreate}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
        />

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}