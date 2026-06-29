import { useState, useEffect } from 'react';

interface UpdateBannerProps {
  isDarkMode?: boolean;
}

export default function UpdateBanner({ isDarkMode = false }: UpdateBannerProps) {
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
    <div className={`fixed top-0 left-0 right-0 z-50 px-4 py-3 ${isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white'}`}>
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <p className="text-sm font-medium">A new version is available</p>
        <button
          onClick={() => window.location.reload()}
          className={`min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg font-medium text-sm transition-colors ${isDarkMode ? 'bg-white text-blue-600 hover:bg-blue-50' : 'bg-white text-blue-500 hover:bg-blue-50'}`}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
