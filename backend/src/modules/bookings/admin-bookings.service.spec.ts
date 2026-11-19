import { EXAMPLE_BOOKING, EXAMPLE_RESOURCES, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { TEST_CONFIG, TEST_USERS } from '../../testing/test-app';
import { QuotaService } from '../quota/quota.service';
import { AdminBookingsService } from './admin-bookings.service';
import type { BookingRow } from './booking.presenter';

const START = new Date(EXAMPLE_BOOKING.start);
const END = new Date(EXAMPLE_BOOKING.end);
const COURT = EXAMPLE_RESOURCES.basketballCourt;

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
    qr_nonce: 'a91c07d2-1111-4222-8333-444455556666',
    holder_name: 'Ion Popescu',
    holder_role: 'student',
    ...overrides,
  };
}

/** Scripted database: each SQL statement is answered by the first matching handler. */
function setup(options: { row?: BookingRow | null; refundable?: boolean; listed?: BookingRow[] } = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const handlers: [RegExp, (params: unknown[]) => unknown][] = [
    [/UPDATE monthly_quota SET refunded/, () => [options.refundable === false ? [] : [{}], 1]],
    [/^\s*SELECT o\.id, o\.resource_id/, () => options.listed ?? []],
    [/SELECT count\(\*\) AS n FROM occupancy o/, () => [{ n: String(options.listed?.length ?? 0) }]],
  ];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    const handler = handlers.find(([re]) => re.test(sql));
    return handler ? handler[1](params) : [];
  });
  const em = { query };
  const dataSource = { query, transaction: jest.fn(async (cb: (e: typeof em) => unknown) => cb(em)) };
  const current = options.row === undefined ? bookingRow() : options.row;
  const bookings = {
    loadRow: jest.fn(async () => current),
  };
  const audit = { record: jest.fn() };
  const events = { bookingsCancelled: jest.fn() };
  const service = new AdminBookingsService(
    dataSource as never,
    bookings as never,
    new QuotaService(dataSource as never),
    audit as never,
    events as never,
    TEST_CONFIG,
  );
  const sql = (re: RegExp) => calls.filter((c) => re.test(c.sql));
  return { service, bookings, audit, events, em, sql };
}

describe('AdminBookingsService.cancel', () => {
  const NOW = new Date('2026-11-12T17:30:00+02:00'); // 30 minutes before the start: too late for the holder

  it('cancels with the reason, always refunds, audits in the transaction and notifies the holder', async () => {
    const { service, bookings, audit, events, em, sql } = setup();
    const cancelled = bookingRow({
      status: 'cancelled',
      cancel_source: 'admin',
      reason: 'Teren indisponibil',
    });
    bookings.loadRow.mockResolvedValueOnce(bookingRow()).mockResolvedValueOnce(cancelled);

    const result = await service.cancel(TEST_USERS.admin, EXAMPLE_BOOKING.id, 'Teren indisponibil', NOW);

    expect(result).toEqual({
      booking: expect.objectContaining({
        id: EXAMPLE_BOOKING.id,
        status: 'cancelled',
        cancel_source: 'admin',
        cancel_reason: 'Teren indisponibil',
      }),
      quota_refunded: true,
    });
    expect(result.booking.qr_token).toBeUndefined();
    expect(bookings.loadRow).toHaveBeenNthCalledWith(1, EXAMPLE_BOOKING.id, em, true);
    expect(sql(/UPDATE occupancy SET status = 'cancelled', cancel_source = 'admin'/)[0].params).toEqual([
      EXAMPLE_BOOKING.id,
      'Teren indisponibil',
    ]);
    expect(sql(/UPDATE monthly_quota/)[0].params).toEqual([EXAMPLE_USERS.student.id, '2026-11-01']);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: TEST_USERS.admin.id,
        action: 'booking.cancel',
        entity: 'occupancy',
        entityId: EXAMPLE_BOOKING.id,
        before: { status: 'active' },
        after: expect.objectContaining({ reason: 'Teren indisponibil', quota_refunded: true }),
      }),
      em,
    );
    expect(events.bookingsCancelled).toHaveBeenCalledWith(
      [
        {
          id: EXAMPLE_BOOKING.id,
          userId: EXAMPLE_USERS.student.id,
          resourceId: COURT.id,
          start: START,
          end: END,
        },
      ],
      { source: 'admin', reason: 'Teren indisponibil' },
      true,
    );
  });

  it('teachers and externals have no quota to refund', async () => {
    const { service, bookings, sql } = setup();
    const row = bookingRow({ user_id: EXAMPLE_USERS.teacher.id, holder_role: 'teacher' });
    bookings.loadRow.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, status: 'cancelled' });
    const result = await service.cancel(TEST_USERS.admin, EXAMPLE_BOOKING.id, 'x', NOW);
    expect(result.quota_refunded).toBe(false);
    expect(sql(/monthly_quota/)).toHaveLength(0);
  });

  it('an ongoing booking can be cancelled; an ended one does not free its slot', async () => {
    const { service, bookings, events } = setup();
    const row = bookingRow();
    bookings.loadRow.mockResolvedValueOnce(row).mockResolvedValueOnce({ ...row, status: 'cancelled' });
    await service.cancel(TEST_USERS.admin, EXAMPLE_BOOKING.id, 'x', new Date('2026-11-12T19:30:00+02:00'));
    expect(events.bookingsCancelled.mock.calls[0][2]).toBe(false);
  });

  it('409 BOOKING_NOT_ACTIVE without changing anything', async () => {
    const { service, audit, events, sql } = setup({ row: bookingRow({ status: 'completed' }) });
    await expect(service.cancel(TEST_USERS.admin, EXAMPLE_BOOKING.id, 'x', NOW)).rejects.toMatchObject({
      code: 'BOOKING_NOT_ACTIVE',
    });
    expect(sql(/UPDATE/)).toHaveLength(0);
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.bookingsCancelled).not.toHaveBeenCalled();
  });

  it('404 for an unknown booking', async () => {
    const { service } = setup({ row: null });
    await expect(service.cancel(TEST_USERS.admin, EXAMPLE_BOOKING.id, 'x', NOW)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('AdminBookingsService.list', () => {
  it('filters by resource, start day (facility time zone) and status, in time order for a day', async () => {
    const { service, sql } = setup({ listed: [bookingRow()] });
    const page = await service.list({
      resource: COURT.id,
      date: '2026-11-12',
      status: 'active',
      page: 2,
      page_size: 10,
    });
    expect(page).toEqual({
      page: 2,
      page_size: 10,
      total: 1,
      items: [
        expect.objectContaining({
          id: EXAMPLE_BOOKING.id,
          start: EXAMPLE_BOOKING.start,
          resource_name: COURT.name,
        }),
      ],
    });
    const [select] = sql(/^\s*SELECT o\.id/);
    expect(select.sql).toMatch(
      /o\.resource_id = \$1 AND lower\(o\.period\) >= \$2 AND lower\(o\.period\) < \$3 AND o\.status = \$4/,
    );
    expect(select.sql).toMatch(/ORDER BY lower\(o\.period\) ASC/);
    expect(select.params).toEqual([
      COURT.id,
      new Date('2026-11-11T22:00:00Z'),
      new Date('2026-11-12T22:00:00Z'),
      'active',
      10,
      10,
    ]);
    expect(sql(/SELECT count/)[0].params).toEqual(select.params.slice(0, 4));
  });

  it('without filters: all bookings, newest first', async () => {
    const { service, sql } = setup();
    await service.list({ page: 1, page_size: 20 });
    const [select] = sql(/^\s*SELECT o\.id/);
    expect(select.sql).toMatch(/WHERE o\.kind = 'booking' ORDER BY lower\(o\.period\) DESC/);
    expect(select.params).toEqual([20, 0]);
  });
});
