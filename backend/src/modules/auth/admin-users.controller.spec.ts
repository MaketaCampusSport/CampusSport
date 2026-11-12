import { AppException } from '../../common/errors/app.exception';
import { createTestApp, TEST_CONFIG, TEST_USERS, TestApp } from '../../testing/test-app';
import { userEntity } from '../../testing/fixtures';
import { AdminUsersController } from './admin-users.controller';
import { toUserResponse } from './dto/user.dto';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

const STUDENT_ID = '3c7d1e94-52af-4b08-9e61-a8f02d6b7c15';
/** `suspendUser` example body. */
const SUSPEND = { until: '2026-11-26T00:00:00+02:00', reason: 'No-show-uri repetate' };

describe('AdminUsersController', () => {
  let t: TestApp;
  const users = { list: jest.fn(), suspend: jest.fn(), reactivate: jest.fn() };
  const sessions = { revokeAll: jest.fn() };
  const zone = TEST_CONFIG.facilityTimezone;

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [AdminUsersController],
      providers: [
        { provide: UsersService, useValue: users },
        { provide: SessionsService, useValue: sessions },
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
