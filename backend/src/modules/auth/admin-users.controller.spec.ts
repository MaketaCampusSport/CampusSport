import { AppException } from '../../common/errors/app.exception';
import { createTestApp, TEST_CONFIG, TEST_USERS, TestApp } from '../../testing/test-app';
import { userEntity } from '../../testing/fixtures';
import { OccupancyEventsService } from '../events/occupancy-events.service';
import { AdminUsersController } from './admin-users.controller';
import { AvatarsService } from './avatars.service';
import { toUserResponse } from './dto/user.dto';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

const STUDENT_ID = '3c7d1e94-52af-4b08-9e61-a8f02d6b7c15';
/** `suspendUser` example body. */
const SUSPEND = { until: '2026-11-26T00:00:00+02:00', reason: 'No-show-uri repetate' };
/** `UserCreate` example body. */
const CREATE = {
  full_name: 'Elena Munteanu',
  email: 'elena.munteanu@example.edu',
  role: 'teacher',
  password: 'parola123',
};
/** Smallest valid PNG signature + padding; the controller only forwards the bytes. */
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

describe('AdminUsersController', () => {
  let t: TestApp;
  const users = {
    list: jest.fn(),
    suspend: jest.fn(),
    reactivate: jest.fn(),
    createByAdmin: jest.fn(),
    updateByAdmin: jest.fn(),
    deleteByAdmin: jest.fn(),
  };
  const sessions = { revokeAll: jest.fn() };
  const avatars = { set: jest.fn(), remove: jest.fn() };
  const events = { bookingsCancelled: jest.fn() };
  const zone = TEST_CONFIG.facilityTimezone;

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [AdminUsersController],
      providers: [
        { provide: UsersService, useValue: users },
        { provide: SessionsService, useValue: sessions },
        { provide: AvatarsService, useValue: avatars },
        { provide: OccupancyEventsService, useValue: events },
      ],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /admin/users', () => {
    it('200 page of users with filters', async () => {
      users.list.mockResolvedValue({
        page: 1,
        page_size: 20,
        total: 1,
        items: [toUserResponse(userEntity('student'), zone)],
      });
      const res = await t
        .http()
        .get('/api/v1/admin/users?q=popescu&role=student&status=active')
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(res.body).toMatchObject({
        page: 1,
        page_size: 20,
        total: 1,
        items: [{ full_name: 'Ion Popescu' }],
      });
      expect(users.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'popescu', role: 'student', status: 'active', page: 1, page_size: 20 }),
      );
    });

    it('422 for an unknown role filter', async () => {
      await t
        .http()
        .get('/api/v1/admin/users?role=coach')
        .set('Authorization', await t.bearer('admin'))
        .expect(422);
    });

    it('403 for a student, 401 anonymously', async () => {
      await t
        .http()
        .get('/api/v1/admin/users')
        .set('Authorization', await t.bearer('student'))
        .expect(403);
      await t.http().get('/api/v1/admin/users').expect(401);
    });
  });

  describe('POST /admin/users', () => {
    it('201 created user', async () => {
      users.createByAdmin.mockResolvedValue(toUserResponse(userEntity('teacher'), zone));
      const res = await t
        .http()
        .post('/api/v1/admin/users')
        .set('Authorization', await t.bearer('admin'))
        .send({ ...CREATE, email: ' Elena.Munteanu@Example.edu ', phone: '' })
        .expect(201);
      expect(res.body).toMatchObject({ role: 'teacher', avatar_url: null });
      expect(users.createByAdmin).toHaveBeenCalledWith(
        expect.objectContaining({ id: TEST_USERS.admin.id }),
        expect.objectContaining({ email: 'elena.munteanu@example.edu', phone: null, role: 'teacher' }),
      );
    });

    it('422 for a short password, an unknown role or a non-E.164 phone', async () => {
      const admin = await t.bearer('admin');
      for (const bad of [{ password: 'short' }, { role: 'staff' }, { phone: '060000001' }]) {
        await t
          .http()
          .post('/api/v1/admin/users')
          .set('Authorization', admin)
          .send({ ...CREATE, ...bad })
          .expect(422);
      }
      expect(users.createByAdmin).not.toHaveBeenCalled();
    });

    it('409 EMAIL_ALREADY_USED, 403 for non-admins', async () => {
      users.createByAdmin.mockRejectedValue(new AppException('EMAIL_ALREADY_USED'));
      await t
        .http()
        .post('/api/v1/admin/users')
        .set('Authorization', await t.bearer('admin'))
        .send(CREATE)
        .expect(409);
      await t
        .http()
        .post('/api/v1/admin/users')
        .set('Authorization', await t.bearer('teacher'))
        .send(CREATE)
        .expect(403);
    });
  });

  describe('PATCH /admin/users/{id}', () => {
    it('200, ends the sessions when the service asks for it', async () => {
      users.updateByAdmin.mockResolvedValue({
        user: toUserResponse(userEntity('student', { role: 'teacher' }), zone),
        signOut: true,
      });
      const res = await t
        .http()
        .patch(`/api/v1/admin/users/${STUDENT_ID}`)
        .set('Authorization', await t.bearer('admin'))
        .send({ role: 'teacher', password: 'parola-noua' })
        .expect(200);
      expect(res.body.role).toBe('teacher');
      expect(users.updateByAdmin).toHaveBeenCalledWith(expect.anything(), STUDENT_ID, {
        role: 'teacher',
        password: 'parola-noua',
      });
      expect(sessions.revokeAll).toHaveBeenCalledWith(STUDENT_ID);
    });

    it('keeps the sessions for a name change; phone null clears it', async () => {
      users.updateByAdmin.mockResolvedValue({
        user: toUserResponse(userEntity('student'), zone),
        signOut: false,
      });
      await t
        .http()
        .patch(`/api/v1/admin/users/${STUDENT_ID}`)
        .set('Authorization', await t.bearer('admin'))
        .send({ full_name: 'Ion Popescu', phone: null })
        .expect(200);
      expect(users.updateByAdmin.mock.calls[0][2]).toEqual({ full_name: 'Ion Popescu', phone: null });
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it('403 FORBIDDEN when the service refuses (own admin role), 404 for a bad id', async () => {
      users.updateByAdmin.mockRejectedValue(new AppException('FORBIDDEN'));
      const admin = await t.bearer('admin');
      await t
        .http()
        .patch(`/api/v1/admin/users/${TEST_USERS.admin.id}`)
        .set('Authorization', admin)
        .send({ role: 'teacher' })
        .expect(403);
      await t.http().patch('/api/v1/admin/users/nope').set('Authorization', admin).send({}).expect(404);
    });
  });

  describe('DELETE /admin/users/{id}', () => {
    it('204, revokes the sessions and frees the cancelled slots', async () => {
      const cancelled = [{ id: 'x', userId: null, resourceId: 'r', start: new Date(), end: new Date() }];
      users.deleteByAdmin.mockResolvedValue(cancelled);
      await t
        .http()
        .delete(`/api/v1/admin/users/${STUDENT_ID}`)
        .set('Authorization', await t.bearer('admin'))
        .expect(204);
      expect(sessions.revokeAll).toHaveBeenCalledWith(STUDENT_ID);
      expect(events.bookingsCancelled).toHaveBeenCalledWith(cancelled, { source: 'admin' }, true);
    });

    it('409 USER_HAS_HISTORY', async () => {
      users.deleteByAdmin.mockRejectedValue(new AppException('USER_HAS_HISTORY'));
      const res = await t
        .http()
        .delete(`/api/v1/admin/users/${STUDENT_ID}`)
        .set('Authorization', await t.bearer('admin'))
        .expect(409);
      expect(res.body.code).toBe('USER_HAS_HISTORY');
    });
  });

  describe('POST/DELETE /admin/users/{id}/avatar', () => {
    it('uploads the file field as multipart and forwards it with the acting admin', async () => {
      avatars.set.mockResolvedValue(toUserResponse(userEntity('student'), zone));
      await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/avatar`)
        .set('Authorization', await t.bearer('admin'))
        .attach('file', PNG, { filename: 'poza.png', contentType: 'image/png' })
        .expect(200);
      const [id, file, actor] = avatars.set.mock.calls[0];
      expect(id).toBe(STUDENT_ID);
      expect(Buffer.isBuffer(file.buffer) && file.buffer.equals(PNG)).toBe(true);
      expect(actor).toMatchObject({ id: TEST_USERS.admin.id });
    });

    it('DELETE 200 without photo; 403 for non-admins', async () => {
      avatars.remove.mockResolvedValue(toUserResponse(userEntity('student'), zone));
      await t
        .http()
        .delete(`/api/v1/admin/users/${STUDENT_ID}/avatar`)
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      await t
        .http()
        .delete(`/api/v1/admin/users/${STUDENT_ID}/avatar`)
        .set('Authorization', await t.bearer('student'))
        .expect(403);
    });
  });

  describe('POST /admin/users/{id}/suspend', () => {
    it('200 suspended user, sessions revoked', async () => {
      users.suspend.mockResolvedValue(
        toUserResponse(
          userEntity('student', { status: 'suspended', suspendedUntil: new Date(SUSPEND.until) }),
          zone,
        ),
      );
      const res = await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/suspend`)
        .set('Authorization', await t.bearer('admin'))
        .send(SUSPEND)
        .expect(200);
      expect(res.body).toMatchObject({ status: 'suspended', suspended_until: SUSPEND.until });
      expect(users.suspend).toHaveBeenCalledWith(
        TEST_USERS.admin,
        STUDENT_ID,
        new Date(SUSPEND.until),
        SUSPEND.reason,
      );
      expect(sessions.revokeAll).toHaveBeenCalledWith(STUDENT_ID);
    });

    it('422 without reason or with a bad date', async () => {
      const auth = await t.bearer('admin');
      await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/suspend`)
        .set('Authorization', auth)
        .send({ until: SUSPEND.until })
        .expect(422);
      await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/suspend`)
        .set('Authorization', auth)
        .send({ ...SUSPEND, until: '26.11.2026' })
        .expect(422);
    });

    it('404 for an unknown or malformed id', async () => {
      users.suspend.mockRejectedValue(new AppException('NOT_FOUND'));
      const auth = await t.bearer('admin');
      await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/suspend`)
        .set('Authorization', auth)
        .send(SUSPEND)
        .expect(404);
      await t
        .http()
        .post('/api/v1/admin/users/not-a-uuid/suspend')
        .set('Authorization', auth)
        .send(SUSPEND)
        .expect(404);
    });

    it('403 for non-admins', async () => {
      await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/suspend`)
        .set('Authorization', await t.bearer('teacher'))
        .send(SUSPEND)
        .expect(403);
    });
  });

  describe('POST /admin/users/{id}/reactivate', () => {
    it('200 active user', async () => {
      users.reactivate.mockResolvedValue(toUserResponse(userEntity('student'), zone));
      const res = await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/reactivate`)
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(res.body).toMatchObject({ id: STUDENT_ID, status: 'active', suspended_until: null });
      expect(users.reactivate).toHaveBeenCalledWith(TEST_USERS.admin, STUDENT_ID);
    });

    it('404 for an unknown id, 403 for non-admins', async () => {
      users.reactivate.mockRejectedValue(new AppException('NOT_FOUND'));
      await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/reactivate`)
        .set('Authorization', await t.bearer('admin'))
        .expect(404);
      await t
        .http()
        .post(`/api/v1/admin/users/${STUDENT_ID}/reactivate`)
        .set('Authorization', await t.bearer('external'))
        .expect(403);
    });
  });
});
