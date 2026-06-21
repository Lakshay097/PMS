import { useState, useEffect } from 'react';

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleUpdateAvailable = () => {
      setVisible(true);
    };

    window.addEventListener('swUpdateAvailable', handleUpdateAvailable);

    return () => {
      window.removeEventListener('swUpdateAvailable', handleUpdateAvailable);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-500 text-white px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <p className="text-sm font-medium">A new version is available</p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-[44px] min-w-[44px] px-4 py-2 bg-white text-blue-500 rounded-lg font-medium text-sm hover:bg-blue-50 transition-colors"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
