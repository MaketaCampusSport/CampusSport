import { useMutation, useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { client } from '@/api/client';
import { USE_MOCKS } from '@/api/config';
import type { Session } from '@/api/generated';
import { ApiError } from '@/api/http';
import { useSession } from '@/auth/sessionStore';

/** Doar în dezvoltare și în demo-ul MSW: rutele /auth/dev/* ale serverului nu există în producție. */
export const DEV_LOGIN_ENABLED = import.meta.env.DEV || USE_MOCKS;

/**
 * Autentificare de dezvoltare ca un utilizator din datele de exemplu, fără SSO, Keycloak sau TOTP.
 * Serverul emite o sesiune reală (cookie de refresh + JWT), deci reîncărcarea paginii o păstrează.
 */
export function DevLoginPanel({ only, onSignedIn }: { only?: 'admin' | 'member'; onSignedIn: (s: Session) => void }) {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const users = useQuery({ queryKey: ['dev-login-users'], queryFn: () => client.auth.devUsers(), retry: false });
  const login = useMutation({
    mutationFn: (email: string) => client.auth.devLogin(email),
    onSuccess: (session) => {
      signIn(session);
      onSignedIn(session);
    },
  });

  const list = (users.data ?? []).filter((u) =>
    only === 'admin' ? u.role === 'admin' : only === 'member' ? u.role !== 'admin' : true,
  );

  return (
    <section aria-labelledby="dev-login-title" className="mt-8 rounded-2xl border border-dashed border-line p-4">
      <h2 id="dev-login-title" className="flex items-center gap-2 text-sm font-bold text-ink">
        <Wrench className="h-4 w-4 text-muted" aria-hidden />
        {t('auth.dev.title')}
      </h2>
      <p className="mt-1 text-xs text-muted">{t('auth.dev.body')}</p>
      {users.isError && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger-ink">
          {users.error instanceof ApiError && users.error.status === 404 ? t('auth.dev.disabled') : t('auth.dev.unreachable')}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {list.map((u) => (
          <li key={u.email}>
            <button
              type="button"
              disabled={login.isPending}
              onClick={() => login.mutate(u.email)}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-subtle px-3 py-2 text-left text-sm hover:brightness-95 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{u.full_name}</span>
                <span className="block truncate text-xs text-muted">{u.email}</span>
              </span>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold uppercase text-muted">
                {t(`auth.roles.${u.role}`)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {login.isError && (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger-ink">
          {login.error instanceof ApiError ? login.error.message : t('errors.generic')}
        </p>
      )}
    </section>
  );
}
