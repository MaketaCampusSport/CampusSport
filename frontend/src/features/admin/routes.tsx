import type { RouteObject } from 'react-router';

/** Paginile panoului de administrare (copiii lui /admin, sub RequireAdmin + AdminLayout). */
export const adminPages: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import('@/features/admin/dashboard/DashboardPage')).default }) },
  { path: 'resources', lazy: async () => ({ Component: (await import('@/features/admin/resources/ResourcesPage')).default }) },
  { path: 'blocks', lazy: async () => ({ Component: (await import('@/features/admin/blocks/BlocksPage')).default }) },
  { path: 'schedule', lazy: async () => ({ Component: (await import('@/features/admin/schedule/SchedulePage')).default }) },
  { path: 'events', lazy: async () => ({ Component: (await import('@/features/admin/events/EventsPage')).default }) },
  { path: 'rules', lazy: async () => ({ Component: (await import('@/features/admin/rules/RulesPage')).default }) },
  { path: 'audit', lazy: async () => ({ Component: (await import('@/features/admin/audit/AuditPage')).default }) },
  { path: 'announcements', lazy: async () => ({ Component: (await import('@/features/admin/announcements/AnnouncementsPage')).default }) },
  { path: 'reports', lazy: async () => ({ Component: (await import('@/features/admin/reports/ReportsPage')).default }) },
  { path: 'sports', lazy: async () => ({ Component: (await import('@/features/admin/sports/SportsPage')).default }) },
  { path: 'users', lazy: async () => ({ Component: (await import('@/features/admin/users/UsersPage')).default }) },
  { path: 'checkin', lazy: async () => ({ Component: (await import('@/features/admin/checkin/CheckInPage')).default }) },
  { path: 'account', lazy: async () => ({ Component: (await import('@/features/admin/account/AccountPage')).default }) },
];
