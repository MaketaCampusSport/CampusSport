import { QueryFailedError } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import type { Resource, WaitlistEntry } from '../../database/entities';
import {
  EXAMPLE_BLOCK_CREATE,
  EXAMPLE_BOOKING,
  EXAMPLE_RESOURCES,
  EXAMPLE_SPORTS,
  EXAMPLE_USERS,
} from '../../database/seeds/example-data';
import { TEST_CONFIG, TEST_USERS } from '../../testing/test-app';
import { AdminService } from '../admin/admin.service';
import { QuotaService } from '../quota/quota.service';
import { DEFAULT_RULES } from '../settings/settings.service';
import { WaitlistService } from '../waitlist/waitlist.service';
import { BlocksService } from './blocks.service';

type Handler = [RegExp, (params: unknown[]) => unknown];

/** Scripted database shared by the service tests below. */
function scriptedDb(handlers: Handler[], repos: Record<string, unknown> = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const h = handlers.find(([re]) => re.test(sql));
    return h ? h[1](params) : [];
  });
  const em = { query, getRepository: (e: { name: string }) => repos[e.name] };
  const dataSource = {
    query,
    manager: em,
    transaction: jest.fn(async (cb: (e: typeof em) => unknown) => cb(em)),
    getRepository: (e: { name: string }) => repos[e.name],
  };
  return { dataSource, calls, sql: (re: RegExp) => calls.filter((c) => re.test(c.sql)) };
}

const START = new Date('2026-11-12T18:00:00+02:00');
const END = new Date('2026-11-12T19:00:00+02:00');
const NOW = new Date('2026-11-12T16:05:00+02:00');

describe('BlocksService', () => {
  const events = { bookingsCancelled: jest.fn(), slotsChanged: jest.fn(), periodFreed: jest.fn() };
  const audit = { record: jest.fn() };
  const settings = { rules: jest.fn(async () => DEFAULT_RULES) };
  beforeEach(() => jest.clearAllMocks());

  function service(overlaps: unknown[], extra: Handler[] = []) {
    const db = scriptedDb([
      ...extra,
      [/SELECT id FROM resources/, () => [{ id: EXAMPLE_BLOCK_CREATE.resource_id }]],
      [/FOR UPDATE OF o/, () => overlaps],
      [
        /INSERT INTO occupancy/,
        (p) => [
          {
            id: 'new-block',
            resource_id: p[0],
            kind: p[3],
            start: p[1],
            end: p[2],
            reason: p[5],
            recurrence_id: null,
            created_by: p[4],
          },
        ],
      ],
      [/UPDATE monthly_quota SET refunded/, () => [1]],
    ]);
    const blocks = new BlocksService(
      db.dataSource as never,
      new QuotaService(db.dataSource as never),
      settings as never,
      audit as never,
      events as never,
      TEST_CONFIG,
    );
    return { blocks, ...db };
  }

  const studentBooking = {
    id: EXAMPLE_BOOKING.id,
    kind: 'booking',
    user_id: EXAMPLE_USERS.student.id,
    role: 'student',
    start: START,
    end: END,
  };
  const externalBooking = {
    id: 'ext-booking',
    kind: 'booking',
    user_id: EXAMPLE_USERS.external.id,
    role: 'external',
    start: END,
    end: new Date('2026-11-12T20:00:00+02:00'),
  };

  it('emergency "until further notice" cancels bookings, refunds students, notifies holders', async () => {
    const { blocks, sql } = service([studentBooking, externalBooking]);
    const result = await blocks.create(TEST_USERS.admin, { ...EXAMPLE_BLOCK_CREATE }, NOW);
    expect(result).toMatchObject({
      cancelled_bookings_count: 2,
      superseded_blocks_count: 0,
      notified_users_count: 2,
    });
    expect(result.block).toMatchObject({
      kind: 'emergency',
      end: null,
      reason: 'Avarie',
      start: '2026-11-12T16:05:00+02:00',
    });
    expect(sql(/cancel_source = \$2, reason = \$3/)[0].params).toEqual([
      [EXAMPLE_BOOKING.id, 'ext-booking'],
      'emergency',
      'Avarie',
    ]);
    expect(sql(/UPDATE monthly_quota SET refunded/)).toHaveLength(1);
    expect(sql(/INSERT INTO occupancy/)[0].params).toEqual([
      EXAMPLE_BLOCK_CREATE.resource_id,
      NOW,
      null,
      'emergency',
      TEST_USERS.admin.id,
      'Avarie',
    ]);
    expect(events.bookingsCancelled).toHaveBeenCalledWith(
      expect.any(Array),
      { source: 'emergency', reason: 'Avarie', blockId: 'new-block' },
      false,
    );
    expect(events.slotsChanged).toHaveBeenCalledWith([
      { resourceId: EXAMPLE_BLOCK_CREATE.resource_id, start: NOW, end: null, status: 'blocked' },
    ]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'block.create' }),
      expect.anything(),
    );
  });

  it('SRS 9.1: supersedes a PE class, refuses over another emergency/maintenance', async () => {
    const peClass = { id: 'pe', kind: 'pe_class', user_id: null, role: null, start: START, end: END };
    const ok = service([peClass]);
    expect(
      (await ok.blocks.create(TEST_USERS.admin, { ...EXAMPLE_BLOCK_CREATE, kind: 'maintenance' }, NOW))
        .superseded_blocks_count,
    ).toBe(1);
    const maintenance = { ...peClass, id: 'm', kind: 'maintenance' };
    const conflict = service([maintenance]);
    await expect(
      conflict.blocks.create(TEST_USERS.admin, { ...EXAMPLE_BLOCK_CREATE }, NOW),
    ).rejects.toMatchObject({ code: 'BLOCK_CONFLICT' });
    expect(conflict.sql(/INSERT INTO occupancy/)).toHaveLength(0);
  });

  it('retries when a booking slips in before the insert', async () => {
    let attempts = 0;
    const { blocks } = service(
      [],
      [
        [
          /INSERT INTO occupancy/,
          (p) => {
            attempts += 1;
            if (attempts === 1)
              throw new QueryFailedError(
                'INSERT',
                [],
                Object.assign(new Error('no_overlap'), { code: '23P01' }),
              );
            return [
              {
                id: 'b',
                resource_id: p[0],
                kind: p[3],
                start: p[1],
                end: p[2],
                reason: p[5],
                recurrence_id: null,
                created_by: p[4],
              },
            ];
          },
        ],
      ],
    );
    await blocks.create(TEST_USERS.admin, { ...EXAMPLE_BLOCK_CREATE }, NOW);
    expect(attempts).toBe(2);
  });

  it('validates end > start, unknown resource and refuses recurrence for now', async () => {
    const { blocks } = service([]);
    await expect(
      blocks.create(
        TEST_USERS.admin,
        { ...EXAMPLE_BLOCK_CREATE, start: '2026-11-12T18:00:00+02:00', end: '2026-11-12T17:00:00+02:00' },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      blocks.create(
        TEST_USERS.admin,
        {
          ...EXAMPLE_BLOCK_CREATE,
          recurrence: { rule: 'FREQ=WEEKLY;BYDAY=TU', valid_from: '2027-02-01', valid_to: '2027-06-13' },
        },
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
    const missing = service([], [[/SELECT id FROM resources/, () => []]]);
    await expect(
      missing.blocks.create(TEST_USERS.admin, { ...EXAMPLE_BLOCK_CREATE }, NOW),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('remove: ends a started open-ended block now and frees up to the teacher window', async () => {
    const block = {
      id: 'b',
      resource_id: EXAMPLE_BLOCK_CREATE.resource_id,
      kind: 'emergency',
      start: new Date('2026-11-12T10:00:00+02:00'),
      end: null,
      reason: 'Avarie',
      recurrence_id: null,
      created_by: TEST_USERS.admin.id,
    };
    const { blocks, sql } = service(
      [],
      [
        [
          /FROM occupancy WHERE id = \$1 AND kind <> 'booking' AND status = 'active' FOR UPDATE/,
          () => [block],
        ],
      ],
    );
    await blocks.remove(TEST_USERS.admin, 'b', NOW);
    expect(sql(/SET period = tstzrange\(lower\(period\), \$2/)[0].params).toEqual(['b', NOW]);
    expect(events.periodFreed).toHaveBeenCalledWith(
      block.resource_id,
      NOW,
      new Date(NOW.getTime() + 14 * 86_400_000),
    );
  });

  it('remove: a future block is cancelled; unknown -> 404', async () => {
    const future = {
      id: 'f',
      resource_id: 'r',
      kind: 'maintenance',
      start: START,
      end: END,
      reason: 'x',
      recurrence_id: null,
      created_by: 'a',
    };
    const ok = service([], [[/FOR UPDATE$/, () => [future]]]);
    await ok.blocks.remove(TEST_USERS.admin, 'f', NOW);
    expect(ok.sql(/SET status = 'cancelled', cancel_source = 'admin'/)).toHaveLength(1);
    expect(events.periodFreed).toHaveBeenCalledWith('r', START, END);
    await expect(service([]).blocks.remove(TEST_USERS.admin, 'zzz', NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('delivery counts notified / delivered / failed and messages per channel', async () => {
    const { blocks } = service(
      [],
      [
        [/SELECT 1 FROM occupancy WHERE id/, () => [1]],
        [/count\(DISTINCT user_id\)/, () => [{ notified: '23', delivered: '21', failed: '0' }]],
        [
          /GROUP BY channel/,
          () => [
            { channel: 'push', n: '19' },
            { channel: 'email', n: '23' },
            { channel: 'sms', n: '4' },
          ],
        ],
      ],
    );
    expect(await blocks.delivery('b')).toEqual({
      notified: 23,
      delivered: 21,
      failed: 0,
      by_channel: { push: 19, email: 23, sms: 4 },
    });
  });
});

describe('WaitlistService', () => {
  const ex = EXAMPLE_RESOURCES.basketballCourt;
  const court = {
    id: ex.id,
    name: ex.name,
    openingHours: ex.opening_hours,
    slotMinutes: 60,
    active: true,
    sports: [{ id: EXAMPLE_SPORTS.basketball.id }],
  } as unknown as Resource;
  const jobs = { notify: jest.fn(), offerExpires: jest.fn(), slotFreed: jest.fn() };
  const bookings = { create: jest.fn() };
  const settings = { rules: jest.fn(async () => DEFAULT_RULES) };
  beforeEach(() => jest.clearAllMocks());

  function service(handlers: Handler[], repos: Record<string, unknown> = {}) {
    const db = scriptedDb(handlers, {
      Resource: { findOne: async () => court, findOneBy: async () => court },
      Sport: { existsBy: async () => true },
      ...repos,
    });
    return {
      waitlist: new WaitlistService(
        db.dataSource as never,
        bookings as never,
        settings as never,
        jobs as never,
        TEST_CONFIG,
      ),
      ...db,
    };
  }

  it('join: priority from role; slot must be on the grid; admins cannot join', async () => {
    const saved: Partial<WaitlistEntry>[] = [];
    const repo = {
      create: (e: Partial<WaitlistEntry>) => e,
      save: async (e: Partial<WaitlistEntry>) => {
        saved.push(e);
        return { id: 'w1', status: 'waiting', offeredAt: null, offerExpiresAt: null, createdAt: NOW, ...e };
      },
    };
    const { waitlist } = service([], { WaitlistEntry: repo });
    const now = new Date('2026-11-11T10:00:00+02:00');
    const entry = await waitlist.join(
      TEST_USERS.teacher,
      {
        day: '2026-11-12',
        resource_id: court.id,
        start: '2026-11-12T18:00:00+02:00',
        end: '2026-11-12T19:00:00+02:00',
      },
      now,
    );
    expect(entry).toMatchObject({
      priority: 1,
      start: '2026-11-12T18:00:00+02:00',
      end: '2026-11-12T19:00:00+02:00',
      status: 'waiting',
    });
    await expect(
      waitlist.join(
        TEST_USERS.student,
        {
          day: '2026-11-12',
          resource_id: court.id,
          start: '2026-11-12T18:30:00+02:00',
          end: '2026-11-12T19:30:00+02:00',
        },
        now,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(
      waitlist.join(
        TEST_USERS.student,
        {
          day: '2026-11-13',
          resource_id: court.id,
          start: '2026-11-12T18:00:00+02:00',
          end: '2026-11-12T19:00:00+02:00',
        },
        now,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(waitlist.join(TEST_USERS.student, { day: '2026-11-12' }, now)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    await expect(
      waitlist.join(TEST_USERS.admin, { day: '2026-11-12', sport_id: EXAMPLE_SPORTS.football.id }, now),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      waitlist.join(TEST_USERS.suspended, { day: '2026-11-12', sport_id: EXAMPLE_SPORTS.football.id }, now),
    ).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    const sub = await waitlist.join(
      TEST_USERS.external,
      { day: '2026-11-12', sport_id: EXAMPLE_SPORTS.football.id },
      now,
    );
    expect(sub).toMatchObject({ priority: 3, resource_id: null, start: null });
  });

  it('join: duplicate -> ALREADY_ON_WAITLIST', async () => {
    const repo = {
      create: (e: unknown) => e,
      save: async () => {
        throw new QueryFailedError('INSERT', [], Object.assign(new Error('dup'), { code: '23505' }));
      },
    };
    const { waitlist } = service([], { WaitlistEntry: repo });
    await expect(
      waitlist.join(TEST_USERS.student, { day: '2026-11-12', sport_id: EXAMPLE_SPORTS.basketball.id }, NOW),
    ).rejects.toMatchObject({ code: 'ALREADY_ON_WAITLIST' });
  });

  it('offer: first candidate gets 10 minutes when the slot is more than 2 h away', async () => {
    const { waitlist, sql } = service([
      [
        /SELECT w.id, w.user_id FROM waitlist/,
        () => [
          { id: 'w-teacher', user_id: 't' },
          { id: 'w-student', user_id: 's' },
        ],
      ],
    ]);
    const threeHoursBefore = new Date('2026-11-12T15:00:00+02:00');
    const results = await waitlist.offerFreedPeriod(court.id, { start: START, end: END }, threeHoursBefore);
    expect(results).toEqual([
      { slot: { start: START, end: END }, offeredTo: ['w-teacher'], simultaneous: false },
    ]);
    const update = sql(/SET status = 'offered'/)[0].params;
    expect(update[0]).toEqual(['w-teacher']);
    expect(update[2]).toEqual(new Date(threeHoursBefore.getTime() + 10 * 60_000));
    expect(jobs.notify).toHaveBeenCalledTimes(1);
    expect(jobs.offerExpires).toHaveBeenCalledWith(
      { waitlistId: 'w-teacher' },
      new Date(threeHoursBefore.getTime() + 10 * 60_000),
    );
  });

  it('offer: everyone at once (no expiry) when the slot starts in under 2 h', async () => {
    const { waitlist, sql } = service([
      [
        /SELECT w.id, w.user_id FROM waitlist/,
        () => [
          { id: 'a', user_id: '1' },
          { id: 'b', user_id: '2' },
        ],
      ],
    ]);
    const soon = new Date('2026-11-12T16:30:00+02:00');
    const [result] = await waitlist.offerFreedPeriod(court.id, { start: START, end: END }, soon);
    expect(result).toMatchObject({ offeredTo: ['a', 'b'], simultaneous: true });
    expect(sql(/SET status = 'offered'/)[0].params[2]).toBeNull();
    expect(jobs.offerExpires).not.toHaveBeenCalled();
    expect(jobs.notify).toHaveBeenCalledTimes(2);
  });

  it('offer: skips slots that are taken again, already offered, or without candidates', async () => {
    const taken = service([[/SELECT 1 FROM occupancy/, () => [1]]]);
    expect(await taken.waitlist.offerFreedPeriod(court.id, { start: START, end: END }, NOW)).toEqual([]);
    const pending = service([[/SELECT 1 FROM waitlist WHERE status = 'offered'/, () => [1]]]);
    expect(await pending.waitlist.offerFreedPeriod(court.id, { start: START, end: END }, NOW)).toEqual([]);
    expect(await service([]).waitlist.offerFreedPeriod(court.id, { start: START, end: END }, NOW)).toEqual(
      [],
    );
  });

  it('offer: a freed 3-hour block yields one offer per free future slot', async () => {
    const { waitlist } = service([
      [/SELECT w.id, w.user_id FROM waitlist/, () => [{ id: 'x', user_id: 'u' }]],
    ]);
    const results = await waitlist.offerFreedPeriod(
      court.id,
      { start: START, end: new Date('2026-11-12T21:00:00+02:00') },
      NOW,
    );
    expect(results.map((r) => r.slot.start.toISOString())).toEqual([
      '2026-11-12T16:00:00.000Z',
      '2026-11-12T17:00:00.000Z',
      '2026-11-12T18:00:00.000Z',
    ]);
  });

  it('accept: books through the booking algorithm; a lost race becomes OFFER_TAKEN', async () => {
    const offered = {
      id: 'w1',
      userId: TEST_USERS.student.id,
      status: 'offered',
      offerExpiresAt: new Date(NOW.getTime() + 60_000),
      offeredResourceId: court.id,
      offeredPeriod: { start: START, end: END },
    };
    const { waitlist } = service([], { WaitlistEntry: { findOneBy: async () => offered } });
    bookings.create.mockResolvedValueOnce(EXAMPLE_BOOKING);
    await expect(waitlist.accept(TEST_USERS.student, 'w1', NOW)).resolves.toBe(EXAMPLE_BOOKING);
    expect(bookings.create).toHaveBeenCalledWith(
      TEST_USERS.student,
      { resource_id: court.id, start: START.toISOString() },
      expect.objectContaining({ now: NOW }),
    );

    bookings.create.mockRejectedValueOnce(new AppException('SLOT_TAKEN'));
    await expect(waitlist.accept(TEST_USERS.student, 'w1', NOW)).rejects.toMatchObject({
      code: 'OFFER_TAKEN',
    });
  });

  it('accept: expired offers -> OFFER_EXPIRED, unknown -> NOT_FOUND', async () => {
    const expired = {
      id: 'w1',
      status: 'offered',
      offerExpiresAt: new Date(NOW.getTime() - 1),
      offeredResourceId: court.id,
      offeredPeriod: { start: START, end: END },
    };
    await expect(
      service([], { WaitlistEntry: { findOneBy: async () => expired } }).waitlist.accept(
        TEST_USERS.student,
        'w1',
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'OFFER_EXPIRED' });
    await expect(
      service([], { WaitlistEntry: { findOneBy: async () => null } }).waitlist.accept(
        TEST_USERS.student,
        'w1',
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('leave: an entry with a pending offer passes the slot on', async () => {
    const offered = {
      id: 'w1',
      status: 'offered',
      offeredResourceId: court.id,
      offeredPeriod: { start: START, end: END },
    };
    const repo = { findOneBy: async () => offered, delete: jest.fn() };
    await service([], { WaitlistEntry: repo }).waitlist.leave(TEST_USERS.student, 'w1');
    expect(repo.delete).toHaveBeenCalledWith({ id: 'w1' });
    expect(jobs.slotFreed).toHaveBeenCalledWith({
      resourceId: court.id,
      start: START.toISOString(),
      end: END.toISOString(),
    });
  });
});

describe('AdminService.updateSettings', () => {
  it('writes only changed keys, audits old/new, rejects per-sport quotas', async () => {
    const db = scriptedDb([[/FROM settings|INSERT INTO settings/, () => []]], {
      Setting: { find: async () => [] },
    });
    const settings = {
      snapshot: jest.fn(async () => ({ rules: DEFAULT_RULES, updatedBy: null, updatedAt: null })),
    };
    const audit = { record: jest.fn() };
    const admin = new AdminService(db.dataSource as never, settings as never, audit as never, TEST_CONFIG);

    await admin.updateSettings(TEST_USERS.admin, { ...DEFAULT_RULES, monthly_quota: 5 });
    const writes = db.sql(/INSERT INTO settings/);
    expect(writes).toHaveLength(1);
    expect(writes[0].params).toEqual(['monthly_quota', '5', TEST_USERS.admin.id]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.update',
        before: { monthly_quota: 4 },
        after: { monthly_quota: 5 },
      }),
      expect.anything(),
    );

    await expect(
      admin.updateSettings(TEST_USERS.admin, {
        ...DEFAULT_RULES,
        monthly_quota_per_sport: { [EXAMPLE_SPORTS.football.id]: 2 },
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});
