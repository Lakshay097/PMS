/**
 * Application route constants
 */
export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/',
  TASKS: '/tasks',
  TEMPLATES: '/templates',
  ADMIN: '/admin',
  REPORTS: '/reports',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
