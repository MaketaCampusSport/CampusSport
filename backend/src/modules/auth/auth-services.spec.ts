import { generateSync } from 'otplib';
import { AppException } from '../../common/errors/app.exception';
import { MemoryKvStore } from '../../common/kv/kv-store';
import { userEntity } from '../../testing/fixtures';
import { TEST_CONFIG } from '../../testing/test-app';
import { AuthFlowsService, safeReturnTo } from './auth-flows.service';
import { mapRole } from './oidc.service';
import { OTP_MAX_ATTEMPTS, OtpService } from './otp.service';
import { SessionsService } from './sessions.service';
import { TotpService } from './totp.service';

describe('mapRole', () => {
  const map = TEST_CONFIG.oidc.roleMap;
  it('maps claim values and picks the highest role', () => {
    expect(mapRole(['student'], map)).toBe('student');
    expect(mapRole(['faculty'], map)).toBe('teacher');
    expect(mapRole(['student', 'admin'], map)).toBe('admin');
    expect(mapRole(['Faculty'], map)).toBe('teacher');
  });
  it('returns null when nothing maps', () => {
    expect(mapRole([], map)).toBeNull();
    expect(mapRole(['alum'], map)).toBeNull();
  });
});

describe('safeReturnTo', () => {
  it('keeps PWA paths and rejects open redirects', () => {
    expect(safeReturnTo('/start')).toBe('/start');
    expect(safeReturnTo('/bookings/123?tab=qr')).toBe('/bookings/123?tab=qr');
    expect(safeReturnTo(undefined)).toBe('/start');
    expect(safeReturnTo('https://evil.example')).toBe('/start');
    expect(safeReturnTo('//evil.example')).toBe('/start');
    expect(safeReturnTo('/\\evil.example')).toBe('/start');
  });
});

describe('OtpService', () => {
  const otp = new OtpService(new MemoryKvStore());
  const email = 'ana.rusu@example.com';

  it('issues 6-digit codes that verify once consumed', async () => {
    const code = await otp.issue('email', email);
    expect(code).toMatch(/^\d{6}$/);
    expect(await otp.verify('email', email, code)).toBe(true);
    await otp.consume('email', email);
    expect(await otp.verify('email', email, code)).toBe(false);
  });

  it('rejects wrong and malformed codes', async () => {
    const code = await otp.issue('phone', email);
    const wrong = code === '000000' ? '000001' : '000000';
    expect(await otp.verify('phone', email, wrong)).toBe(false);
    expect(await otp.verify('phone', email, 'abc')).toBe(false);
    expect(await otp.verify('phone', email, undefined)).toBe(false);
    expect(await otp.verify('phone', email, code)).toBe(true);
  });

  it(`discards the code after ${OTP_MAX_ATTEMPTS} wrong attempts`, async () => {
    const code = await otp.issue('email', 'x@example.com');
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await otp.verify('email', 'x@example.com', wrong);
    expect(await otp.verify('email', 'x@example.com', code)).toBe(false);
  });
});

describe('TotpService', () => {
  const totp = new TotpService(TEST_CONFIG);
  it('verifies codes of the current step and builds an otpauth URI', () => {
    const secret = totp.generateSecret();
    expect(totp.verify(secret, generateSync({ secret }))).toBe(true);
    expect(totp.verify(secret, '12345')).toBe(false);
    expect(totp.otpauthUri('andrei.rusu@example.edu', secret)).toMatch(/^otpauth:\/\/totp\/CampusSport/);
  });
});

describe('SessionsService', () => {
  let now = Date.parse('2026-11-12T10:00:00Z');
  const kv = new MemoryKvStore(() => now);
  const sessions = new SessionsService(kv, TEST_CONFIG);
  const realNow = Date.now;
  beforeAll(() => {
    Date.now = () => now;
  });
  afterAll(() => {
    Date.now = realNow;
  });
  const student = userEntity('student');
  const admin = userEntity('admin');

  it('members get 30 days, sliding on rotation', async () => {
    const s = await sessions.create(student);
    expect(s.expiresAt - now).toBe(30 * 86_400_000);
    now += 86_400_000;
    const r = await sessions.rotate(s.token, async () => 'student');
    expect(r!.expiresAt - now).toBe(30 * 86_400_000);
  });

  it('admins get 8 hours, absolute', async () => {
    const s = await sessions.create(admin);
    const deadline = s.expiresAt;
    expect(deadline - now).toBe(8 * 3_600_000);
    now += 3_600_000;
    const r = await sessions.rotate(s.token, async () => 'admin');
    expect(r!.expiresAt).toBe(deadline);
    now += 8 * 3_600_000;
    expect(await sessions.rotate(r!.token, async () => 'admin')).toBeNull();
  });

  it('a rotated token cannot be reused, a tampered secret is rejected', async () => {
    const s = await sessions.create(student);
    expect(await sessions.rotate(s.token, async () => 'student')).not.toBeNull();
    expect(await sessions.rotate(s.token, async () => 'student')).toBeNull();
    const t2 = await sessions.create(student);
    expect(await sessions.rotate(`${t2.token.split('.')[0]}.forged`, async () => 'student')).toBeNull();
    expect(await sessions.rotate('garbage', async () => 'student')).toBeNull();
  });

  it('revokeAll ends every session of the user', async () => {
    const a = await sessions.create(student);
    const b = await sessions.create(student);
    await sessions.revokeAll(student.id);
    expect(await sessions.rotate(a.token, async () => 'student')).toBeNull();
    expect(await sessions.rotate(b.token, async () => 'student')).toBeNull();
  });

  it('a deleted user cannot refresh', async () => {
    const s = await sessions.create(student);
    expect(await sessions.rotate(s.token, async () => null)).toBeNull();
  });
});

describe('AuthFlowsService', () => {
  const kv = new MemoryKvStore();
  const otp = new OtpService(kv);
  const totp = new TotpService(TEST_CONFIG);
  const oidc = { authorizationRequest: jest.fn(), exchange: jest.fn() };
  const users = {
    upsertFromSso: jest.fn(),
    getTotpSecret: jest.fn(),
    getById: jest.fn(),
    findByEmail: jest.fn(),
    createOrResetExternal: jest.fn(),
    markExternalVerified: jest.fn(),
  };
  const mail = { send: jest.fn().mockResolvedValue(undefined) };
  const sms = { send: jest.fn().mockResolvedValue(undefined) };
  const flows = new AuthFlowsService(
    oidc as never,
    users as never,
    otp,
    totp,
    mail as never,
    sms as never,
    kv,
    TEST_CONFIG,
  );
  beforeEach(() => jest.clearAllMocks());

  async function login(roleValues: string[]) {
    oidc.authorizationRequest.mockResolvedValue({
      url: 'https://idp/auth',
      state: `s-${roleValues.join()}`,
      codeVerifier: 'v',
    });
    await flows.startSso('/start');
    oidc.exchange.mockResolvedValue({ subject: 'kc-1', email: 'x@example.edu', fullName: 'X', roleValues });
    return flows.finishSso({ code: 'c', state: `s-${roleValues.join()}` });
  }

  it('SSO member login returns the user and the PWA target', async () => {
    users.upsertFromSso.mockResolvedValue(userEntity('student'));
    const result = await login(['student']);
    expect(result).toEqual({
      kind: 'member',
      user: userEntity('student'),
      redirectTo: 'http://localhost:5173/start',
    });
    expect(users.upsertFromSso).toHaveBeenCalledWith({
      subject: 'kc-1',
      email: 'x@example.edu',
      fullName: 'X',
      role: 'student',
    });
  });

  it('SSO state is single-use', async () => {
    users.upsertFromSso.mockResolvedValue(userEntity('student'));
    await login(['student']);
    await expect(flows.finishSso({ code: 'c', state: 's-student' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('SSO without a mapped role -> FORBIDDEN', async () => {
    await expect(login(['alum'])).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admin login requires TOTP; the challenge verifies once', async () => {
    const secret = totp.generateSecret();
    users.upsertFromSso.mockResolvedValue(userEntity('admin'));
    users.getTotpSecret.mockResolvedValue(secret);
    users.getById.mockResolvedValue(userEntity('admin'));
    const result = await login(['admin']);
    expect(result.kind).toBe('second-factor');
    const challengeId = new URL(result.redirectTo).searchParams.get('challenge_id')!;

    await expect(flows.verifySecondFactor(challengeId, '000000')).rejects.toBeInstanceOf(AppException);
    await expect(flows.verifySecondFactor(challengeId, generateSync({ secret }))).resolves.toMatchObject({
      role: 'admin',
    });
    await expect(flows.verifySecondFactor(challengeId, generateSync({ secret }))).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });
  });

  it('admin without TOTP enrolment is sent back with an error', async () => {
    users.upsertFromSso.mockResolvedValue(userEntity('admin'));
    users.getTotpSecret.mockResolvedValue(null);
    const result = await login(['admin']);
    expect(result.redirectTo).toContain('error=totp_not_enrolled');
  });

  it('external registration sends an email code and an SMS code', async () => {
    users.createOrResetExternal.mockResolvedValue(
      userEntity('external', { emailVerifiedAt: null, phoneVerifiedAt: null }),
    );
    await expect(
      flows.registerExternal({ full_name: 'Ana Rusu', email: 'ana.rusu@example.com', phone: '+37360000001' }),
    ).resolves.toEqual({ expires_in: 600 });
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana.rusu@example.com' }));
    expect(sms.send).toHaveBeenCalledWith(expect.objectContaining({ to: '+37360000001' }));
  });

  it('first verification needs both codes; later logins only the email code', async () => {
    const unverified = userEntity('external', { emailVerifiedAt: null, phoneVerifiedAt: null });
    users.findByEmail.mockResolvedValue(unverified);
    users.getById.mockResolvedValue(userEntity('external'));
    const emailCode = await otp.issue('email', unverified.email);
    const phoneCode = await otp.issue('phone', unverified.email);
    await expect(
      flows.verifyExternal({ email: unverified.email, email_code: emailCode }),
    ).rejects.toMatchObject({ code: 'OTP_INVALID' });
    await expect(
      flows.verifyExternal({ email: unverified.email, email_code: emailCode, phone_code: phoneCode }),
    ).resolves.toMatchObject({ role: 'external' });
    expect(users.markExternalVerified).toHaveBeenCalledWith(unverified.id, true);

    users.findByEmail.mockResolvedValue(userEntity('external'));
    const again = await otp.issue('email', unverified.email);
    await expect(flows.verifyExternal({ email: unverified.email, email_code: again })).resolves.toBeDefined();
    expect(users.markExternalVerified).toHaveBeenLastCalledWith(unverified.id, false);
  });

  it('external login does not reveal unknown emails', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(flows.requestExternalLogin({ email: 'nobody@example.com' })).resolves.toEqual({
      expires_in: 600,
    });
    expect(mail.send).not.toHaveBeenCalled();
  });
});
