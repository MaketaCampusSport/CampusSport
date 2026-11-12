import { AppException } from '../../common/errors/app.exception';
import { KV_STORE, MemoryKvStore } from '../../common/kv/kv-store';
import { APP_CONFIG } from '../../config/configuration';
import { createTestApp, TEST_CONFIG, TestApp } from '../../testing/test-app';
import { userEntity } from '../../testing/fixtures';
import { toUserResponse } from './dto/user.dto';
import { AuthFlowsService } from './auth-flows.service';
import { AuthController } from './auth.controller';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

/** Example values from openapi.yaml (ExternalRegistration, verifyTwoFactor, verifyExternal). */
const REGISTRATION = { full_name: 'Ana Rusu', email: 'ana.rusu@example.com', phone: '+37360000001' };
const VERIFY = { email: 'ana.rusu@example.com', email_code: '583021', phone_code: '190274' };
const TWO_FA = { challenge_id: '9d8c7b6a-5f4e-4d3c-8b2a-190807060504', code: '482913' };

function refreshCookie(res: { headers: Record<string, unknown> }): string | undefined {
  const cookies = res.headers['set-cookie'] as string[] | undefined;
  return cookies?.find((c) => c.startsWith('refresh_token='));
}

describe('AuthController', () => {
  let t: TestApp;
  const flows = {
    startSso: jest.fn(),
    finishSso: jest.fn(),
    verifySecondFactor: jest.fn(),
    registerExternal: jest.fn(),
    requestExternalLogin: jest.fn(),
    verifyExternal: jest.fn(),
  };
  const users = {
    getById: jest.fn(),
    touch: jest.fn(),
    toResponse: jest.fn((u) => toUserResponse(u, TEST_CONFIG.facilityTimezone)),
  };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [AuthController],
      providers: [
        SessionsService,
        { provide: KV_STORE, useValue: new MemoryKvStore() },
        { provide: AuthFlowsService, useValue: flows },
        { provide: UsersService, useValue: users },
      ],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /auth/sso/login', () => {
    it('302 to the identity provider, keeping return_to', async () => {
      flows.startSso.mockResolvedValue('http://localhost:8080/realms/campussport/protocol/openid-connect/auth?x=1');
      const res = await t.http().get('/api/v1/auth/sso/login?return_to=/start').expect(302);
      expect(res.headers.location).toContain('/protocol/openid-connect/auth');
      expect(flows.startSso).toHaveBeenCalledWith('/start');
    });
  });

  describe('GET /auth/sso/callback', () => {
    it('member: 302 to the PWA with the refresh cookie', async () => {
      flows.finishSso.mockResolvedValue({
        kind: 'member',
        user: userEntity('student'),
        redirectTo: 'http://localhost:5173/start',
      });
      const res = await t.http().get('/api/v1/auth/sso/callback?code=abc&state=xyz').expect(302);
      expect(res.headers.location).toBe('http://localhost:5173/start');
      const cookie = refreshCookie(res);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect(flows.finishSso).toHaveBeenCalledWith({ code: 'abc', state: 'xyz' });
    });

    it('admin: 302 to the 2FA step, no cookie yet', async () => {
      flows.finishSso.mockResolvedValue({
        kind: 'second-factor',
        redirectTo: `http://localhost:5173/auth/2fa?challenge_id=${TWO_FA.challenge_id}`,
      });
      const res = await t.http().get('/api/v1/auth/sso/callback?code=abc&state=xyz').expect(302);
      expect(res.headers.location).toContain('challenge_id=');
      expect(refreshCookie(res)).toBeUndefined();
    });

    it('unknown state -> 400 BAD_REQUEST', async () => {
      flows.finishSso.mockRejectedValue(new AppException('BAD_REQUEST'));
      const res = await t.http().get('/api/v1/auth/sso/callback?code=abc&state=forged').expect(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });

    it('missing code -> 422', async () => {
      await t.http().get('/api/v1/auth/sso/callback?state=xyz').expect(422);
    });
  });

  describe('POST /auth/2fa/verify', () => {
    it('200 Session for the admin + refresh cookie', async () => {
      flows.verifySecondFactor.mockResolvedValue(userEntity('admin'));
      const res = await t.http().post('/api/v1/auth/2fa/verify').send(TWO_FA).expect(200);
      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, user: { role: 'admin' } });
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(refreshCookie(res)).toBeDefined();
      expect(flows.verifySecondFactor).toHaveBeenCalledWith(TWO_FA.challenge_id, TWO_FA.code);
    });

    it('wrong code -> 401 OTP_INVALID', async () => {
      flows.verifySecondFactor.mockRejectedValue(new AppException('OTP_INVALID'));
      const res = await t.http().post('/api/v1/auth/2fa/verify').send(TWO_FA).expect(401);
      expect(res.body.code).toBe('OTP_INVALID');
    });

    it('malformed body -> 422', async () => {
      await t.http().post('/api/v1/auth/2fa/verify').send({ challenge_id: 'x', code: '12' }).expect(422);
    });
  });

  describe('POST /auth/external/register', () => {
    it('202 OtpSent', async () => {
      flows.registerExternal.mockResolvedValue({ expires_in: 600 });
      const res = await t.http().post('/api/v1/auth/external/register').send(REGISTRATION).expect(202);
      expect(res.body).toEqual({ expires_in: 600 });
      expect(flows.registerExternal).toHaveBeenCalledWith(REGISTRATION);
    });

    it('normalizes the email to lower case', async () => {
      flows.registerExternal.mockResolvedValue({ expires_in: 600 });
      await t
        .http()
        .post('/api/v1/auth/external/register')
        .send({ ...REGISTRATION, email: ' Ana.Rusu@Example.com ' })
        .expect(202);
      expect(flows.registerExternal.mock.calls[0][0].email).toBe('ana.rusu@example.com');
    });

    it('409 EMAIL_ALREADY_USED', async () => {
      flows.registerExternal.mockRejectedValue(new AppException('EMAIL_ALREADY_USED'));
      const res = await t.http().post('/api/v1/auth/external/register').send(REGISTRATION).expect(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_USED');
    });

    it('422 when the phone is not E.164', async () => {
      const res = await t
        .http()
        .post('/api/v1/auth/external/register')
        .send({ ...REGISTRATION, phone: '060000001' })
        .expect(422);
      expect(res.body.details.fields.phone).toBeDefined();
    });
  });

  describe('POST /auth/external/login', () => {
    it('202 OtpSent', async () => {
      flows.requestExternalLogin.mockResolvedValue({ expires_in: 600 });
      await t.http().post('/api/v1/auth/external/login').send({ email: REGISTRATION.email }).expect(202, { expires_in: 600 });
    });

    it('422 for an invalid email', async () => {
      await t.http().post('/api/v1/auth/external/login').send({ email: 'nope' }).expect(422);
    });
  });

  describe('POST /auth/external/verify', () => {
    it('200 Session + cookie', async () => {
      flows.verifyExternal.mockResolvedValue(userEntity('external'));
      const res = await t.http().post('/api/v1/auth/external/verify').send(VERIFY).expect(200);
      expect(res.body.user).toMatchObject({ full_name: 'Ana Rusu', role: 'external', phone: '+37360000001' });
      expect(refreshCookie(res)).toBeDefined();
    });

    it('401 OTP_INVALID', async () => {
      flows.verifyExternal.mockRejectedValue(new AppException('OTP_INVALID'));
      const res = await t.http().post('/api/v1/auth/external/verify').send(VERIFY).expect(401);
      expect(res.body.code).toBe('OTP_INVALID');
    });
  });

  describe('POST /auth/refresh and /auth/logout', () => {
    it('refresh without cookie -> 401 and clears the cookie', async () => {
      const res = await t.http().post('/api/v1/auth/refresh').expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
      expect(refreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('refresh rotates the cookie; the old one stops working; logout revokes', async () => {
      const student = userEntity('student');
      users.getById.mockResolvedValue(student);
      const sessions = t.get(SessionsService);
      const first = await sessions.create(student);

      const res = await t.http().post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${first.token}`).expect(200);
      expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, user: { id: student.id } });
      const rotated = refreshCookie(res)!.split(';')[0];
      expect(rotated).not.toBe(`refresh_token=${first.token}`);

      await t.http().post('/api/v1/auth/refresh').set('Cookie', `refresh_token=${first.token}`).expect(401);

      await t.http().post('/api/v1/auth/logout').set('Cookie', rotated).expect(204);
      await t.http().post('/api/v1/auth/refresh').set('Cookie', rotated).expect(401);
    });

    it('logout without cookie still -> 204', async () => {
      await t.http().post('/api/v1/auth/logout').expect(204);
    });
  });

  it('uses the configured access-token lifetime', () => {
    expect(t.get(APP_CONFIG)).toBe(TEST_CONFIG);
  });
});
