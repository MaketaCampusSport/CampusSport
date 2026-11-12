import type { CancelSource } from '../../database/enums';

/** BullMQ queues of the worker (SDD 4.1). */
export const QUEUES = {
  notifications: 'notifications',
  waitlist: 'waitlist',
  bookings: 'bookings',
} as const;

/** notifications queue */
export interface NotifyJob {
  type: 'booking-confirmed' | 'booking-reminder' | 'booking-cancelled' | 'waitlist-offer' | 'announcement';
  userId: string;
  occupancyId?: string | null;
  blockId?: string | null;
  /** Message data; rendered by the worker. */
  data: Record<string, unknown>;
  /** Critical messages ignore channel preferences and may fall back to SMS (FR-36). */
  critical?: boolean;
}

/** waitlist queue: a slot became free (cancellation, unblock) or an offer expired. */
export interface SlotFreedJob {
  resourceId: string;
  start: string;
  end: string;
}

export interface OfferExpiredJob {
  waitlistId: string;
}

/** bookings queue: delayed no-show check after the check-in window (BR-06). */
export interface NoShowCheckJob {
  bookingId: string;
}

export interface CancelledBooking {
  id: string;
  userId: string | null;
  resourceId: string;
  start: Date;
  end: Date;
}

export interface CancellationCause {
  source: CancelSource;
  reason?: string | null;
  blockId?: string | null;
}

export function redisConnection(url: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: object;
} {
  const u = new URL(url);
  return {
    host: u.hostname || 'localhost',
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.pathname.length > 1 ? { db: Number(u.pathname.slice(1)) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
