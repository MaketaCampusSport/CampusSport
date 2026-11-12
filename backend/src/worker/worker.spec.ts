import { EXAMPLE_BOOKING, EXAMPLE_USERS } from '../database/seeds/example-data';
import { TEST_CONFIG } from '../testing/test-app';
import { DEFAULT_RULES } from '../modules/settings/settings.service';
import { MaintenanceService } from './maintenance.service';
import { BookingsProcessor, NotificationsProcessor, SchedulerService, WaitlistProcessor } from './processors';

describe('MaintenanceService.checkNoShow (BR-06)', () => {
  const now = new Date('2026-11-12T18:16:00+02:00');

  function setup(noShowsThisMonth: number, marked = true) {
    const calls: { sql: string; params: unknown[] }[] = [];
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/SET status = 'no_show'/.test(sql))
        return marked ? [{ user_id: EXAMPLE_USERS.student.id, start: new Date(EXAMPLE_BOOKING.start) }] : [];
      if (/count\(\*\) AS n/.test(sql)) return [{ n: String(noShowsThisMonth) }];
      if (/UPDATE users SET status = 'suspended'/.test(sql)) return [1];
      return [];
    });
    const em = { query };
    const dataSource = { query, transaction: async (cb: (e: typeof em) => unknown) => cb(em) };
    const audit = { record: jest.fn() };
    const service = new MaintenanceService(
      dataSource as never,
      { rules: async () => DEFAULT_RULES } as never,
      audit as never,
      {} as never,
      TEST_CONFIG,
    );
    return { service, calls, audit };
  }

  it('marks the booking; below the threshold nothing else happens', async () => {
    const { service, calls, audit } = setup(2);
    expect(await service.checkNoShow(EXAMPLE_BOOKING.id, now)).toBe(true);
    expect(calls.find((c) => /SET status = 'no_show'/.test(c.sql))!.params).toEqual([
      EXAMPLE_BOOKING.id,
      15,
      now,
    ]);
    expect(calls.some((c) => /suspended/.test(c.sql))).toBe(false);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('third no-show in November -> suspended 14 days, audited', async () => {
    const { service, calls, audit } = setup(3);
    await service.checkNoShow(EXAMPLE_BOOKING.id, now);
    const count = calls.find((c) => /count\(\*\) AS n/.test(c.sql))!;
    expect(count.params).toEqual([
      EXAMPLE_USERS.student.id,
      new Date('2026-11-01T00:00:00+02:00'),
      new Date('2026-12-01T00:00:00+02:00'),
    ]);
    const suspend = calls.find((c) => /UPDATE users SET status = 'suspended'/.test(c.sql))!;
    expect(suspend.params).toEqual([EXAMPLE_USERS.student.id, new Date(now.getTime() + 14 * 86_400_000)]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.auto_suspend', actorId: null }),
      expect.anything(),
    );
  });

  it('nothing when the booking was checked in, cancelled or is still in the window', async () => {
    const { service } = setup(5, false);
    expect(await service.checkNoShow(EXAMPLE_BOOKING.id, now)).toBe(false);
  });
});

describe('processors', () => {
  it('route jobs to the right service', async () => {
    const delivery = { deliver: jest.fn() };
    const waitlist = { offerFreedPeriod: jest.fn(), expireOffer: jest.fn() };
    const maintenance = {
      expireOffers: jest.fn(),
      checkNoShow: jest.fn(),
      scanNoShows: jest.fn(async () => 1),
      completeBookings: jest.fn(async () => 2),
      ensurePartitions: jest.fn(),
    };

    await new NotificationsProcessor(delivery as never).process({
      data: { type: 'booking-confirmed', userId: 'u', data: {} },
    } as never);
    expect(delivery.deliver).toHaveBeenCalled();

    const wp = new WaitlistProcessor(waitlist as never, maintenance as never);
    await wp.process({
      name: 'slot-freed',
      data: { resourceId: 'r', start: EXAMPLE_BOOKING.start, end: EXAMPLE_BOOKING.end },
    } as never);
    expect(waitlist.offerFreedPeriod).toHaveBeenCalledWith('r', {
      start: new Date(EXAMPLE_BOOKING.start),
      end: new Date(EXAMPLE_BOOKING.end),
    });
    await wp.process({ name: 'offer-expired', data: { waitlistId: 'w' } } as never);
    expect(waitlist.expireOffer).toHaveBeenCalledWith('w');
    await wp.process({ name: 'offer-scan', data: {} } as never);
    expect(maintenance.expireOffers).toHaveBeenCalled();
    await expect(wp.process({ name: 'nope', data: {} } as never)).rejects.toThrow(/Unknown/);

    const bp = new BookingsProcessor(maintenance as never);
    await bp.process({ name: 'no-show-check', data: { bookingId: 'b' } } as never);
    expect(maintenance.checkNoShow).toHaveBeenCalledWith('b');
    expect(await bp.process({ name: 'maintenance', data: {} } as never)).toEqual({
      no_shows: 1,
      completed: 2,
    });
    await bp.process({ name: 'partitions', data: {} } as never);
    expect(maintenance.ensurePartitions).toHaveBeenCalled();
  });

  it('scheduler registers the repeatable jobs', async () => {
    const bookings = { upsertJobScheduler: jest.fn() };
    const waitlist = { upsertJobScheduler: jest.fn() };
    const maintenance = { ensurePartitions: jest.fn(async () => undefined) };
    await new SchedulerService(
      bookings as never,
      waitlist as never,
      maintenance as never,
    ).onApplicationBootstrap();
    expect(bookings.upsertJobScheduler.mock.calls.map((c) => c[0])).toEqual(['maintenance', 'partitions']);
    expect(waitlist.upsertJobScheduler).toHaveBeenCalledWith(
      'offer-scan',
      { every: 60_000 },
      { name: 'offer-scan' },
    );
  });
});
