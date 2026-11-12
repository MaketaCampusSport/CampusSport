import { collectDefaultMetrics, Counter, Histogram, register } from '@prometheus-io/client';

/** Prometheus metrics (SYS-09). Module-level so any service can record without extra injection. */
let defaultsCollected = false;
export function collectDefaults(prefix: string): void {
  if (defaultsCollected) return;
  collectDefaultMetrics({ prefix });
  defaultsCollected = true;
}

export const httpDuration = new Histogram({
  name: 'campussport_http_request_duration_seconds',
  help: 'HTTP request duration (NFR-01: grid and booking under 2 s)',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

export const bookingsCreated = new Counter({
  name: 'campussport_bookings_created_total',
  help: 'Bookings created',
  labelNames: ['role'] as const,
});

export const bookingConflicts = new Counter({
  name: 'campussport_booking_conflicts_total',
  help: 'Booking attempts rejected by no_overlap (SLOT_TAKEN / SLOT_BLOCKED)',
  labelNames: ['code'] as const,
});

export const notificationsSent = new Counter({
  name: 'campussport_notifications_total',
  help: 'Notification attempts by channel and outcome',
  labelNames: ['channel', 'outcome'] as const,
});

/** NFR-03: notifications must leave within 2 minutes; alert on the p95 of this histogram. */
export const notificationLag = new Histogram({
  name: 'campussport_notification_lag_seconds',
  help: 'Time from enqueue to delivery attempt',
  labelNames: ['type'] as const,
  buckets: [1, 5, 15, 30, 60, 120, 300],
});

export { register };
