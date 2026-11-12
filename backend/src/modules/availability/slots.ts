import { DateTime } from 'luxon';
import { WEEKDAYS } from '../../database/entities';
import type { Weekday, WeeklyHours } from '../../database/entities';

export interface Interval {
  start: Date;
  end: Date;
}

export function weekdayOf(date: string, zone: string): Weekday {
  return WEEKDAYS[DateTime.fromISO(date, { zone }).weekday - 1];
}

function at(day: DateTime, hhmm: string): DateTime {
  const [hour, minute] = hhmm.split(':').map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

/** Opening ranges of a calendar day, as instants. A missing day means closed. */
export function openingRanges(hours: WeeklyHours | null | undefined, date: string, zone: string): Interval[] {
  const day = DateTime.fromISO(date, { zone }).startOf('day');
  return (hours?.[weekdayOf(date, zone)] ?? []).map((r) => ({
    start: at(day, r.open).toJSDate(),
    end: at(day, r.close).toJSDate(),
  }));
}

/** The slot grid of a day: consecutive `slotMinutes` slots from each opening, ending by closing time (FR-09). */
export function slotsForDay(hours: WeeklyHours, slotMinutes: number, date: string, zone: string): Interval[] {
  const slots: Interval[] = [];
  const step = slotMinutes * 60_000;
  for (const range of openingRanges(hours, date, zone)) {
    for (let t = range.start.getTime(); t + step <= range.end.getTime(); t += step) {
      slots.push({ start: new Date(t), end: new Date(t + step) });
    }
  }
  return slots;
}

export type SlotLookup = { slot: Interval } | { error: 'OUTSIDE_OPENING_HOURS' | 'INVALID_SLOT' };

/** Resolves a requested start to a slot of the resource (the end comes from `slot_minutes`). */
export function findSlot(hours: WeeklyHours, slotMinutes: number, start: Date, zone: string): SlotLookup {
  const date = DateTime.fromJSDate(start, { zone }).toISODate()!;
  const slot = slotsForDay(hours, slotMinutes, date, zone).find((s) => s.start.getTime() === start.getTime());
  if (slot) return { slot };
  const insideHours = openingRanges(hours, date, zone).some((r) => start >= r.start && start < r.end);
  return { error: insideHours ? 'INVALID_SLOT' : 'OUTSIDE_OPENING_HOURS' };
}

/** True when [start, end) lies inside one range of the weekly schedule (external access windows). */
export function withinWeeklyHours(hours: WeeklyHours | null | undefined, interval: Interval, zone: string): boolean {
  const date = DateTime.fromJSDate(interval.start, { zone }).toISODate()!;
  return openingRanges(hours, date, zone).some((r) => interval.start >= r.start && interval.end <= r.end);
}

export function overlaps(a: { start: Date; end: Date | null }, b: Interval): boolean {
  return a.start < b.end && (a.end === null || a.end > b.start);
}

/** Rejects ranges where close is not after open (TimeRange only checks the HH:MM format). */
export function invalidRanges(hours: WeeklyHours | null | undefined): string[] {
  const problems: string[] = [];
  for (const day of WEEKDAYS) {
    (hours?.[day] ?? []).forEach((r, i) => {
      if (r.close <= r.open) problems.push(`${day}[${i}]: close must be after open`);
    });
  }
  return problems;
}
