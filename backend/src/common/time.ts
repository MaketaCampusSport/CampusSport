import { DateTime } from 'luxon';

/**
 * Time helpers. Dates in query parameters (`date=2026-11-12`) are days in the facility time zone;
 * API timestamps are ISO 8601 with the facility offset, e.g. `2026-11-12T18:00:00+02:00`.
 */

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && DateTime.fromISO(value).isValid;
}

/** [start, end) of a calendar day in the given zone. */
export function dayBounds(date: string, zone: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(date, { zone }).startOf('day');
  if (!start.isValid) throw new Error(`Invalid date: ${date}`);
  return { start: start.toJSDate(), end: start.plus({ days: 1 }).toJSDate() };
}

/** Calendar day (`YYYY-MM-DD`) of an instant in the given zone. */
export function dayOf(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toISODate()!;
}

/** First day of the month (`YYYY-MM-01`) of an instant in the given zone, the key of `monthly_quota`. */
export function monthOf(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).startOf('month').toISODate()!;
}

/** ISO 8601 with the zone offset and no milliseconds. */
export function toIsoInZone(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toISO({ suppressMilliseconds: true })!;
}

export function toIsoOrNull(instant: Date | null | undefined, zone: string): string | null {
  return instant ? toIsoInZone(instant, zone) : null;
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function addHours(instant: Date, hours: number): Date {
  return addMinutes(instant, hours * 60);
}
