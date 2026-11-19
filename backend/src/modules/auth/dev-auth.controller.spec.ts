import { KV_STORE, MemoryKvStore } from '../../common/kv/kv-store';
import { APP_CONFIG, loadConfig } from '../../config/configuration';
import { createTestApp, TEST_CONFIG, TEST_JWT_SECRET, TestApp } from '../../testing/test-app';
import { userEntity } from '../../testing/fixtures';
import { toUserResponse } from './dto/user.dto';
import { DevAuthController } from './dev-auth.controller';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

describe('DevAuthController', () => {
  const student = userEntity('student');
  const users = {
    listActive: jest.fn(async () => [student]),
    findByEmail: jest.fn(async (email: string) => (email === student.email ? student : null)),
    touch: jest.fn(),
    toResponse: jest.fn((u) => toUserResponse(u, TEST_CONFIG.facilityTimezone)),
  };

  async function appWith(env: Record<string, string>): Promise<TestApp> {
    return createTestApp({
      controllers: [DevAuthController],
      providers: [
        SessionsService,
        { provide: KV_STORE, useValue: new MemoryKvStore() },
        { provide: UsersService, useValue: users },
        { provide: APP_CONFIG, useValue: loadConfig({ JWT_ACCESS_SECRET: TEST_JWT_SECRET, ...env }) },
      ],
    });
  }

  describe('in development', () => {
    let t: TestApp;
    beforeAll(async () => (t = await appWith({ NODE_ENV: 'development' })));
    afterAll(() => t.close());

    it('lists active users without authentication', async () => {
      const res = await t.http().get('/api/v1/auth/dev/users').expect(200);
      expect(res.body).toEqual([{ email: student.email, full_name: student.fullName, role: 'student' }]);
    });

    it('signs in as a user: access token in the body, refresh cookie set', async () => {
      const res = await t.http().post('/api/v1/auth/dev/login').send({ email: student.email }).expect(200);
      expect(res.body).toMatchObject({ token_type: 'Bearer', user: { id: student.id, role: 'student' } });
      expect(res.body.access_token).toEqual(expect.any(String));
      const cookies = res.headers['set-cookie'] as unknown as string[];
      expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
    });

    it('404 for an unknown email, 422 for a malformed one', async () => {
      await t.http().post('/api/v1/auth/dev/login').send({ email: 'nobody@example.com' }).expect(404);
      await t.http().post('/api/v1/auth/dev/login').send({ email: 'nope' }).expect(422);
    });
  });

  it.each([
    ['production-like test env', { NODE_ENV: 'test' }],
    ['development with DEV_LOGIN=false', { NODE_ENV: 'development', DEV_LOGIN: 'false' }],
  ])('answers 404 in %s', async (_name, env) => {
    const t = await appWith(env);
    await t.http().get('/api/v1/auth/dev/users').expect(404);
    await t.http().post('/api/v1/auth/dev/login').send({ email: student.email }).expect(404);
    await t.close();
  });
});
