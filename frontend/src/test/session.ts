import { client } from '@/api/client';
import type { Role } from '@/api/generated';
import { useSession } from '@/auth/sessionStore';
import { MOCK_USERS } from '@/mocks/session';

/** Autentificare în teste, prin ruta de dezvoltare simulată (MSW): token în memorie + utilizator în store. */
export async function signInAs(role: Role = 'admin') {
  const user = MOCK_USERS.find((u) => u.role === role)!;
  const session = await client.auth.devLogin(user.email);
  useSession.getState().signIn(session);
  return session;
}
