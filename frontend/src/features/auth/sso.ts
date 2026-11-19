import { client } from '@/api/client';
import { USE_MOCKS } from '@/api/config';

/** Doar căi interne ale PWA (serverul aplică aceeași regulă, `safeReturnTo`). */
export function safeReturnTo(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : fallback;
}

/**
 * Pornește SSO-ul universității: navigare completă la GET /auth/sso/login (302 către furnizorul de identitate).
 * La întoarcere, serverul setează cookie-ul de refresh și trimite la `returnTo` (membri)
 * sau la /auth/2fa?challenge_id=… (administratori).
 * În demo-ul MSW nu există furnizor de identitate, așa că simulăm direct pasul următor.
 */
export function startSso(returnTo: string, audience: 'admin' | 'member'): void {
  if (USE_MOCKS) {
    const next =
      audience === 'admin'
        ? `/auth/2fa?challenge_id=demo&return_to=${encodeURIComponent(returnTo)}`
        : `/login?demo_sso=1&return_to=${encodeURIComponent(returnTo)}`;
    window.location.assign(next);
    return;
  }
  window.location.assign(client.auth.ssoLoginUrl(returnTo));
}
