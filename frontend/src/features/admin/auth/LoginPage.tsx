import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { USE_MOCKS } from '@/api/config';
import type { Session } from '@/api/generated';
import { Logo } from '@/app/layout/Logo';
import { FullPageSpinner } from '@/app/RouteFallbacks';
import { useEnsureSession } from '@/auth/guards';
import { isAdmin, useSession } from '@/auth/sessionStore';
import { Banner } from '@/components/ui/feedback';
import { PasswordLoginForm } from '@/features/auth/PasswordForms';
import { safeReturnTo } from '@/features/auth/sso';
// DEZACTIVAT împreună cu SSO și 2FA: ShieldCheck (lucide-react), Button, startSso.
// DEZACTIVAT: DevLoginPanel ('@/features/auth/DevLoginPanel') pentru lista conturilor de exemplu.

interface LocationState {
  from?: string;
  expired?: boolean;
}

/**
 * Autentificare administratori (SRS FR-01) cu email și parolă, fără al doilea pas.
 * DEZACTIVAT: SSO universitar + cod TOTP pe /auth/2fa (NFR-08).
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as LocationState;
  const requested = safeReturnTo(state.from, '/admin');
  const from = requested.startsWith('/admin') ? requested : '/admin';
  const expired = useSession((s) => s.expired) || state.expired;
  const { user, ready } = useEnsureSession();

  if (!ready) return <FullPageSpinner />;
  if (isAdmin(user)) return <Navigate to={from} replace />;

  // Un cont fără drepturi rămâne aici și vede mesajul „notAdmin” de mai jos.
  const done = (session: Session) => {
    if (isAdmin(session.user)) navigate(from, { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>

      <div className="w-full max-w-[480px] rounded-4xl bg-surface p-10 shadow-pop">
        <h1 className="heading text-3xl leading-tight">{t('login.title')}</h1>
        <p className="mt-2 text-[15px] text-muted">{t('login.body')}</p>

        {expired && (
          <Banner tone="warn" title={t('login.expiredTitle')} className="mt-6" role="status">
            {t('login.expiredBody')}
          </Banner>
        )}
        {user && !isAdmin(user) && (
          <Banner tone="info" title={t('login.notAdminTitle')} className="mt-6" role="status">
            {t('login.notAdminBody', { name: user.full_name })}
          </Banner>
        )}

        <PasswordLoginForm onSignedIn={done} />

        {/* DEZACTIVAT (autentificare cu email și parolă): SSO universitar, apoi codul TOTP pe /auth/2fa.
        <div className="mt-8 space-y-4">
          <Button
            variant="accent"
            size="lg"
            className="w-full"
            onClick={() => startSso(from, 'admin')}
            leftIcon={<ShieldCheck className="h-5 w-5" aria-hidden />}
          >
            {t('login.sso')}
          </Button>
          <p className="text-center text-xs text-muted">{t('login.ssoNote')}</p>
        </div>
        */}

        {/* DEZACTIVAT: lista conturilor de exemplu (autentificare de dezvoltare fără parolă).
        <DevLoginPanel only="admin" onSignedIn={() => navigate(from, { replace: true })} />
        */}

        {USE_MOCKS && (
          <div className="mt-8 flex gap-3 rounded-2xl bg-brand-soft p-4 text-sm text-brand-text">
            <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p>{t('login.demoHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
