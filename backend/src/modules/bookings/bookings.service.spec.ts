import { QueryFailedError } from 'typeorm';
import type { Resource } from '../../database/entities';
import { EXAMPLE_BOOKING, EXAMPLE_RESOURCES, EXAMPLE_SPORTS, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { TEST_CONFIG, TEST_USERS } from '../../testing/test-app';
import { QuotaService } from '../quota/quota.service';
import { DEFAULT_RULES, Rules } from '../settings/settings.service';
import type { BookingRow } from './booking.presenter';
import { BookingsService } from './bookings.service';
import { QrService } from './qr.service';

const ex = EXAMPLE_RESOURCES.basketballCourt;
const COURT: Resource = {
  id: ex.id,
  name: ex.name,
  type: ex.type,
  location: ex.location,
  photoUrl: ex.photo_url,
  capacity: ex.capacity,
  equipment: ex.equipment,
  openingHours: ex.opening_hours,
  slotMinutes: ex.slot_minutes,
  externalAccess: ex.external_access,
  externalAccessWindows: null,
  active: true,
  sports: [{ id: EXAMPLE_SPORTS.basketball.id, nameRo: 'Baschet', nameEn: 'Basketball', icon: 'basketball', requiredEquipment: ['panou'] }],
};
const START = new Date(EXAMPLE_BOOKING.start);
const END = new Date(EXAMPLE_BOOKING.end);
const NOW = new Date('2026-11-11T10:00:00+02:00');
const NONCE = 'a91c07d2-1111-4222-8333-444455556666';

function bookingRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: EXAMPLE_BOOKING.id,
    resource_id: COURT.id,
    resource_name: COURT.name,
    user_id: EXAMPLE_USERS.student.id,
    start: START,
    end: END,
    status: 'active',
    cancel_source: null,
    reason: null,
    checked_in_at: null,
    participants_count: 8,
    qr_nonce: NONCE,
    holder_name: 'Ion Popescu',
    holder_role: 'student',
    ...overrides,
  };
}

/** Scripted database: each SQL statement is answered by the first matching handler. */
function setup(options: { rules?: Partial<Rules>; quota?: { used: number; refunded: number }; active?: number; row?: BookingRow | null } = {}) {
  const state = { row: options.row === undefined ? bookingRow() : options.row, insertError: null as unknown };
  const calls: { sql: string; params: unknown[] }[] = [];
  const handlers: [RegExp, (params: unknown[]) => unknown][] = [
    [/FROM monthly_quota/, () => (options.quota ? [options.quota] : [])],
    [/SELECT count\(\*\) AS n FROM occupancy\s+WHERE user_id/, () => [{ n: String(options.active ?? 0) }]],
    [/INSERT INTO occupancy/, () => {
      if (state.insertError) throw state.insertError;
      return [{ id: EXAMPLE_BOOKING.id }];
    }],
    [/UPDATE monthly_quota SET refunded/, () => [1]],
    [/SELECT kind FROM occupancy/, () => [{ kind: 'booking' }]],
    [/FROM occupancy o\s+JOIN resources r/, () => (state.row ? [state.row] : [])],
  ];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const handler = handlers.find(([re]) => re.test(sql));
    return handler ? handler[1](params) : [];
  });
  const em = { query };
  const dataSource = {
    query,
    manager: em,
    transaction: jest.fn(async (cb: (e: typeof em) => unknown) => cb(em)),
    getRepository: () => ({ findOne: async () => COURT }),
  };
  const rules = { ...DEFAULT_RULES, ...options.rules };
  const settings = { rules: jest.fn(async () => rules) };
  const events = { bookingCreated: jest.fn(), bookingsCancelled: jest.fn() };
  const qr = new QrService(TEST_CONFIG);
  const service = new BookingsService(
    dataSource as never,
    settings as never,
    new QuotaService(dataSource as never),
    qr,
    events as never,
    TEST_CONFIG,
  );
  const sql = (re: RegExp) => calls.filter((c) => re.test(c.sql));
  return { service, state, events, qr, sql };
}

const CREATE = { resource_id: COURT.id, start: EXAMPLE_BOOKING.start, participants_count: 8 };

describe('BookingsService.create', () => {
  it('books the spec example, consumes the quota and returns QR + message', async () => {
    const { service, events, sql } = setup();
    const booking = await service.create(TEST_USERS.student, CREATE, { now: NOW });
    expect(booking).toMatchObject({
      id: EXAMPLE_BOOKING.id,
      resource_name: 'Teren baschet 2',
      start: '2026-11-12T18:00:00+02:00',
      end: '2026-11-12T19:00:00+02:00',
      status: 'active',
      participants_count: 8,
      message_ro: 'Gata! Te așteptăm joi la 18:00 pe Teren baschet 2.',
      message_en: 'All set! See you Thursday at 18:00 on Teren baschet 2.',
    });
    expect(booking.qr_token).toMatch(new RegExp(`^${EXAMPLE_BOOKING.id}\\.${NONCE}\\.`));
    expect(sql(/FOR NO KEY UPDATE/)).toHaveLength(1);
    expect(sql(/INSERT INTO occupancy/)[0].params).toEqual([COURT.id, START, END, EXAMPLE_USERS.student.id, 8, null]);
    expect(sql(/INSERT INTO monthly_quota/)[0].params).toEqual([EXAMPLE_USERS.student.id, '2026-11-01']);
    expect(events.bookingCreated).toHaveBeenCalledWith(
      { id: EXAMPLE_BOOKING.id, userId: EXAMPLE_USERS.student.id, resourceId: COURT.id, start: START, end: END },
      new Date('2026-11-12T18:15:00+02:00'),
    );
  });

  it('teachers do not consume quota', async () => {
    const { service, sql } = setup();
    await service.create(TEST_USERS.teacher, CREATE, { now: NOW });
    expect(sql(/INSERT INTO monthly_quota/)).toHaveLength(0);
  });

  it('rejects slots off the grid and outside opening hours before touching the database', async () => {
    const { service, sql } = setup();
    await expect(service.create(TEST_USERS.student, { ...CREATE, start: '2026-11-12T18:30:00+02:00' }, { now: NOW })).rejects.toMatchObject({ code: 'INVALID_SLOT' });
    await expect(service.create(TEST_USERS.student, { ...CREATE, start: '2026-11-15T10:00:00+02:00' }, { now: NOW })).rejects.toMatchObject({ code: 'OUTSIDE_OPENING_HOURS' });
    expect(sql(/INSERT/)).toHaveLength(0);
  });

  it('validates capacity and sport', async () => {
    const { service } = setup();
    await expect(service.create(TEST_USERS.student, { ...CREATE, participants_count: 11 }, { now: NOW })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(service.create(TEST_USERS.student, { ...CREATE, sport_id: EXAMPLE_SPORTS.tennis.id }, { now: NOW })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('QUOTA_EXHAUSTED names the month', async () => {
    const { service } = setup({ quota: { used: 4, refunded: 0 } });
    await expect(service.create(TEST_USERS.student, CREATE, { now: NOW })).rejects.toMatchObject({
      code: 'QUOTA_EXHAUSTED',
      body: expect.objectContaining({ message_ro: expect.stringContaining('noiembrie'), message_en: expect.stringContaining('November') }),
    });
  });

  it('ACTIVE_LIMIT_REACHED', async () => {
    const { service } = setup({ active: 2 });
    await expect(service.create(TEST_USERS.student, CREATE, { now: NOW })).rejects.toMatchObject({ code: 'ACTIVE_LIMIT_REACHED' });
  });

  it('maps a no_overlap violation to 409 SLOT_TAKEN with the waitlist offer', async () => {
    const { service, state } = setup();
    state.insertError = new QueryFailedError('INSERT', [], Object.assign(new Error('no_overlap'), { code: '23P01' }));
    await expect(service.create(TEST_USERS.student, CREATE, { now: NOW })).rejects.toMatchObject({
      code: 'SLOT_TAKEN',
      body: expect.objectContaining({
        waitlist_offer: { resource_id: COURT.id, start: '2026-11-12T18:00:00+02:00', end: '2026-11-12T19:00:00+02:00' },
      }),
    });
  });

  it('replace_external is refused while FR-24 is off', async () => {
    const { service } = setup();
    await expect(service.create(TEST_USERS.student, { ...CREATE, replace_external: true }, { now: NOW })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('runs the inTransaction hook (waitlist acceptance)', async () => {
    const { service } = setup();
    const hook = jest.fn();
    await service.create(TEST_USERS.student, CREATE, { now: NOW, inTransaction: hook });
    expect(hook).toHaveBeenCalledWith(expect.anything(), EXAMPLE_BOOKING.id);
  });
});

describe('BookingsService.get', () => {
  it('holder gets the QR, admin sees without QR, others 404', async () => {
    const { service } = setup();
    expect((await service.get(TEST_USERS.student, EXAMPLE_BOOKING.id)).qr_token).toBeDefined();
    expect((await service.get(TEST_USERS.admin, EXAMPLE_BOOKING.id)).qr_token).toBeUndefined();
    await expect(service.get(TEST_USERS.teacher, EXAMPLE_BOOKING.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('BookingsService.cancel', () => {
  it('refunds when cancelled at least 2 h before and frees the slot', async () => {
    const { service, events, sql } = setup();
    const result = await service.cancel(TEST_USERS.student, EXAMPLE_BOOKING.id, NOW);
    expect(result.quota_refunded).toBe(true);
    expect(sql(/UPDATE occupancy SET status = 'cancelled'/)).toHaveLength(1);
    expect(events.bookingsCancelled).toHaveBeenCalledWith(
      [{ id: EXAMPLE_BOOKING.id, userId: EXAMPLE_USERS.student.id, resourceId: COURT.id, start: START, end: END }],
      { source: 'user' },
      true,
    );
  });

  it('UC-02: 1.5 h before -> cancelled, entry stays consumed', async () => {
    const { service, sql } = setup();
    const result = await service.cancel(TEST_USERS.student, EXAMPLE_BOOKING.id, new Date('2026-11-12T16:30:00+02:00'));
    expect(result.quota_refunded).toBe(false);
    expect(sql(/UPDATE monthly_quota SET refunded/)).toHaveLength(0);
  });

  it('409 once started or inactive, 404 for someone else', async () => {
    const started = setup();
    await expect(started.service.cancel(TEST_USERS.student, EXAMPLE_BOOKING.id, START)).rejects.toMatchObject({ code: 'BOOKING_NOT_CANCELLABLE' });
    const cancelled = setup({ row: bookingRow({ status: 'cancelled', cancel_source: 'user' }) });
    await expect(cancelled.service.cancel(TEST_USERS.student, EXAMPLE_BOOKING.id, NOW)).rejects.toMatchObject({ code: 'BOOKING_NOT_CANCELLABLE' });
    await expect(setup().service.cancel(TEST_USERS.teacher, EXAMPLE_BOOKING.id, NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('BookingsService.checkIn', () => {
  const inWindow = new Date('2026-11-12T17:55:00+02:00');

  it('button by the holder inside -10/+15 min', async () => {
    const { service, sql } = setup();
    const result = await service.checkIn(TEST_USERS.student, EXAMPLE_BOOKING.id, { method: 'button' }, inWindow);
    expect(result).toEqual({
      booking_id: EXAMPLE_BOOKING.id,
      checked_in_at: '2026-11-12T17:55:00+02:00',
      holder_name: 'Ion Popescu',
      category: 'member',
    });
    expect(sql(/SET checked_in_at/)).toHaveLength(1);
  });

  it('QR scanned by staff; externals are flagged', async () => {
    const { service, qr } = setup({ row: bookingRow({ holder_role: 'external', holder_name: 'Ana Rusu' }) });
    const token = qr.sign({ bookingId: EXAMPLE_BOOKING.id, nonce: NONCE, day: '2026-11-12' });
    const result = await service.checkIn(TEST_USERS.admin, EXAMPLE_BOOKING.id, { method: 'qr', qr_token: token }, inWindow);
    expect(result.category).toBe('external');
  });

  it('QR_INVALID for a forged, foreign or other-day code; FORBIDDEN for non-staff QR', async () => {
    const { service, qr } = setup();
    const otherDay = qr.sign({ bookingId: EXAMPLE_BOOKING.id, nonce: NONCE, day: '2026-11-11' });
    await expect(service.checkIn(TEST_USERS.admin, EXAMPLE_BOOKING.id, { method: 'qr', qr_token: otherDay }, inWindow)).rejects.toMatchObject({ code: 'QR_INVALID' });
    const wrongNonce = qr.sign({ bookingId: EXAMPLE_BOOKING.id, nonce: 'other', day: '2026-11-12' });
    await expect(service.checkIn(TEST_USERS.admin, EXAMPLE_BOOKING.id, { method: 'qr', qr_token: wrongNonce }, inWindow)).rejects.toMatchObject({ code: 'QR_INVALID' });
    await expect(service.checkIn(TEST_USERS.admin, EXAMPLE_BOOKING.id, { method: 'qr', qr_token: 'e3a94f60.a91c07d2.5f2b8c' }, inWindow)).rejects.toMatchObject({ code: 'QR_INVALID' });
    await expect(service.checkIn(TEST_USERS.student, EXAMPLE_BOOKING.id, { method: 'qr', qr_token: otherDay }, inWindow)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('CHECKIN_WINDOW_CLOSED before -10 min and after +15 min', async () => {
    const { service } = setup();
    await expect(service.checkIn(TEST_USERS.student, EXAMPLE_BOOKING.id, { method: 'button' }, new Date('2026-11-12T17:49:00+02:00'))).rejects.toMatchObject({ code: 'CHECKIN_WINDOW_CLOSED' });
    await expect(service.checkIn(TEST_USERS.student, EXAMPLE_BOOKING.id, { method: 'button' }, new Date('2026-11-12T18:16:00+02:00'))).rejects.toMatchObject({ code: 'CHECKIN_WINDOW_CLOSED' });
  });

  it('409 ALREADY_CHECKED_IN / BOOKING_NOT_ACTIVE; 404 for others', async () => {
    const done = setup({ row: bookingRow({ checked_in_at: inWindow }) });
    await expect(done.service.checkIn(TEST_USERS.student, EXAMPLE_BOOKING.id, { method: 'button' }, inWindow)).rejects.toMatchObject({ code: 'ALREADY_CHECKED_IN' });
    const cancelled = setup({ row: bookingRow({ status: 'cancelled' }) });
    await expect(cancelled.service.checkIn(TEST_USERS.student, EXAMPLE_BOOKING.id, { method: 'button' }, inWindow)).rejects.toMatchObject({ code: 'BOOKING_NOT_ACTIVE' });
    await expect(setup().service.checkIn(TEST_USERS.teacher, EXAMPLE_BOOKING.id, { method: 'button' }, inWindow)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('BookingsService.myQuota', () => {
  it('returns the Quota example for November', async () => {
    const { service } = setup({ quota: { used: 3, refunded: 1 } });
    expect(await service.myQuota(TEST_USERS.student, NOW)).toEqual({
      month: '2026-11-01',
      limit: 4,
      used: 3,
      refunded: 1,
      remaining: 2,
      over_quota_last_24h_only: false,
    });
  });
});
