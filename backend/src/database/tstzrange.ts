import { ValueTransformer } from 'typeorm';

/** A PostgreSQL `tstzrange` with `[start, end)` bounds; `end = null` means unbounded ("până la noi ordine"). */
export interface TimeRange {
  start: Date;
  end: Date | null;
}

/** Postgres prints `2026-11-12 16:00:00+00`; JS needs `2026-11-12T16:00:00+00:00`. */
function parseTimestamp(raw: string): Date | null {
  const value = raw.trim().replace(/^"|"$/g, '');
  if (value === '' || value === 'infinity' || value === '-infinity') return null;
  const iso = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid timestamp in tstzrange: ${raw}`);
  return date;
}

export function parseTstzRange(raw: string | null | undefined): TimeRange | null {
  if (raw === null || raw === undefined) return null;
  if (raw === 'empty') throw new Error('Empty tstzrange is not supported');
  const match = /^[[(](.*),(.*)[\])]$/.exec(raw.trim());
  if (!match) throw new Error(`Invalid tstzrange: ${raw}`);
  const start = parseTimestamp(match[1]);
  if (!start) throw new Error(`tstzrange without lower bound: ${raw}`);
  return { start, end: parseTimestamp(match[2]) };
}

export function formatTstzRange(range: TimeRange | null | undefined): string | null {
  if (!range) return null;
  return `[${range.start.toISOString()},${range.end ? range.end.toISOString() : ''})`;
}

export const tstzRangeTransformer: ValueTransformer = {
  to: (value: TimeRange | null | undefined) => formatTstzRange(value),
  from: (value: string | null) => parseTstzRange(value),
};
