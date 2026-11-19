import { addMinutes } from 'date-fns';
import type { Block, BlockKind, CheckInResult, ResourceAvailability, Slot, User } from '@/api/client';
import { blockOverlaps, db, iso, overlaps, slotsForDay, type MockBooking, type MockResource } from './db';

/** Ordinea din SRS 9.1, de la cea mai puternică: aceasta e culoarea slotului când se suprapun mai multe. */
const PRIORITY: BlockKind[] = ['emergency', 'maintenance', 'pe_class', 'event'];

/** Nivelul din backend (`BLOCK_LEVEL`): o blocare nu poate acoperi una de nivel egal sau mai mare. */
export const BLOCK_LEVEL: Record<BlockKind, number> = { emergency: 2, maintenance: 2, pe_class: 1, event: 1 };

export function blocksOverlapping(resourceId: string, start: Date, end: Date | null): Block[] {
  return db.blocks.filter((b) => b.resource_id === resourceId && blockOverlaps(b, start, end));
}

function strongest(list: Block[]): Block | undefined {
  return [...list].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
}

/** Rezervările care ocupă slotul (anulatele nu mai ocupă nimic). */
export function bookingsOverlapping(resourceId: string, start: Date, end: Date | null, activeOnly = false): MockBooking[] {
  return db.bookings.filter(
    (b) =>
      b.resource_id === resourceId &&
      (activeOnly ? b.status === 'active' : b.status !== 'cancelled') &&
      overlaps(new Date(b.start), new Date(b.end), start, end),
  );
}

/**
 * Grila unei resurse pentru o zi (GET /availability, GET /admin/dashboard).
 * `holder_name` apare doar pentru admin, iar `booking_id` pentru admin și pentru titular.
 */
export function availabilityFor(r: MockResource, day: Date, viewer: User | null, now = new Date()): ResourceAvailability {
  const admin = viewer?.role === 'admin';
  const slots = slotsForDay(r, day).map(({ start, end }): Slot => {
    const base = { start: iso(start), end: iso(end) };
    const block = strongest(blocksOverlapping(r.id, start, end));
    if (block) return { ...base, status: 'blocked', bookable: false, block_kind: block.kind };
    const booking = bookingsOverlapping(r.id, start, end)[0];
    if (booking) {
      const mine = !!viewer && booking.user_id === viewer.id;
      return {
        ...base,
        status: mine ? 'mine' : 'occupied',
        bookable: false,
        ...(viewer && !admin && !mine && start > now ? { waitlist_available: true } : {}),
        ...(mine || admin ? { booking_id: booking.id } : {}),
        ...(admin ? { holder_name: booking.holder_name } : {}),
      };
    }
    return { ...base, status: 'free', bookable: r.active && start > now };
  });
  return { resource_id: r.id, resource_name: r.name, slots };
}

/** Pașii 2–3 din SDD 7.3: anulează rezervările active suprapuse și restituie cota (în mock: doar starea). */
export function cancelOverlapping(resourceId: string, start: Date, end: Date | null, source: MockBooking['cancel_source'], reason: string): MockBooking[] {
  const cancelled = bookingsOverlapping(resourceId, start, end, true).filter((b) => new Date(b.end) > new Date());
  for (const b of cancelled) {
    b.status = 'cancelled';
    b.cancel_source = source;
    b.cancel_reason = reason;
  }
  return cancelled;
}

export type CheckInOutcome =
  | { ok: true; result: CheckInResult }
  | { ok: false; status: number; code: string; message_ro: string; message_en: string };

/**
 * Check-in la intrare cu tokenul QR `<booking_id>.<nonce>.<semnătură>` (FR-15, POST /bookings/{id}/check-in).
 * Exportat pentru handler-ul rutei /bookings (mocks/memberHandlers.ts).
 */
export function staffCheckIn(bookingId: string, qrToken: string | undefined, now = new Date()): CheckInOutcome {
  const booking = db.bookings.find((b) => b.id === bookingId);
  if (!booking) return { ok: false, status: 404, code: 'NOT_FOUND', message_ro: 'Rezervarea nu există.', message_en: 'Booking not found.' };
  if (!qrToken || qrToken !== booking.qr_token) {
    return { ok: false, status: 422, code: 'QR_INVALID', message_ro: 'Cod QR invalid.', message_en: 'Invalid QR code.' };
  }
  if (booking.checked_in_at) {
    return { ok: false, status: 409, code: 'ALREADY_CHECKED_IN', message_ro: 'Check-in deja făcut.', message_en: 'Already checked in.' };
  }
  if (booking.status !== 'active') {
    return { ok: false, status: 409, code: 'BOOKING_NOT_ACTIVE', message_ro: 'Rezervarea nu mai este activă.', message_en: 'The booking is no longer active.' };
  }
  const start = new Date(booking.start);
  const { checkin_minutes_before: before, checkin_minutes_after: after } = db.settings;
  if (now < addMinutes(start, -before) || now > addMinutes(start, after)) {
    return {
      ok: false,
      status: 422,
      code: 'CHECKIN_WINDOW_CLOSED',
      message_ro: `Check-in-ul este permis între −${before} și +${after} minute față de început.`,
      message_en: `Check-in is allowed from −${before} to +${after} minutes around the start time.`,
    };
  }
  booking.checked_in_at = iso(now);
  return {
    ok: true,
    result: { booking_id: booking.id, checked_in_at: booking.checked_in_at, holder_name: booking.holder_name, category: booking.category },
  };
}
