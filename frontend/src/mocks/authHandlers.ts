import { delay, http, HttpResponse } from 'msw';
import { API_BASE, MOCK_LATENCY } from '@/api/config';
import { currentUser, MOCK_USERS, sessionFor, setCurrentUser } from './session';

const url = (p: string) => `${API_BASE}${p}`;
const DEMO_CODE = '123456';

async function lag(): Promise<void> {
  if (MOCK_LATENCY > 0) await delay(MOCK_LATENCY * (0.6 + Math.random() * 0.8));
}

export function apiError(status: number, code: string, ro: string, en: string) {
  return HttpResponse.json({ code, message_ro: ro, message_en: en }, { status });
}

export const unauthenticated = () =>
  apiError(401, 'UNAUTHENTICATED', 'Autentifică-te pentru a continua.', 'Sign in to continue.');

const otpInvalid = () => apiError(401, 'OTP_INVALID', 'Cod incorect sau expirat.', 'Wrong or expired code.');

/** Autentificare (contractul din assets/livrabil05/openapi.yaml + rutele de dezvoltare /auth/dev/*). */
export const authHandlers = [
  http.get(url('/me'), async () => {
    await lag();
    const user = currentUser();
    return user ? HttpResponse.json(user) : unauthenticated();
  }),
  http.post(url('/auth/refresh'), async () => {
    const user = currentUser();
    if (!user) return unauthenticated();
    setCurrentUser(user);
    return HttpResponse.json(sessionFor(user));
  }),
  http.post(url('/auth/logout'), async () => {
    setCurrentUser(null);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(url('/auth/2fa/verify'), async ({ request }) => {
    await lag();
    const { code } = (await request.json()) as { challenge_id: string; code: string };
    if (code !== DEMO_CODE) return otpInvalid();
    const admin = MOCK_USERS.find((u) => u.role === 'admin')!;
    setCurrentUser(admin);
    return HttpResponse.json(sessionFor(admin));
  }),
  http.post(url('/auth/external/register'), async () => {
    await lag();
    return HttpResponse.json({ expires_in: 600 }, { status: 202 });
  }),
  http.post(url('/auth/external/login'), async () => {
    await lag();
    return HttpResponse.json({ expires_in: 600 }, { status: 202 });
  }),
  http.post(url('/auth/external/verify'), async ({ request }) => {
    await lag();
    const body = (await request.json()) as { email: string; email_code: string; phone_code?: string };
    if (body.email_code !== DEMO_CODE || (body.phone_code !== undefined && body.phone_code !== DEMO_CODE)) {
      return otpInvalid();
    }
    const external = MOCK_USERS.find((u) => u.role === 'external')!;
    const user = { ...external, email: body.email.trim().toLowerCase() };
    setCurrentUser(external);
    return HttpResponse.json(sessionFor(user));
  }),
  http.get(url('/auth/dev/users'), async () =>
    HttpResponse.json(MOCK_USERS.map((u) => ({ email: u.email, full_name: u.full_name, role: u.role }))),
  ),
  http.post(url('/auth/dev/login'), async ({ request }) => {
    await lag();
    const { email } = (await request.json()) as { email: string };
    const user = MOCK_USERS.find((u) => u.email === email);
    if (!user) return apiError(404, 'NOT_FOUND', 'Nu există.', 'Not found.');
    setCurrentUser(user);
    return HttpResponse.json(sessionFor(user));
  }),
];
