import { useEffect } from 'react';

type ActiveViewType = 'dashboard' | 'tasks' | 'templates' | 'admin';

export function useAppEvents(activeView: ActiveViewType, setActiveView: (view: ActiveViewType) => void) {
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      event.preventDefault();
      // Handle browser back button
      if (activeView !== 'dashboard') {
        setActiveView('dashboard');
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Alt + Left Arrow - Go back
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        if (activeView !== 'dashboard') {
          setActiveView('dashboard');
        }
      }
      // Alt + Right Arrow - Go forward (could be implemented if needed)
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        // Could implement forward navigation if needed
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeView, setActiveView]);
}
