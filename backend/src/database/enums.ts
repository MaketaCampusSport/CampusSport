/** Value sets from the CHECK constraints in schema-postgresql.sql. */
export const ROLES = ['student', 'teacher', 'external', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = ['active', 'suspended'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const EXTERNAL_ACCESS = ['never', 'window', 'leftover'] as const;
export type ExternalAccess = (typeof EXTERNAL_ACCESS)[number];

export const OCCUPANCY_KINDS = ['booking', 'pe_class', 'event', 'maintenance', 'emergency'] as const;
export type OccupancyKind = (typeof OCCUPANCY_KINDS)[number];

export const BLOCK_KINDS = ['pe_class', 'event', 'maintenance', 'emergency'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const OCCUPANCY_STATUSES = ['active', 'cancelled', 'completed', 'no_show'] as const;
export type OccupancyStatus = (typeof OCCUPANCY_STATUSES)[number];

export const CANCEL_SOURCES = [
  'user',
  'admin',
  'emergency',
  'maintenance',
  'pe_class',
  'event',
  'member_priority',
] as const;
export type CancelSource = (typeof CANCEL_SOURCES)[number];

export const WAITLIST_STATUSES = ['waiting', 'offered', 'accepted', 'expired'] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['push', 'email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Waitlist priority by role (SRS 3.3): teacher 1, student 2, external 3. */
export const ROLE_PRIORITY: Record<Exclude<Role, 'admin'>, 1 | 2 | 3> = { teacher: 1, student: 2, external: 3 };

/** Block hierarchy (SRS 9.1): higher level supersedes lower level. */
export const BLOCK_LEVEL: Record<BlockKind, number> = { emergency: 2, maintenance: 2, pe_class: 1, event: 1 };
