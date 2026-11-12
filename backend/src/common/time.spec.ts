import { addHours, addMinutes, dayBounds, dayOf, isIsoDate, monthOf, toIsoInZone, toIsoOrNull } from './time';

const TZ = 'Europe/Chisinau';

describe('time helpers (facility zone Europe/Chisinau)', () => {
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-11-12')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('12.11.2026')).toBe(false);
  });

  it('computes day bounds in winter time (+02:00)', () => {
    const { start, end } = dayBounds('2026-11-12', TZ);
    expect(start.toISOString()).toBe('2026-11-11T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-12T22:00:00.000Z');
  });

  it('formats like the spec examples', () => {
    expect(toIsoInZone(new Date('2026-11-12T16:00:00Z'), TZ)).toBe('2026-11-12T18:00:00+02:00');
    expect(toIsoInZone(new Date('2026-07-01T15:00:00Z'), TZ)).toBe('2026-07-01T18:00:00+03:00');
    expect(toIsoOrNull(null, TZ)).toBeNull();
  });

  it('derives day and quota month in the facility zone, not UTC', () => {
    const lateEvening = new Date('2026-11-30T22:30:00Z'); // 1 Dec 00:30 local
    expect(dayOf(lateEvening, TZ)).toBe('2026-12-01');
    expect(monthOf(lateEvening, TZ)).toBe('2026-12-01');
    expect(monthOf(new Date('2026-11-12T16:00:00Z'), TZ)).toBe('2026-11-01');
  });

  it('adds minutes and hours', () => {
    const t = new Date('2026-11-12T16:00:00Z');
    expect(addMinutes(t, 15).toISOString()).toBe('2026-11-12T16:15:00.000Z');
    expect(addHours(t, 2).toISOString()).toBe('2026-11-12T18:00:00.000Z');
  });
});
