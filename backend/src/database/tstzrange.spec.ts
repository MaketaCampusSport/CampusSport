import { formatTstzRange, parseTstzRange, tstzRangeTransformer } from './tstzrange';

describe('tstzrange', () => {
  it('parses the Postgres text form with short offsets', () => {
    const r = parseTstzRange('["2026-11-12 16:00:00+00","2026-11-12 17:00:00+00")');
    expect(r?.start.toISOString()).toBe('2026-11-12T16:00:00.000Z');
    expect(r?.end?.toISOString()).toBe('2026-11-12T17:00:00.000Z');
  });

  it('parses non-UTC offsets and fractional seconds', () => {
    const r = parseTstzRange('["2026-11-12 18:00:00.5+02","2026-11-12 19:00:00+02")');
    expect(r?.start.toISOString()).toBe('2026-11-12T16:00:00.500Z');
  });

  it('parses an open upper bound as end = null (emergency block)', () => {
    const r = parseTstzRange('["2026-11-12 16:00:00+00",)');
    expect(r?.end).toBeNull();
  });

  it('formats as half-open [start,end)', () => {
    const s = formatTstzRange({ start: new Date('2026-11-12T16:00:00Z'), end: new Date('2026-11-12T17:00:00Z') });
    expect(s).toBe('[2026-11-12T16:00:00.000Z,2026-11-12T17:00:00.000Z)');
    expect(formatTstzRange({ start: new Date('2026-11-12T16:00:00Z'), end: null })).toBe('[2026-11-12T16:00:00.000Z,)');
  });

  it('round-trips through the transformer and keeps nulls', () => {
    const range = { start: new Date('2026-11-12T16:00:00Z'), end: new Date('2026-11-12T17:00:00Z') };
    expect(tstzRangeTransformer.from(tstzRangeTransformer.to(range))).toEqual(range);
    expect(tstzRangeTransformer.from(null)).toBeNull();
    expect(tstzRangeTransformer.to(null)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(() => parseTstzRange('nonsense')).toThrow();
    expect(() => parseTstzRange('empty')).toThrow();
    expect(() => parseTstzRange('(,)')).toThrow(/lower bound/);
  });
});
