import type { ListAuditLogData, ListBlocksData, ListBookingsData, ListUsersData } from './generated';

/** Chei TanStack Query – ierarhice, ca invalidarea `['dashboard']` să acopere toate zilele. */
export const keys = {
  session: ['session'] as const,
  sports: ['sports'] as const,
  resources: ['resources'] as const,
  dashboard: (date: string) => ['dashboard', date] as const,
  dashboardAll: ['dashboard'] as const,
  blocks: (q: ListBlocksData['query']) => ['blocks', 'list', q ?? {}] as const,
  /** Blocările care se suprapun cu momentul curent (stare „blocată acum”, urgențe active). */
  activeBlocks: ['blocks', 'active'] as const,
  blocksAll: ['blocks'] as const,
  delivery: (blockId: string) => ['blocks', 'delivery', blockId] as const,
  adminBookings: (q: ListBookingsData['query']) => ['admin-bookings', q ?? {}] as const,
  adminBookingsAll: ['admin-bookings'] as const,
  report: (month: string) => ['report', month] as const,
  settings: ['settings'] as const,
  audit: (q: ListAuditLogData['query']) => ['audit', q ?? {}] as const,
  auditAll: ['audit'] as const,
  admins: ['users', 'admins'] as const,
  users: (q: ListUsersData['query']) => ['users', q ?? {}] as const,
  usersAll: ['users'] as const,
};
