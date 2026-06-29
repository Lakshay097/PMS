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
  SCHEDULED_TASKS: '/scheduled-tasks',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
