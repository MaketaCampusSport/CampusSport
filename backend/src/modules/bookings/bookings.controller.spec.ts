import { AppException } from '../../common/errors/app.exception';
import { EXAMPLE_BOOKING } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import {
  AdminBookingsController,
  BookingsController,
  MyBookingsController,
  PublicBookingLinksController,
} from './bookings.controller';
import { BookingsService } from './bookings.service';

const ID = EXAMPLE_BOOKING.id;
/** `BookingCreate` example. */
const CREATE = {
  resource_id: EXAMPLE_BOOKING.resource_id,
  start: '2026-11-12T18:00:00+02:00',
  participants_count: 8,
};
/** `Booking` example (success screen). */
const BOOKING = {
  ...EXAMPLE_BOOKING,
  qr_token: 'e3a94f60.a91c07d2.5f2b8c',
  message_ro: 'Gata! Te așteptăm joi la 18:00 pe Teren baschet 2.',
  message_en: 'All set! See you Thursday at 18:00 on Teren baschet 2.',
};
const WAITLIST_OFFER = {
  resource_id: CREATE.resource_id,
  start: '2026-11-12T18:00:00+02:00',
  end: '2026-11-12T19:00:00+02:00',
};

describe('Bookings controllers', () => {
  let t: TestApp;
  const bookings = {
    create: jest.fn(),
    get: jest.fn(),
    cancel: jest.fn(),
    checkIn: jest.fn(),
    listMine: jest.fn(),
    myQuota: jest.fn(),
  };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [
        BookingsController,
        PublicBookingLinksController,
        MyBookingsController,
        AdminBookingsController,
      ],
      providers: [{ provide: BookingsService, useValue: bookings }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('POST /bookings', () => {
    it('201 Booking with Location, QR and confirmation message', async () => {
      bookings.create.mockResolvedValue(BOOKING);
      const res = await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', await t.bearer('student'))
        .send(CREATE)
        .expect(201);
      expect(res.body).toEqual(BOOKING);
      expect(res.headers.location).toBe(`/api/v1/bookings/${ID}`);
      expect(bookings.create).toHaveBeenCalledWith(TEST_USERS.student, CREATE);
    });

    it('409 SLOT_TAKEN with the waitlist offer', async () => {
      bookings.create.mockRejectedValue(
        new AppException('SLOT_TAKEN', { extra: { waitlist_offer: WAITLIST_OFFER } }),
      );
      const res = await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', await t.bearer('teacher'))
        .send(CREATE)
        .expect(409);
      expect(res.body).toEqual({
        code: 'SLOT_TAKEN',
        message_ro: 'Slot ocupat. Vrei să intri pe lista de așteptare?',
        message_en: 'Slot taken. Would you like to join the waiting list?',
        waitlist_offer: WAITLIST_OFFER,
      });
    });

    it.each([
      ['QUOTA_EXHAUSTED'],
      ['ACTIVE_LIMIT_REACHED'],
      ['WINDOW_EXCEEDED'],
      ['EXTERNAL_ACCESS_DENIED'],
      ['OUTSIDE_OPENING_HOURS'],
      ['INVALID_SLOT'],
      ['RESOURCE_INACTIVE'],
    ] as const)('422 %s', async (code) => {
      bookings.create.mockRejectedValue(new AppException(code));
      const res = await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', await t.bearer('student'))
        .send(CREATE)
        .expect(422);
      expect(res.body.code).toBe(code);
    });

    it('403 ACCOUNT_SUSPENDED', async () => {
      bookings.create.mockRejectedValue(new AppException('ACCOUNT_SUSPENDED'));
      const res = await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', await t.bearer('suspended'))
        .send(CREATE)
        .expect(403);
      expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
    });

    it('422 VALIDATION_FAILED for a malformed body', async () => {
      // The student already used its 10 bookings/minute in this suite; the limit is per user.
      const auth = await t.bearer('teacher');
      await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', auth)
        .send({ start: CREATE.start })
        .expect(422);
      await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', auth)
        .send({ ...CREATE, start: 'joi 18:00' })
        .expect(422);
      await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', auth)
        .send({ ...CREATE, participants_count: 0 })
        .expect(422);
      expect(bookings.create).not.toHaveBeenCalled();
    });

    it('401 anonymously', async () => {
      await t.http().post('/api/v1/bookings').send(CREATE).expect(401);
    });

    it('429 RATE_LIMITED after 10 bookings per minute per user', async () => {
      bookings.create.mockResolvedValue(BOOKING);
      const auth = await t.bearer('external');
      for (let i = 0; i < 10; i++)
        await t.http().post('/api/v1/bookings').set('Authorization', auth).send(CREATE).expect(201);
      const res = await t.http().post('/api/v1/bookings').set('Authorization', auth).send(CREATE).expect(429);
      expect(res.body.code).toBe('RATE_LIMITED');
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('GET /bookings/{id}', () => {
    it('200 for the holder', async () => {
      bookings.get.mockResolvedValue(BOOKING);
      const res = await t
        .http()
        .get(`/api/v1/bookings/${ID}`)
        .set('Authorization', await t.bearer('student'))
        .expect(200);
      expect(res.body.qr_token).toBe(BOOKING.qr_token);
      expect(bookings.get).toHaveBeenCalledWith(TEST_USERS.student, ID);
    });

    it('404 for someone else or an unknown id', async () => {
      bookings.get.mockRejectedValue(new AppException('NOT_FOUND'));
      await t
        .http()
        .get(`/api/v1/bookings/${ID}`)
        .set('Authorization', await t.bearer('teacher'))
        .expect(404);
      await t
        .http()
        .get('/api/v1/bookings/123')
        .set('Authorization', await t.bearer('teacher'))
        .expect(404);
    });
  });

  describe('DELETE /bookings/{id}', () => {
    it('200 CancellationResult (refunded when cancelled in time)', async () => {
      const result = {
        booking: { ...EXAMPLE_BOOKING, status: 'cancelled', cancel_source: 'user', cancel_reason: null },
        quota_refunded: true,
      };
      bookings.cancel.mockResolvedValue(result);
      const res = await t
        .http()
        .delete(`/api/v1/bookings/${ID}`)
        .set('Authorization', await t.bearer('student'))
        .expect(200);
      expect(res.body).toEqual(result);
    });

    it('409 BOOKING_NOT_CANCELLABLE, 404 not found', async () => {
      const auth = await t.bearer('student');
      bookings.cancel.mockRejectedValueOnce(new AppException('BOOKING_NOT_CANCELLABLE'));
      await t.http().delete(`/api/v1/bookings/${ID}`).set('Authorization', auth).expect(409);
      bookings.cancel.mockRejectedValueOnce(new AppException('NOT_FOUND'));
      await t.http().delete(`/api/v1/bookings/${ID}`).set('Authorization', auth).expect(404);
    });
  });

  describe('POST /bookings/{id}/check-in', () => {
    const result = {
      booking_id: ID,
      checked_in_at: '2026-11-12T17:55:00+02:00',
      holder_name: 'Ion Popescu',
      category: 'member',
    };

    it('200 by button (holder)', async () => {
      bookings.checkIn.mockResolvedValue(result);
      const res = await t
        .http()
        .post(`/api/v1/bookings/${ID}/check-in`)
        .set('Authorization', await t.bearer('student'))
        .send({ method: 'button' })
        .expect(200);
      expect(res.body).toEqual(result);
    });

    it('200 by QR (staff)', async () => {
      bookings.checkIn.mockResolvedValue(result);
      await t
        .http()
        .post(`/api/v1/bookings/${ID}/check-in`)
        .set('Authorization', await t.bearer('admin'))
        .send({ method: 'qr', qr_token: BOOKING.qr_token })
        .expect(200);
      expect(bookings.checkIn).toHaveBeenCalledWith(TEST_USERS.admin, ID, {
        method: 'qr',
        qr_token: BOOKING.qr_token,
      });
    });

    it('422 when method=qr has no token or the method is unknown', async () => {
      const auth = await t.bearer('admin');
      await t
        .http()
        .post(`/api/v1/bookings/${ID}/check-in`)
        .set('Authorization', auth)
        .send({ method: 'qr' })
        .expect(422);
      await t
        .http()
        .post(`/api/v1/bookings/${ID}/check-in`)
        .set('Authorization', auth)
        .send({ method: 'nfc' })
        .expect(422);
    });

    it.each([
      ['QR_INVALID', 422],
      ['CHECKIN_WINDOW_CLOSED', 422],
      ['ALREADY_CHECKED_IN', 409],
      ['BOOKING_NOT_ACTIVE', 409],
    ] as const)('%s -> %i', async (code, status) => {
      bookings.checkIn.mockRejectedValue(new AppException(code));
      const res = await t
        .http()
        .post(`/api/v1/bookings/${ID}/check-in`)
        .set('Authorization', await t.bearer('student'))
        .send({ method: 'button' })
        .expect(status);
      expect(res.body.code).toBe(code);
    });
  });

  describe('stubbed booking routes (501)', () => {
    it('GET /bookings/{id}/calendar.ics', async () => {
      await t
        .http()
        .get(`/api/v1/bookings/${ID}/calendar.ics`)
        .set('Authorization', await t.bearer('student'))
        .expect(501);
    });
    it('POST /bookings/{id}/invitations', async () => {
      await t
        .http()
        .post(`/api/v1/bookings/${ID}/invitations`)
        .set('Authorization', await t.bearer('student'))
        .expect(501);
    });
    it('GET /invitations/{token} is public', async () => {
      await t.http().get('/api/v1/invitations/9fK2xQ').expect(501);
    });
    it('GET /calendar/{token}.ics is public', async () => {
      await t.http().get('/api/v1/calendar/b81f0c7e.ics').expect(501);
    });
    it('GET /me/calendar-feed needs a user', async () => {
      await t.http().get('/api/v1/me/calendar-feed').expect(401);
      await t
        .http()
        .get('/api/v1/me/calendar-feed')
        .set('Authorization', await t.bearer('student'))
        .expect(501);
    });
    it('admin routes need the admin role', async () => {
      const admin = await t.bearer('admin');
      await t.http().get('/api/v1/admin/bookings').set('Authorization', admin).expect(501);
      await t
        .http()
        .patch(`/api/v1/admin/bookings/${ID}`)
        .set('Authorization', admin)
        .send({ start: CREATE.start, reason: 'x' })
        .expect(501);
      await t
        .http()
        .post(`/api/v1/admin/bookings/${ID}/cancel`)
        .set('Authorization', admin)
        .send({ reason: 'Teren indisponibil' })
        .expect(501);
      await t
        .http()
        .get('/api/v1/admin/bookings')
        .set('Authorization', await t.bearer('student'))
        .expect(403);
    });
  });

  describe('GET /me/bookings', () => {
    it('200 page, scope=history passed through', async () => {
      bookings.listMine.mockResolvedValue({ page: 1, page_size: 20, total: 1, items: [EXAMPLE_BOOKING] });
      const res = await t
        .http()
        .get('/api/v1/me/bookings?scope=history')
        .set('Authorization', await t.bearer('student'))
        .expect(200);
      expect(res.body.items).toEqual([EXAMPLE_BOOKING]);
      expect(bookings.listMine).toHaveBeenCalledWith(
        TEST_USERS.student,
        expect.objectContaining({ scope: 'history', page: 1 }),
      );
    });

    it('defaults to upcoming; 422 for an unknown scope; 401 anonymously', async () => {
      bookings.listMine.mockResolvedValue({ page: 1, page_size: 20, total: 0, items: [] });
      const auth = await t.bearer('teacher');
      await t.http().get('/api/v1/me/bookings').set('Authorization', auth).expect(200);
      expect(bookings.listMine.mock.calls[0][1].scope).toBe('upcoming');
      await t.http().get('/api/v1/me/bookings?scope=all').set('Authorization', auth).expect(422);
      await t.http().get('/api/v1/me/bookings').expect(401);
    });
  });

  describe('GET /me/quota', () => {
    it('200 Quota for students (spec example)', async () => {
      const quota = {
        month: '2026-11-01',
        limit: 4,
        used: 3,
        refunded: 1,
        remaining: 2,
        over_quota_last_24h_only: false,
      };
      bookings.myQuota.mockResolvedValue(quota);
      await t
        .http()
        .get('/api/v1/me/quota')
        .set('Authorization', await t.bearer('student'))
        .expect(200, quota);
    });

    it('403 for other roles', async () => {
      await t
        .http()
        .get('/api/v1/me/quota')
        .set('Authorization', await t.bearer('teacher'))
        .expect(403);
    });
  });
});
