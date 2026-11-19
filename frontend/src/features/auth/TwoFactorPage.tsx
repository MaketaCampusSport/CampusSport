import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { client } from '@/api/client';
import { ApiError } from '@/api/http';
import { Logo } from '@/app/layout/Logo';
import { useSession } from '@/auth/sessionStore';
import { Banner } from '@/components/ui/feedback';
import { Button, buttonClasses } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/fields';
import { safeReturnTo } from './sso';

/**
 * Al doilea pas pentru administratori (NFR-08). Serverul trimite aici după SSO:
 * `?challenge_id=…&return_to=…`, sau `?error=totp_not_enrolled` dacă nu există TOTP configurat.
 */
export default function TwoFactorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signIn = useSession((s) => s.signIn);
  const challengeId = params.get('challenge_id');
  const returnTo = safeReturnTo(params.get('return_to'), '/admin');
  const notEnrolled = params.get('error') === 'totp_not_enrolled';
  const [code, setCode] = useState('');

  const verify = useMutation({
    mutationFn: (value: string) => client.auth.verifyTwoFactor(challengeId ?? '', value),
    onSuccess: (session) => {
      signIn(session);
      navigate(returnTo.startsWith('/admin') ? returnTo : '/admin', { replace: true });
    },
  });

  const codeError =
    verify.error instanceof ApiError
      ? verify.error.code === 'OTP_INVALID' || verify.error.status === 401
        ? t('login.codeInvalid')
        : verify.error.message
      : verify.error
        ? t('errors.generic')
        : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (/^\d{6}$/.test(code)) verify.mutate(code);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-6 py-12">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-[480px] rounded-4xl bg-surface p-10 shadow-pop">
        <p className="eyebrow text-brand-text">{t('login.step2')}</p>
        <h1 className="heading mt-2 text-3xl leading-tight">{t('login.codeTitle')}</h1>

        {notEnrolled || !challengeId ? (
          <>
            <Banner
              tone="warn"
              title={notEnrolled ? t('auth.twoFactor.notEnrolledTitle') : t('auth.twoFactor.missingTitle')}
              className="mt-6"
              role="alert"
            >
              {notEnrolled ? t('auth.twoFactor.notEnrolledBody') : t('auth.twoFactor.missingBody')}
            </Banner>
            <Link to="/admin/login" className={buttonClasses('outline', 'md', 'mt-6 w-full')}>
              {t('auth.twoFactor.backToLogin')}
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
            <p className="text-[15px] text-muted">{t('auth.twoFactor.body')}</p>
            <Field label={t('login.codeLabel')} error={codeError} hint={t('login.codeHint')}>
              {(control) => (
                <Input
                  {...control}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (verify.isError) verify.reset();
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
              loading={verify.isPending}
              disabled={code.length !== 6}
            >
              {t('login.verify')}
            </Button>
            <Link
              to="/admin/login"
              className="mx-auto block w-fit rounded-lg px-2 py-1 text-sm font-semibold text-brand-text hover:underline"
            >
              {t('login.otherAccount')}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
