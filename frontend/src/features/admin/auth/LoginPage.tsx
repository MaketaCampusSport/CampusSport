import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { USE_MOCKS } from '@/api/config';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import { Logo } from '@/app/layout/Logo';
import { FullPageSpinner } from '@/app/RouteFallbacks';
import { Banner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/fields';
import { useAuthStore } from '@/stores/authStore';
import { useSession } from './useSession';

interface LocationState {
  from?: string;
  expired?: boolean;
}

/**
 * Autentificare administratori (SRS FR-01, NFR-08):
 * pasul 1 = SSO universitar, pasul 2 = cod TOTP din aplicația de autentificare.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const state = (useLocation().state ?? {}) as LocationState;
  const from = state.from && state.from.startsWith('/admin') ? state.from : '/admin';

  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const clearExpired = useAuthStore((s) => s.clearExpired);
  const session = useSession();
  const [code, setCode] = useState('');

  // Sesiune expirată: ștergem datele vechi și pornim de la zero.
  useEffect(() => {
    if (sessionExpired) {
      queryClient.removeQueries({ queryKey: keys.session });
      clearExpired();
    }
  }, [sessionExpired, queryClient, clearExpired]);

  const sso = useMutation({
    mutationFn: () => api.auth.startSso(),
    onSuccess: (result) => {
      if (result === 'mock') void queryClient.invalidateQueries({ queryKey: keys.session });
    },
  });

  const totp = useMutation({
    mutationFn: (value: string) => api.auth.verifyTotp(value),
    onSuccess: (info) => {
      queryClient.setQueryData(keys.session, info);
      navigate(from, { replace: true });
    },
  });

  if (session.isPending) return <FullPageSpinner />;
  if (session.data?.twoFactorVerified) return <Navigate to={from} replace />;

  const needsCode = !!session.data;
  const codeError =
    totp.error instanceof ApiError
      ? totp.error.status === 401 || totp.error.status === 400
        ? t('login.codeInvalid')
        : totp.error.message
      : totp.error
        ? t('errors.generic')
        : undefined;

  function submitCode(e: FormEvent) {
    e.preventDefault();
    if (/^\d{6}$/.test(code)) totp.mutate(code);
  }

  async function switchAccount() {
    try {
      await api.auth.logout();
    } finally {
      setCode('');
      totp.reset();
      queryClient.removeQueries({ queryKey: keys.session });
      void queryClient.invalidateQueries({ queryKey: keys.session });
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>

      <div className="w-full max-w-[480px] rounded-4xl bg-surface p-10 shadow-pop">
        <p className="eyebrow text-brand-text">{needsCode ? t('login.step2') : t('login.step1')}</p>
        <h1 className="heading mt-2 text-3xl leading-tight">{t(needsCode ? 'login.codeTitle' : 'login.title')}</h1>
        <p className="mt-2 text-[15px] text-muted">
          {needsCode ? t('login.codeBody', { name: session.data?.user.fullName }) : t('login.body')}
        </p>

        {(state.expired || sessionExpired) && !needsCode && (
          <Banner tone="warn" title={t('login.expiredTitle')} className="mt-6" role="status">
            {t('login.expiredBody')}
          </Banner>
        )}

        {!needsCode ? (
          <div className="mt-8 space-y-4">
            <Button
              variant="accent"
              size="lg"
              className="w-full"
              loading={sso.isPending}
              onClick={() => sso.mutate()}
              leftIcon={<ShieldCheck className="h-5 w-5" aria-hidden />}
            >
              {t('login.sso')}
            </Button>
            {sso.isError && (
              <p role="alert" className="text-sm font-semibold text-danger-ink">
                {sso.error instanceof ApiError ? sso.error.message : t('errors.generic')}
              </p>
            )}
            <p className="text-center text-xs text-muted">{t('login.ssoNote')}</p>
          </div>
        ) : (
          <form onSubmit={submitCode} className="mt-8 space-y-5" noValidate>
            <Field label={t('login.codeLabel')} error={codeError} hint={t('login.codeHint')}>
              {(control) => (
                <Input
                  {...control}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (totp.isError) totp.reset();
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  className="h-16 text-center text-3xl font-extrabold tracking-[0.45em]"
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              loading={totp.isPending}
              disabled={code.length !== 6}
            >
              {t('login.verify')}
            </Button>
            <button
              type="button"
              onClick={() => void switchAccount()}
              className="mx-auto block rounded-lg px-2 py-1 text-sm font-semibold text-brand-text hover:underline"
            >
              {t('login.otherAccount')}
            </button>
          </form>
        )}

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
