import { AppException } from '../../common/errors/app.exception';
import { EXAMPLE_BOOKING, EXAMPLE_SPORTS } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';

/** `WaitlistJoin` example: slot entry. */
const JOIN_SLOT = {
  day: '2026-11-12',
  resource_id: EXAMPLE_BOOKING.resource_id,
  start: '2026-11-12T18:00:00+02:00',
  end: '2026-11-12T19:00:00+02:00',
};
/** "fotbal, joi" subscription. */
const JOIN_SPORT = { day: '2026-11-12', sport_id: EXAMPLE_SPORTS.football.id };
const ENTRY_ID = 'c0ffee00-1234-4abc-8def-001122334455';
const ENTRY = {
  id: ENTRY_ID,
  day: '2026-11-12',
  resource_id: JOIN_SLOT.resource_id,
  sport_id: null,
  start: JOIN_SLOT.start,
  end: JOIN_SLOT.end,
  priority: 2,
  status: 'waiting',
  offered_at: null,
  offer_expires_at: null,
};

describe('WaitlistController', () => {
  let t: TestApp;
  const waitlist = { join: jest.fn(), listMine: jest.fn(), leave: jest.fn(), accept: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [WaitlistController],
      providers: [{ provide: WaitlistService, useValue: waitlist }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('POST /waitlist', () => {
    it('201 WaitlistEntry for a slot', async () => {
      waitlist.join.mockResolvedValue(ENTRY);
      const res = await t
        .http()
        .post('/api/v1/waitlist')
        .set('Authorization', await t.bearer('student'))
        .send(JOIN_SLOT)
        .expect(201);
      expect(res.body).toEqual(ENTRY);
      expect(waitlist.join).toHaveBeenCalledWith(TEST_USERS.student, JOIN_SLOT);
    });

    it('201 for a day + sport subscription', async () => {
      waitlist.join.mockResolvedValue({
        ...ENTRY,
        resource_id: null,
        sport_id: JOIN_SPORT.sport_id,
        start: null,
        end: null,
        priority: 1,
      });
      const res = await t
        .http()
        .post('/api/v1/waitlist')
        .set('Authorization', await t.bearer('teacher'))
        .send(JOIN_SPORT)
        .expect(201);
      expect(res.body.priority).toBe(1);
    });

    it('409 ALREADY_ON_WAITLIST', async () => {
      waitlist.join.mockRejectedValue(new AppException('ALREADY_ON_WAITLIST'));
      const res = await t
        .http()
        .post('/api/v1/waitlist')
        .set('Authorization', await t.bearer('student'))
        .send(JOIN_SLOT)
        .expect(409);
      expect(res.body.code).toBe('ALREADY_ON_WAITLIST');
    });

    it('422 without day or with a malformed date; 403 for admins', async () => {
      const auth = await t.bearer('student');
      await t
        .http()
        .post('/api/v1/waitlist')
        .set('Authorization', auth)
        .send({ sport_id: JOIN_SPORT.sport_id })
        .expect(422);
      await t
        .http()
        .post('/api/v1/waitlist')
        .set('Authorization', auth)
        .send({ ...JOIN_SLOT, start: 'joi' })
        .expect(422);
      waitlist.join.mockRejectedValue(new AppException('FORBIDDEN'));
      await t
        .http()
        .post('/api/v1/waitlist')
        .set('Authorization', await t.bearer('admin'))
        .send(JOIN_SLOT)
        .expect(403);
    });

    it('401 anonymously', async () => {
      await t.http().post('/api/v1/waitlist').send(JOIN_SLOT).expect(401);
    });
  });

  describe('GET /me/waitlist', () => {
    it('200 entries, including a pending offer', async () => {
      const offered = {
        ...ENTRY,
        status: 'offered',
        offered_at: '2026-11-12T16:00:00+02:00',
        offer_expires_at: '2026-11-12T16:10:00+02:00',
        offered_slot: { resource_id: JOIN_SLOT.resource_id, start: JOIN_SLOT.start, end: JOIN_SLOT.end },
      };
      waitlist.listMine.mockResolvedValue([offered]);
      const res = await t
        .http()
        .get('/api/v1/me/waitlist')
        .set('Authorization', await t.bearer('student'))
        .expect(200);
      expect(res.body).toEqual([offered]);
    });

    it('401 anonymously', async () => {
      await t.http().get('/api/v1/me/waitlist').expect(401);
    });
  });

  describe('DELETE /waitlist/{id}', () => {
    it('204', async () => {
      waitlist.leave.mockResolvedValue(undefined);
      await t
        .http()
        .delete(`/api/v1/waitlist/${ENTRY_ID}`)
        .set('Authorization', await t.bearer('student'))
        .expect(204);
      expect(waitlist.leave).toHaveBeenCalledWith(TEST_USERS.student, ENTRY_ID);
    });

    it('404 for someone else’s entry', async () => {
      waitlist.leave.mockRejectedValue(new AppException('NOT_FOUND'));
      await t
        .http()
        .delete(`/api/v1/waitlist/${ENTRY_ID}`)
        .set('Authorization', await t.bearer('teacher'))
        .expect(404);
    });
  });

  describe('POST /waitlist/{id}/accept', () => {
    it('201 Booking when the spot is obtained', async () => {
      waitlist.accept.mockResolvedValue(EXAMPLE_BOOKING);
      const res = await t
        .http()
        .post(`/api/v1/waitlist/${ENTRY_ID}/accept`)
        .set('Authorization', await t.bearer('student'))
        .expect(201);
      expect(res.body).toEqual(EXAMPLE_BOOKING);
    });

    it.each([
      ['OFFER_TAKEN', 409],
      ['OFFER_EXPIRED', 410],
      ['ACTIVE_LIMIT_REACHED', 422],
      ['NOT_FOUND', 404],
    ] as const)('%s -> %i', async (code, status) => {
      waitlist.accept.mockRejectedValue(new AppException(code));
      const res = await t
        .http()
        .post(`/api/v1/waitlist/${ENTRY_ID}/accept`)
        .set('Authorization', await t.bearer('student'))
        .expect(status);
      expect(res.body.code).toBe(code);
    });
  });
});
