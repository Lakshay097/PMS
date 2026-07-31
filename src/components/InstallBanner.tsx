import { useInstallPrompt } from '../hooks/useInstallPrompt';

export default function InstallBanner() {
  const { canInstall, install, dismiss } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-token p-4 pb-safe">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <p className="text-sm text-primary">
          Add TaskFlow to your home screen for the best experience
        </p>
        <div className="flex items-center space-x-3">
          <button
            onClick={install}
            className="min-h-[44px] min-w-[44px] px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            className="min-h-[44px] min-w-[44px] px-4 py-2 text-secondary hover:text-primary text-sm font-medium transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
