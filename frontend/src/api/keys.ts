import type { AuditQuery, UserQuery } from './types';


/** Chei TanStack Query – ierarhice, ca invalidarea `['dashboard']` să acopere toate zilele. */
export const keys = {
  session: ['session'] as const,
  sports: ['sports'] as const,
  resources: ['resources'] as const,
  dashboard: (date: string) => ['dashboard', date] as const,
  dashboardAll: ['dashboard'] as const,
  blocks: ['blocks'] as const,
  blockPreview: (resourceId: string, from: string, to: string | null, exclude?: string) =>
    ['blocks', 'preview', resourceId, from, to, exclude ?? null] as const,
  delivery: (blockId: string) => ['blocks', 'delivery', blockId] as const,
  events: ['events'] as const,
  eventPreview: (payload: unknown) => ['events', 'preview', payload] as const,
  announcements: ['announcements'] as const,
  audience: (payload: unknown) => ['announcements', 'audience', payload] as const,
  report: (month: string) => ['report', month] as const,
  settings: ['settings'] as const,
  audit: (q: AuditQuery) => ['audit', q] as const,
  auditAll: ['audit'] as const,
  users: (q: UserQuery) => ['users', q] as const,
  usersAll: ['users'] as const,

};
