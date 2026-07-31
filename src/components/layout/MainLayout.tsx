import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

interface MainLayoutProps {
  currentUser?: {
    FullName?: string;
    Email?: string;
    Role?: string;
  };
  onLogout: () => void;
  children?: React.ReactNode;
}

export default function MainLayout({ currentUser, onLogout, children }: MainLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('PMS_sidebar_collapsed') === 'true';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleToggleCollapse = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('PMS_sidebar_collapsed', newState ? 'true' : 'false');
  };

  return (
    <div className="flex min-h-screen bg-app text-primary">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleCollapse}
        onSignOut={onLogout}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
        userName={currentUser?.FullName || 'User'}
        userEmail={currentUser?.Email || ''}
        userRole={currentUser?.Role || 'Stakeholder'}
      />
      
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 p-2 rounded-md bg-surface border border-token shadow-card"
        aria-label="Open menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>

      {/* Main content area */}
      <main 
        className={`flex-1 transition-all duration-200 ease-out
          ${isSidebarCollapsed ? 'md:ml-[72px]' : 'md:ml-[240px]'}`}
      >
        <div className="p-4 md:p-6 pt-16 md:pt-6">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
}
