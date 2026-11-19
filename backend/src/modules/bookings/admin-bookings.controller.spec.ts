import { AppException } from '../../common/errors/app.exception';
import { EXAMPLE_BOOKING, EXAMPLE_RESOURCES } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { AdminBookingsService } from './admin-bookings.service';
import { AdminBookingsController } from './bookings.controller';

const ID = EXAMPLE_BOOKING.id;
const COURT = EXAMPLE_RESOURCES.basketballCourt.id;

describe('AdminBookingsController', () => {
  let t: TestApp;
  const adminBookings = { list: jest.fn(), cancel: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [AdminBookingsController],
      providers: [{ provide: AdminBookingsService, useValue: adminBookings }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /admin/bookings', () => {
    it('200 page of Booking with the filters passed through', async () => {
      const page = { page: 2, page_size: 10, total: 11, items: [EXAMPLE_BOOKING] };
      adminBookings.list.mockResolvedValue(page);
      const res = await t
        .http()
        .get(`/api/v1/admin/bookings?resource=${COURT}&date=2026-11-12&status=active&page=2&page_size=10`)
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(res.body).toEqual(page);
      expect(adminBookings.list).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: COURT,
          date: '2026-11-12',
          status: 'active',
          page: 2,
          page_size: 10,
        }),
      );
    });

    it('defaults to page 1 of 20', async () => {
      adminBookings.list.mockResolvedValue({ page: 1, page_size: 20, total: 0, items: [] });
      await t
        .http()
        .get('/api/v1/admin/bookings')
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(adminBookings.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, page_size: 20 }));
    });

    it('422 for malformed filters', async () => {
      const auth = await t.bearer('admin');
      await t.http().get('/api/v1/admin/bookings?resource=abc').set('Authorization', auth).expect(422);
      await t.http().get('/api/v1/admin/bookings?date=12.11.2026').set('Authorization', auth).expect(422);
      await t.http().get('/api/v1/admin/bookings?status=pending').set('Authorization', auth).expect(422);
      await t.http().get('/api/v1/admin/bookings?page_size=500').set('Authorization', auth).expect(422);
      expect(adminBookings.list).not.toHaveBeenCalled();
    });

    it('403 for students, 401 anonymously', async () => {
      await t
        .http()
        .get('/api/v1/admin/bookings')
        .set('Authorization', await t.bearer('student'))
        .expect(403);
      await t.http().get('/api/v1/admin/bookings').expect(401);
    });
  });

  describe('POST /admin/bookings/{id}/cancel', () => {
    const body = { reason: 'Teren indisponibil' };

    it('200 CancellationResult', async () => {
      const result = {
        booking: {
          ...EXAMPLE_BOOKING,
          status: 'cancelled',
          cancel_source: 'admin',
          cancel_reason: 'Teren indisponibil',
        },
        quota_refunded: true,
      };
      adminBookings.cancel.mockResolvedValue(result);
      const res = await t
        .http()
        .post(`/api/v1/admin/bookings/${ID}/cancel`)
        .set('Authorization', await t.bearer('admin'))
        .send(body)
        .expect(200);
      expect(res.body).toEqual(result);
      expect(adminBookings.cancel).toHaveBeenCalledWith(TEST_USERS.admin, ID, 'Teren indisponibil');
    });

    it('422 without a reason', async () => {
      const auth = await t.bearer('admin');
      await t
        .http()
        .post(`/api/v1/admin/bookings/${ID}/cancel`)
        .set('Authorization', auth)
        .send({})
        .expect(422);
      await t
        .http()
        .post(`/api/v1/admin/bookings/${ID}/cancel`)
        .set('Authorization', auth)
        .send({ reason: '   ' })
        .expect(422);
      expect(adminBookings.cancel).not.toHaveBeenCalled();
    });

    it('409 BOOKING_NOT_ACTIVE, 404 for an unknown or malformed id', async () => {
      const auth = await t.bearer('admin');
      adminBookings.cancel.mockRejectedValueOnce(new AppException('BOOKING_NOT_ACTIVE'));
      const conflict = await t
        .http()
        .post(`/api/v1/admin/bookings/${ID}/cancel`)
        .set('Authorization', auth)
        .send(body)
        .expect(409);
      expect(conflict.body.code).toBe('BOOKING_NOT_ACTIVE');
      adminBookings.cancel.mockRejectedValueOnce(new AppException('NOT_FOUND'));
      await t
        .http()
        .post(`/api/v1/admin/bookings/${ID}/cancel`)
        .set('Authorization', auth)
        .send(body)
        .expect(404);
      await t
        .http()
        .post('/api/v1/admin/bookings/123/cancel')
        .set('Authorization', auth)
        .send(body)
        .expect(404);
      expect(adminBookings.cancel).toHaveBeenCalledTimes(2);
    });

    it('403 for teachers, 401 anonymously', async () => {
      await t
        .http()
        .post(`/api/v1/admin/bookings/${ID}/cancel`)
        .set('Authorization', await t.bearer('teacher'))
        .send(body)
        .expect(403);
      await t.http().post(`/api/v1/admin/bookings/${ID}/cancel`).send(body).expect(401);
    });
  });

  describe('PATCH /admin/bookings/{id}', () => {
    it('is still a stub (501) for admins, 403 for others', async () => {
      const body = { start: '2026-11-12T19:00:00+02:00', reason: 'Schimbare de program' };
      await t
        .http()
        .patch(`/api/v1/admin/bookings/${ID}`)
        .set('Authorization', await t.bearer('admin'))
        .send(body)
        .expect(501);
      await t
        .http()
        .patch(`/api/v1/admin/bookings/${ID}`)
        .set('Authorization', await t.bearer('student'))
        .send(body)
        .expect(403);
    });
  });
});
