import { DateTime } from 'luxon';
import type { WeeklyHours } from '../../database/entities';
import { Interval, slotsForDay } from '../availability/slots';
import type { MonthlyReportResponse, ResourceOccupancy } from './dto/report.dto';

/** First instant of the month (`YYYY-MM`) and of the next one, in the facility time zone. */
export function monthBounds(month: string, zone: string): { start: Date; end: Date } {
  const start = DateTime.fromISO(`${month}-01`, { zone }).startOf('month');
  if (!start.isValid) throw new Error(`Invalid month: ${month}`);
  return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate() };
}

/** Calendar days (`YYYY-MM-DD`) of a month. */
export function daysOfMonth(month: string, zone: string): string[] {
  const first = DateTime.fromISO(`${month}-01`, { zone }).startOf('month');
  return Array.from({ length: first.daysInMonth! }, (_, i) => first.plus({ days: i }).toISODate()!);
}

const round = (x: number): number => Math.round(x * 10_000) / 10_000;

export interface ReportResource {
  id: string;
  name: string;
  openingHours: WeeklyHours;
  slotMinutes: number;
}

/**
 * Occupancy rate of one resource over a month (FR-44).
 *
 * Definition: the opening time is the resource's slot grid (its current opening hours and slot length,
 * as `GET /availability` shows it) on every day of the month. A slot counts as booked when a booking that
 * was not cancelled (`active`, `completed` or `no_show`) overlaps it. `rate` = booked slot time / opening
 * slot time. Blocks (PE classes, events, maintenance, emergencies) are not bookings: their slots stay in the
 * denominator and lower the rate. `by_hour` applies the same ratio to each clock hour of the facility time
 * zone, splitting slots that cross an hour (e.g. 90-minute slots); hours that are never open are left out.
 * A resource with no opening time in the month has rate 0. Rates are rounded to 4 decimals.
 */
export function occupancyRate(
  resource: ReportResource,
  bookings: Interval[],
  month: string,
  zone: string,
): ResourceOccupancy {
  const sorted = [...bookings].sort((a, b) => a.start.getTime() - b.start.getTime());
  const hours = new Map<number, { open: number; booked: number }>();
  let open = 0;
  let booked = 0;
  let next = 0; // bookings before `next` end before the current slot (slots are visited in time order)

  for (const day of daysOfMonth(month, zone)) {
    for (const slot of slotsForDay(resource.openingHours, resource.slotMinutes, day, zone)) {
      while (next < sorted.length && sorted[next].end <= slot.start) next++;
      let isBooked = false;
      for (let i = next; i < sorted.length && sorted[i].start < slot.end; i++) {
        if (sorted[i].end > slot.start) {
          isBooked = true;
          break;
        }
      }
      const length = slot.end.getTime() - slot.start.getTime();
      open += length;
      if (isBooked) booked += length;
      splitByHour(slot, zone, (hour, ms) => {
        const h = hours.get(hour) ?? { open: 0, booked: 0 };
        h.open += ms;
        if (isBooked) h.booked += ms;
        hours.set(hour, h);
      });
    }
  }

  return {
    resource_id: resource.id,
    resource_name: resource.name,
    rate: open ? round(booked / open) : 0,
    by_hour: [...hours.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, h]) => ({ hour, rate: round(h.booked / h.open) })),
  };
}

/** Calls `add(hour, milliseconds)` for each clock hour (in `zone`) that the interval covers. */
function splitByHour(interval: Interval, zone: string, add: (hour: number, ms: number) => void): void {
  const end = interval.end.getTime();
  let t = DateTime.fromJSDate(interval.start, { zone });
  while (t.toMillis() < end) {
    const until = Math.min(t.startOf('hour').plus({ hours: 1 }).toMillis(), end);
    add(t.hour, until - t.toMillis());
    t = DateTime.fromMillis(until, { zone });
  }
}

const CSV_HEADER = ['month', 'metric', 'resource_id', 'resource_name', 'hour', 'value'];

function csvField(value: string | number | null): string {
  const s = value === null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The report as one flat CSV table (RFC 4180, CRLF), one metric per row: `occupancy_rate` per resource,
 * `occupancy_rate_by_hour` per resource and hour, then the month's totals. It starts with a UTF-8 BOM so
 * spreadsheet programs read the diacritics correctly.
 */
export function reportToCsv(report: MonthlyReportResponse): string {
  const rows: (string | number | null)[][] = [CSV_HEADER];
  const m = report.month;
  for (const r of report.occupancy) {
    rows.push([m, 'occupancy_rate', r.resource_id, r.resource_name, null, r.rate]);
    for (const h of r.by_hour)
      rows.push([m, 'occupancy_rate_by_hour', r.resource_id, r.resource_name, h.hour, h.rate]);
  }
  rows.push([m, 'no_shows_count', null, null, null, report.no_shows_count]);
  rows.push([m, 'bookings_members', null, null, null, report.bookings_by_category.members]);
  rows.push([m, 'bookings_externals', null, null, null, report.bookings_by_category.externals]);
  rows.push([m, 'users_reaching_limit_count', null, null, null, report.users_reaching_limit_count]);
  return '﻿' + rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}
