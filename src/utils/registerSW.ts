import { logger } from './logger';

export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        logger.log('[App] SW registered:', reg.scope);

        // Check for updates every 60 seconds
        setInterval(() => reg.update(), 60_000);

        // Notify user when update is available
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // Dispatch custom event so React can show update banner
              window.dispatchEvent(new CustomEvent('swUpdateAvailable'));
            }
          });
        });
      } catch (err) {
        console.error('[App] SW registration failed:', err);
      }
    });
  }
}
