const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => isDev && console.log('[TaskFlow]', ...args),
  warn: (...args: unknown[]) => console.warn('[TaskFlow]', ...args),
  error: (...args: unknown[]) => console.error('[TaskFlow]', ...args),
};
