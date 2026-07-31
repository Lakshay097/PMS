/**
 * Application route constants
 * These are actual URL paths used by React Router
 */
export const ROUTES = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  TASKS: '/tasks',
  TASK_DETAIL: '/tasks/:taskId',
  TEMPLATES: '/templates',
  ADMIN: '/admin',
  REPORTS: '/reports',
  WEEKLY_REPORTS: '/weekly-reports',
  SCHEDULES: '/schedules',
  TEAM: '/team',
  SETTINGS: '/settings',
  ROOT: '/',
} as const;

export type Route = typeof ROUTES[keyof typeof ROUTES];
