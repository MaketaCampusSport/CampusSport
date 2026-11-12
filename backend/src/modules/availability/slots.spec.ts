import { STANDARD_HOURS } from '../../database/seeds/example-data';
import { findSlot, invalidRanges, openingRanges, overlaps, slotsForDay, weekdayOf, withinWeeklyHours } from './slots';

const TZ = 'Europe/Chisinau';
const iso = (d: Date) => d.toISOString();

describe('slot grid', () => {
  it('Thursday 2026-11-12, 07:00–22:00, 60 min -> 15 slots in local time', () => {
    expect(weekdayOf('2026-11-12', TZ)).toBe('thu');
    const slots = slotsForDay(STANDARD_HOURS, 60, '2026-11-12', TZ);
    expect(slots).toHaveLength(15);
    expect(iso(slots[0].start)).toBe('2026-11-12T05:00:00.000Z'); // 07:00+02:00
    expect(iso(slots[11].start)).toBe('2026-11-12T16:00:00.000Z'); // 18:00+02:00, the spec example slot
    expect(iso(slots[14].end)).toBe('2026-11-12T20:00:00.000Z'); // 22:00+02:00
  });

  it('90-minute slots stop before closing time', () => {
    const slots = slotsForDay(STANDARD_HOURS, 90, '2026-11-12', TZ);
    expect(slots).toHaveLength(10);
    expect(iso(slots[9].end)).toBe('2026-11-12T20:00:00.000Z');
  });

  it('Saturday uses its own hours, Sunday is closed', () => {
    expect(slotsForDay(STANDARD_HOURS, 60, '2026-11-14', TZ)).toHaveLength(9);
    expect(slotsForDay(STANDARD_HOURS, 60, '2026-11-15', TZ)).toEqual([]);
  });

  it('handles several ranges per day', () => {
    const hours = { mon: [{ open: '08:00', close: '10:00' }, { open: '16:00', close: '18:00' }] };
    expect(slotsForDay(hours, 60, '2026-11-09', TZ).map((s) => iso(s.start))).toEqual([
      '2026-11-09T06:00:00.000Z',
      '2026-11-09T07:00:00.000Z',
      '2026-11-09T14:00:00.000Z',
      '2026-11-09T15:00:00.000Z',
    ]);
  });

  it('follows the summer offset (+03:00) after the DST change', () => {
    const hours = { sun: [{ open: '09:00', close: '11:00' }] };
    const [first] = slotsForDay(hours, 60, '2027-03-28', TZ);
    expect(iso(first.start)).toBe('2027-03-28T06:00:00.000Z');
    expect(openingRanges(hours, '2027-03-21', TZ)[0].start.toISOString()).toBe('2027-03-21T07:00:00.000Z');
  });
});

describe('findSlot', () => {
  it('resolves the spec example start 18:00+02:00 to 18:00–19:00', () => {
    const r = findSlot(STANDARD_HOURS, 60, new Date('2026-11-12T18:00:00+02:00'), TZ);
    expect(r).toEqual({ slot: { start: new Date('2026-11-12T16:00:00Z'), end: new Date('2026-11-12T17:00:00Z') } });
  });

  it('INVALID_SLOT for a start off the grid, OUTSIDE_OPENING_HOURS when closed', () => {
    expect(findSlot(STANDARD_HOURS, 60, new Date('2026-11-12T18:30:00+02:00'), TZ)).toEqual({ error: 'INVALID_SLOT' });
    expect(findSlot(STANDARD_HOURS, 60, new Date('2026-11-12T06:00:00+02:00'), TZ)).toEqual({ error: 'OUTSIDE_OPENING_HOURS' });
    expect(findSlot(STANDARD_HOURS, 60, new Date('2026-11-15T10:00:00+02:00'), TZ)).toEqual({ error: 'OUTSIDE_OPENING_HOURS' });
  });
});

describe('helpers', () => {
  it('withinWeeklyHours checks the external access window', () => {
    const windows = { sat: [{ open: '09:00', close: '18:00' }] };
    const sat = { start: new Date('2026-11-14T10:00:00+02:00'), end: new Date('2026-11-14T11:30:00+02:00') };
    const thu = { start: new Date('2026-11-12T10:00:00+02:00'), end: new Date('2026-11-12T11:00:00+02:00') };
    expect(withinWeeklyHours(windows, sat, TZ)).toBe(true);
    expect(withinWeeklyHours(windows, thu, TZ)).toBe(false);
    expect(withinWeeklyHours(null, sat, TZ)).toBe(false);
  });

  it('overlaps treats end = null as open-ended', () => {
    const slot = { start: new Date('2026-11-12T16:00:00Z'), end: new Date('2026-11-12T17:00:00Z') };
    expect(overlaps({ start: new Date('2026-11-12T15:00:00Z'), end: null }, slot)).toBe(true);
    expect(overlaps({ start: new Date('2026-11-12T17:00:00Z'), end: null }, slot)).toBe(false);
    expect(overlaps({ start: new Date('2026-11-12T15:00:00Z'), end: new Date('2026-11-12T16:00:00Z') }, slot)).toBe(false);
  });

  it('invalidRanges reports close <= open', () => {
    expect(invalidRanges(STANDARD_HOURS)).toEqual([]);
    expect(invalidRanges({ tue: [{ open: '18:00', close: '08:00' }] })).toEqual(['tue[0]: close must be after open']);
  });
});
