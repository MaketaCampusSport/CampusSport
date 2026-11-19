import type { Resource } from '../../database/entities';
import { EXAMPLE_RESOURCES } from '../../database/seeds/example-data';
import { TEST_CONFIG } from '../../testing/test-app';
import { DEFAULT_RULES } from '../settings/settings.service';
import { ReportsService } from './reports.service';

const ex = EXAMPLE_RESOURCES.basketballCourt;
const COURT = {
  id: ex.id,
  name: ex.name,
  openingHours: ex.opening_hours,
  slotMinutes: ex.slot_minutes,
  active: true,
} as Resource;

/** Scripted database: each SQL statement is answered by the first matching handler. */
function scriptedDb(handlers: [RegExp, (params: unknown[]) => unknown][]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const handler = handlers.find(([re]) => re.test(sql));
    return handler ? handler[1](params) : [];
  });
  return { dataSource: { query }, calls };
}

describe('ReportsService.monthlyReport', () => {
  function setup(rules = DEFAULT_RULES) {
    const db = scriptedDb([
      [
        /status <> 'cancelled' AND period &&/,
        () => [
          {
            resource_id: COURT.id,
            start: new Date('2026-11-12T18:00:00+02:00'),
            end: new Date('2026-11-12T19:00:00+02:00'),
          },
        ],
      ],
      [/count\(\*\) FILTER/, () => [{ no_shows: '3', members: '40', externals: '5' }]],
      [/FROM monthly_quota/, () => [{ n: '2' }]],
    ]);
    const catalog = { findResources: jest.fn(async () => [COURT]) };
    const settings = { rules: jest.fn(async () => rules) };
    const service = new ReportsService(
      db.dataSource as never,
      catalog as never,
      settings as never,
      TEST_CONFIG,
    );
    return { service, catalog, calls: db.calls };
  }

  it('builds the MonthlyReport from the month in the facility time zone', async () => {
    const { service, catalog, calls } = setup();
    const report = await service.monthlyReport('2026-11');
    expect(report).toEqual({
      month: '2026-11',
      occupancy: [
        expect.objectContaining({ resource_id: COURT.id, resource_name: 'Teren baschet 2', rate: 0.0028 }),
      ],
      no_shows_count: 3,
      bookings_by_category: { members: 40, externals: 5 },
      users_reaching_limit_count: 2,
    });
    expect(report.occupancy[0].by_hour.find((h) => h.hour === 18)?.rate).toBe(0.0476);
    expect(catalog.findResources).toHaveBeenCalledWith({});
    const bounds = [new Date('2026-10-31T22:00:00Z'), new Date('2026-11-30T22:00:00Z')];
    expect(calls.find((c) => /period &&/.test(c.sql))?.params).toEqual(bounds);
    expect(calls.find((c) => /FILTER/.test(c.sql))?.params).toEqual(bounds);
  });

  it('users reaching the limit: consumed entries (used - refunded) against the configured quota', async () => {
    const { service, calls } = setup({ ...DEFAULT_RULES, monthly_quota: 6 });
    await service.monthlyReport('2026-11');
    const quota = calls.find((c) => /FROM monthly_quota/.test(c.sql))!;
    expect(quota.sql).toMatch(/used - refunded >= \$2/);
    expect(quota.params).toEqual(['2026-11-01', 6]);
  });
});
