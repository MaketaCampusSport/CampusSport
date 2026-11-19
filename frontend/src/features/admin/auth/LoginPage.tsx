import { Info, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { USE_MOCKS } from '@/api/config';
import { Logo } from '@/app/layout/Logo';
import { FullPageSpinner } from '@/app/RouteFallbacks';
import { useEnsureSession } from '@/auth/guards';
import { isAdmin, useSession } from '@/auth/sessionStore';
import { Banner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { DevLoginPanel } from '@/features/auth/DevLoginPanel';
import { safeReturnTo, startSso } from '@/features/auth/sso';

interface LocationState {
  from?: string;
  expired?: boolean;
}

/**
 * Autentificare administratori (SRS FR-01, NFR-08): pasul 1 = SSO universitar, pasul 2 = cod TOTP.
 * Pasul 2 are loc pe /auth/2fa, unde serverul trimite administratorii după SSO.
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>

      <div className="w-full max-w-[480px] rounded-4xl bg-surface p-10 shadow-pop">
        <p className="eyebrow text-brand-text">{t('login.step1')}</p>
        <h1 className="heading mt-2 text-3xl leading-tight">{t('login.title')}</h1>
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

        <DevLoginPanel only="admin" onSignedIn={() => navigate(from, { replace: true })} />

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
