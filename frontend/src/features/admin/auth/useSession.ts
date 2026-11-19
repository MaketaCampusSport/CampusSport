import { useQuery } from '@tanstack/react-query';
import { USE_MOCKS } from '@/api/config';
import { api } from '@/api/endpoints';
import { getAccessToken } from '@/api/http';
import { keys } from '@/api/keys';
import type { SessionInfo } from '@/api/types';

function sessionFromJwt(token: string): SessionInfo | null {
  try {
    const [, payloadB64] = token.split('.');
    if (!payloadB64) return null;
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json) as {
      sub?: string;
      email?: string;
      name?: string;
      full_name?: string;
      role?: string;
      exp?: number;
    };
    const expiresAt = p.exp
      ? new Date(p.exp * 1000).toISOString()
      : new Date(Date.now() + 12 * 3600_000).toISOString();

    return {
      user: {
        id: p.sub ?? 'dev-admin',
        fullName: p.full_name ?? p.name ?? 'Andrei Rusu',
        email: p.email ?? 'admin@campussport.ro',
        role: (p.role as 'admin') ?? 'admin',
      } as SessionInfo['user'],
      twoFactorVerified: true,
      expiresAt,
    };
  } catch {
    return null;
  }
}

/** Sesiunea curentă a administratorului (cookie HttpOnly în demo sau JWT Bearer pe backend). */
export function useSession() {
  return useQuery({
    queryKey: keys.session,
    queryFn: async () => {
      if (import.meta.env.DEV && !USE_MOCKS) {
        const token = getAccessToken();
        const devSession = token ? sessionFromJwt(token) : null;
        if (devSession) return devSession;
      }
      return api.auth.me();
    },
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}