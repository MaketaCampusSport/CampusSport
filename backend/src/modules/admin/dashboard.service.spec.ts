import type { Resource } from '../../database/entities';
import { EXAMPLE_RESOURCES } from '../../database/seeds/example-data';
import { TEST_CONFIG, TEST_USERS } from '../../testing/test-app';
import { DashboardService } from './dashboard.service';

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

describe('DashboardService.dashboard', () => {
  function setup() {
    const db = scriptedDb([[/FILTER \(WHERE checked_in_at/, () => [{ check_ins: '41', no_shows: '3' }]]]);
    const grid = [{ resource_id: COURT.id, resource_name: COURT.name, slots: [] }];
    const catalog = { findResources: jest.fn(async () => [COURT]) };
    const availability = { gridFor: jest.fn(async () => grid) };
    const service = new DashboardService(
      db.dataSource as never,
      catalog as never,
      availability as never,
      TEST_CONFIG,
    );
    return { service, availability, catalog, grid, calls: db.calls };
  }

  it('the grid of every active resource (admin view) plus the day counts', async () => {
    const { service, availability, catalog, grid, calls } = setup();
    const now = new Date('2026-11-05T10:00:00+02:00');
    const result = await service.dashboard(TEST_USERS.admin, '2026-11-05', now);
    expect(result).toEqual({ date: '2026-11-05', resources: grid, check_ins_count: 41, no_shows_count: 3 });
    expect(catalog.findResources).toHaveBeenCalledWith({});
    expect(availability.gridFor).toHaveBeenCalledWith([COURT], '2026-11-05', TEST_USERS.admin, now);
    expect(calls[0].params).toEqual([new Date('2026-11-04T22:00:00Z'), new Date('2026-11-05T22:00:00Z')]);
  });

  it('defaults to today in the facility time zone', async () => {
    const { service, availability } = setup();
    // 23:30 UTC on 4 November is already 5 November in Chisinau.
    const result = await service.dashboard(TEST_USERS.admin, undefined, new Date('2026-11-04T23:30:00Z'));
    expect(result.date).toBe('2026-11-05');
    expect(availability.gridFor).toHaveBeenCalledWith(
      [COURT],
      '2026-11-05',
      TEST_USERS.admin,
      expect.any(Date),
    );
  });
});
