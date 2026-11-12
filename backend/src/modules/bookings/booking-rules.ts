import type { AuthUser } from '../../common/auth/auth.types';
import { isSuspended } from '../../common/auth/auth.types';
import type { ErrorCode } from '../../common/errors/error-codes';
import type { Resource } from '../../database/entities';
import type { Rules } from '../settings/settings.service';
import { Interval, withinWeeklyHours } from '../availability/slots';

export interface QuotaCounters {
  used: number;
  refunded: number;
}

export interface QuotaView {
  limit: number;
  used: number;
  refunded: number;
  remaining: number;
  over_quota_last_24h_only: boolean;
}

export const LAST_MINUTE_HOURS = 24;

/** `Quota` schema: remaining = limit - (used - refunded), never below 0 (FR-26). */
export function quotaView(counters: QuotaCounters, limit: number): QuotaView {
  const remaining = Math.max(0, limit - (counters.used - counters.refunded));
  return {
    limit,
    used: counters.used,
    refunded: counters.refunded,
    remaining,
    over_quota_last_24h_only: remaining === 0,
  };
}

/** Latest start the caller may book now (BR-03): 7 days students, 14 days teachers, 24 h externals. */
export function bookingHorizon(role: AuthUser['role'], now: Date, rules: Rules): Date {
  const hour = 3_600_000;
  switch (role) {
    case 'student':
      return new Date(now.getTime() + rules.booking_window_days_student * 24 * hour);
    case 'external':
      return new Date(now.getTime() + rules.booking_window_hours_external * hour);
    default:
      return new Date(now.getTime() + rules.booking_window_days_teacher * 24 * hour);
  }
}

export function isLastMinute(start: Date, now: Date): boolean {
  return start.getTime() - now.getTime() <= LAST_MINUTE_HOURS * 3_600_000;
}

export interface RuleInput {
  user: AuthUser;
  resource: Pick<Resource, 'active' | 'externalAccess' | 'externalAccessWindows'>;
  slot: Interval;
  now: Date;
  rules: Rules;
  zone: string;
  /** Student's counters for the month of the slot; ignored for other roles. */
  quota: QuotaCounters;
  /** Caller's active future bookings. */
  activeBookings: number;
}

/**
 * SDD 7.1 checks, in order: account active -> resource active -> slot not started -> window by role ->
 * external access -> monthly quota -> active bookings limit. Returns the first violated rule or null.
 * Availability of the slot itself is guaranteed by the `no_overlap` constraint, not checked here.
 */
export function checkBookingRules(input: RuleInput): ErrorCode | null {
  const { user, resource, slot, now, rules } = input;
  if (isSuspended(user, now)) return 'ACCOUNT_SUSPENDED';
  if (!resource.active) return 'RESOURCE_INACTIVE';
  if (slot.start <= now) return 'INVALID_SLOT';
  if (slot.start > bookingHorizon(user.role, now, rules)) return 'WINDOW_EXCEEDED';

  if (user.role === 'external') {
    if (resource.externalAccess === 'never') return 'EXTERNAL_ACCESS_DENIED';
    if (resource.externalAccess === 'window' && !withinWeeklyHours(resource.externalAccessWindows, slot, input.zone)) {
      return 'EXTERNAL_ACCESS_DENIED';
    }
  }

  // FR-28: with the quota used up, a student may still take slots left free in the last 24 h.
  if (user.role === 'student' && quotaView(input.quota, rules.monthly_quota).remaining === 0 && !isLastMinute(slot.start, now)) {
    return 'QUOTA_EXHAUSTED';
  }

  if (user.role !== 'admin' && input.activeBookings >= rules.max_active_bookings) return 'ACTIVE_LIMIT_REACHED';
  return null;
}
