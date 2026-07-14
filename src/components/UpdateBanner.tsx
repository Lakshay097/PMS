import { useEffect } from 'react';

export default function UpdateBanner() {
  useEffect(() => {
    const handleUpdateAvailable = () => {
      // Auto-reload when new version is available
      window.location.reload();
    };

    window.addEventListener('swUpdateAvailable', handleUpdateAvailable);

    return () => {
      window.removeEventListener('swUpdateAvailable', handleUpdateAvailable);
    };
  }, []);

  // Component returns null since it auto-reloads without showing banner
  return null;
}
