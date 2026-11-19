import { EXAMPLE_RESOURCES } from '../../database/seeds/example-data';
import { daysOfMonth, monthBounds, occupancyRate, reportToCsv } from './monthly-report';

const TZ = 'Europe/Chisinau';
const COURT = EXAMPLE_RESOURCES.basketballCourt;
const at = (iso: string) => new Date(iso);

describe('monthBounds / daysOfMonth', () => {
  it('uses the facility time zone across the DST change (October 2026)', () => {
    expect(monthBounds('2026-10', TZ)).toEqual({
      start: at('2026-09-30T21:00:00Z'),
      end: at('2026-10-31T22:00:00Z'),
    });
    expect(daysOfMonth('2026-10', TZ)).toHaveLength(31);
    expect(daysOfMonth('2026-02', TZ)).toHaveLength(28);
    expect(daysOfMonth('2026-11', TZ)[0]).toBe('2026-11-01');
  });
});

describe('occupancyRate', () => {
  /** Open on Mondays 18–20 only: November 2026 has 5 Mondays, so 10 one-hour slots. */
  const mondayEvenings = {
    id: COURT.id,
    name: COURT.name,
    openingHours: { mon: [{ open: '18:00', close: '20:00' }] },
    slotMinutes: 60,
  };

  it('booked slot time / opening slot time, overall and per hour', () => {
    const result = occupancyRate(
      mondayEvenings,
      [
        { start: at('2026-11-09T19:00:00+02:00'), end: at('2026-11-09T20:00:00+02:00') },
        { start: at('2026-11-02T18:00:00+02:00'), end: at('2026-11-02T19:00:00+02:00') },
        { start: at('2026-11-09T18:00:00+02:00'), end: at('2026-11-09T19:00:00+02:00') },
        // Outside opening hours (Tuesday): not part of the grid.
        { start: at('2026-11-03T18:00:00+02:00'), end: at('2026-11-03T19:00:00+02:00') },
      ],
      '2026-11',
      TZ,
    );
    expect(result).toEqual({
      resource_id: COURT.id,
      resource_name: 'Teren baschet 2',
      rate: 0.3,
      by_hour: [
        { hour: 18, rate: 0.4 },
        { hour: 19, rate: 0.2 },
      ],
    });
  });

  it('splits 90-minute slots across clock hours', () => {
    const result = occupancyRate(
      { ...mondayEvenings, openingHours: { mon: [{ open: '07:00', close: '10:00' }] }, slotMinutes: 90 },
      [{ start: at('2026-11-02T07:00:00+02:00'), end: at('2026-11-02T08:30:00+02:00') }],
      '2026-11',
      TZ,
    );
    expect(result.rate).toBe(0.1); // 90 of 900 minutes
    expect(result.by_hour).toEqual([
      { hour: 7, rate: 0.2 }, // 60 of 300 minutes
      { hour: 8, rate: 0.1 }, // 30 of 300 minutes
      { hour: 9, rate: 0 },
    ]);
  });

  it('a booking longer than a slot (older slot length) marks every slot it overlaps', () => {
    const result = occupancyRate(
      mondayEvenings,
      [{ start: at('2026-11-16T18:30:00+02:00'), end: at('2026-11-16T19:30:00+02:00') }],
      '2026-11',
      TZ,
    );
    expect(result.rate).toBe(0.2);
  });

  it('rate 0 and no hours for a resource that is never open', () => {
    expect(occupancyRate({ ...mondayEvenings, openingHours: {} }, [], '2026-11', TZ)).toMatchObject({
      rate: 0,
      by_hour: [],
    });
  });

  it('counts the standard week (21 weekdays × 15 + 4 Saturdays × 9 slots in November 2026)', () => {
    const result = occupancyRate(
      { id: COURT.id, name: COURT.name, openingHours: COURT.opening_hours, slotMinutes: 60 },
      [{ start: at('2026-11-12T18:00:00+02:00'), end: at('2026-11-12T19:00:00+02:00') }],
      '2026-11',
      TZ,
    );
    expect(result.rate).toBe(Math.round((1 / 351) * 10_000) / 10_000);
    expect(result.by_hour.find((h) => h.hour === 18)).toEqual({ hour: 18, rate: 0.0476 }); // 1 of 21
    expect(result.by_hour.map((h) => h.hour)).toEqual([
      7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    ]);
  });
});

describe('reportToCsv', () => {
  it('one flat table with a BOM, CRLF lines and RFC 4180 quoting', () => {
    const csv = reportToCsv({
      month: '2026-10',
      occupancy: [
        {
          resource_id: COURT.id,
          resource_name: 'Sala "mare", etaj 1',
          rate: 0.72,
          by_hour: [{ hour: 18, rate: 0.95 }],
        },
      ],
      no_shows_count: 37,
      bookings_by_category: { members: 812, externals: 64 },
      users_reaching_limit_count: 58,
    });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.slice(1).trimEnd().split('\r\n')).toEqual([
      'month,metric,resource_id,resource_name,hour,value',
      `2026-10,occupancy_rate,${COURT.id},"Sala ""mare"", etaj 1",,0.72`,
      `2026-10,occupancy_rate_by_hour,${COURT.id},"Sala ""mare"", etaj 1",18,0.95`,
      '2026-10,no_shows_count,,,,37',
      '2026-10,bookings_members,,,,812',
      '2026-10,bookings_externals,,,,64',
      '2026-10,users_reaching_limit_count,,,,58',
    ]);
  });
});
