import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const { isOnline } = useOfflineStatus();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isOnline);
  }, [isOnline]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-3 transition-all duration-300">
      <div className="max-w-4xl mx-auto flex items-center justify-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <p className="text-sm font-medium">
          You're offline — changes will sync when you reconnect
        </p>
      </div>
    </div>
  );
}
