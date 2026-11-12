import { AppException } from '../../common/errors/app.exception';
import { createTestApp, TEST_CONFIG, TEST_USERS, TestApp } from '../../testing/test-app';
import { userEntity } from '../../testing/fixtures';
import { toUserResponse } from './dto/user.dto';
import { MeController } from './me.controller';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

describe('MeController', () => {
  let t: TestApp;
  const users = {
    getById: jest.fn(),
    deleteSelf: jest.fn(),
    toResponse: jest.fn((u) => toUserResponse(u, TEST_CONFIG.facilityTimezone)),
  };
  const sessions = { revokeAll: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [MeController],
      providers: [
        { provide: UsersService, useValue: users },
        { provide: SessionsService, useValue: sessions },
      ],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /me', () => {
    it('200 User for the caller (example: Ion Popescu)', async () => {
      users.getById.mockResolvedValue(userEntity('student'));
      const res = await t.http().get('/api/v1/me').set('Authorization', await t.bearer('student')).expect(200);
      expect(res.body).toEqual({
        id: '3c7d1e94-52af-4b08-9e61-a8f02d6b7c15',
        full_name: 'Ion Popescu',
        email: 'ion.popescu@student.example.edu',
        phone: '+37360000000',
        role: 'student',
        status: 'active',
        suspended_until: null,
        created_at: '2026-09-01T09:00:00+03:00',
      });
      expect(users.getById).toHaveBeenCalledWith(TEST_USERS.student.id);
    });

    it('a suspended user can still read the profile', async () => {
      users.getById.mockResolvedValue(
        userEntity('student', { status: 'suspended', suspendedUntil: new Date('2026-11-26T00:00:00+02:00') }),
      );
      const res = await t.http().get('/api/v1/me').set('Authorization', await t.bearer('suspended')).expect(200);
      expect(res.body).toMatchObject({ status: 'suspended', suspended_until: '2026-11-26T00:00:00+02:00' });
    });

    it('401 without a token', async () => {
      await t.http().get('/api/v1/me').expect(401);
    });
  });

  describe('DELETE /me', () => {
    it('204, deletes the account and revokes all sessions', async () => {
      users.deleteSelf.mockResolvedValue({ cancelledBookingIds: ['e3a94f60-1b2c-4d7e-8f05-6c2b9a0d4e11'] });
      await t.http().delete('/api/v1/me').set('Authorization', await t.bearer('external')).expect(204);
      expect(users.deleteSelf).toHaveBeenCalledWith(TEST_USERS.external);
      expect(sessions.revokeAll).toHaveBeenCalledWith(TEST_USERS.external.id);
    });

    it('403 for administrators', async () => {
      users.deleteSelf.mockRejectedValue(new AppException('FORBIDDEN'));
      await t.http().delete('/api/v1/me').set('Authorization', await t.bearer('admin')).expect(403);
      expect(sessions.revokeAll).not.toHaveBeenCalled();
    });

    it('401 without a token', async () => {
      await t.http().delete('/api/v1/me').expect(401);
    });
  });

  describe('GET /me/export', () => {
    it('501 NOT_IMPLEMENTED (stub)', async () => {
      const res = await t.http().get('/api/v1/me/export').set('Authorization', await t.bearer('student')).expect(501);
      expect(res.body.code).toBe('NOT_IMPLEMENTED');
    });

    it('401 without a token', async () => {
      await t.http().get('/api/v1/me/export').expect(401);
    });
  });
});
