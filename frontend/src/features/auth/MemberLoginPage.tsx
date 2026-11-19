import { useMutation } from '@tanstack/react-query';
import { GraduationCap, Info } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { client } from '@/api/client';
import { USE_MOCKS } from '@/api/config';
import type { Session } from '@/api/generated';
import { ApiError } from '@/api/http';
import { Logo } from '@/app/layout/Logo';
import { FullPageSpinner } from '@/app/RouteFallbacks';
import { useEnsureSession } from '@/auth/guards';
import { isAdmin, useSession } from '@/auth/sessionStore';
import { Banner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/Segmented';
import { DevLoginPanel } from './DevLoginPanel';
import { safeReturnTo, startSso } from './sso';

type Mode = 'member' | 'external';
type ExternalStep = 'email' | 'register' | 'code';

function errorText(error: unknown, fallback: string): string | undefined {
  if (!error) return undefined;
  return error instanceof ApiError ? error.message : fallback;
}

/** Externii: cod OTP pe email (și pe telefon, la prima verificare) – FR-02. */
function ExternalLogin({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const [step, setStep] = useState<ExternalStep>('email');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [registering, setRegistering] = useState(false);

  const requestCode = useMutation({
    mutationFn: () => client.auth.loginExternal(email.trim()),
    onSuccess: () => {
      setRegistering(false);
      setStep('code');
    },
  });
  const register = useMutation({
    mutationFn: () => client.auth.registerExternal({ full_name: fullName.trim(), email: email.trim(), phone: phone.trim() }),
    onSuccess: () => {
      setRegistering(true);
      setStep('code');
    },
  });
  const verify = useMutation({
    mutationFn: () =>
      client.auth.verifyExternal({
        email: email.trim(),
        email_code: emailCode,
        ...(registering ? { phone_code: phoneCode } : {}),
      }),
    onSuccess: (session) => {
      signIn(session);
      onSignedIn(session);
    },
  });

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  if (step === 'code') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      verify.mutate();
    };
    const ready = emailCode.length === 6 && (!registering || phoneCode.length === 6);
    return (
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <p className="text-sm text-muted">{t(registering ? 'auth.external.codesSentBoth' : 'auth.external.codeSent', { email })}</p>
        <Field label={t('auth.external.emailCode')} error={verify.error ? t('login.codeInvalid') : undefined}>
          {(control) => (
            <Input
              {...control}
              value={emailCode}
              onChange={(e) => setEmailCode(digits(e.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
            />
          )}
        </Field>
        {registering && (
          <Field label={t('auth.external.phoneCode')}>
            {(control) => (
              <Input {...control} value={phoneCode} onChange={(e) => setPhoneCode(digits(e.target.value))} inputMode="numeric" placeholder="000000" />
            )}
          </Field>
        )}
        <Button type="submit" variant="accent" size="lg" className="w-full" loading={verify.isPending} disabled={!ready}>
          {t('login.verify')}
        </Button>
        <button
          type="button"
          onClick={() => {
            setStep('email');
            setEmailCode('');
            setPhoneCode('');
            verify.reset();
          }}
          className="mx-auto block rounded-lg px-2 py-1 text-sm font-semibold text-brand-text hover:underline"
        >
          {t('auth.external.changeEmail')}
        </button>
      </form>
    );
  }

  if (step === 'register') {
    const submit = (e: FormEvent) => {
      e.preventDefault();
      register.mutate();
    };
    return (
      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field label={t('auth.external.fullName')}>
          {(control) => <Input {...control} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" autoFocus />}
        </Field>
        <Field label={t('auth.external.email')}>
          {(control) => <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}
        </Field>
        <Field label={t('auth.external.phone')} hint={t('auth.external.phoneHint')} error={errorText(register.error, t('errors.generic'))}>
          {(control) => <Input {...control} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+373…" />}
        </Field>
        <Button
          type="submit"
          variant="accent"
          size="lg"
          className="w-full"
          loading={register.isPending}
          disabled={!fullName.trim() || !email.includes('@') || !/^\+\d{8,15}$/.test(phone.trim())}
        >
          {t('auth.external.register')}
        </Button>
        <button type="button" onClick={() => setStep('email')} className="mx-auto block rounded-lg px-2 py-1 text-sm font-semibold text-brand-text hover:underline">
          {t('auth.external.haveAccount')}
        </button>
      </form>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    requestCode.mutate();
  };
  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <Field label={t('auth.external.email')} error={errorText(requestCode.error, t('errors.generic'))}>
        {(control) => <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}
      </Field>
      <Button type="submit" variant="accent" size="lg" className="w-full" loading={requestCode.isPending} disabled={!email.includes('@')}>
        {t('auth.external.sendCode')}
      </Button>
      <button type="button" onClick={() => setStep('register')} className="mx-auto block rounded-lg px-2 py-1 text-sm font-semibold text-brand-text hover:underline">
        {t('auth.external.noAccount')}
      </button>
    </form>
  );
}

/** Autentificarea utilizatorilor PWA: studenți și profesori prin SSO, externi prin OTP (FR-01, FR-02). */
export default function MemberLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const state = (location.state ?? {}) as { from?: string; expired?: boolean };
  const requested = safeReturnTo(state.from ?? params.get('return_to'), '/user');
  const from = requested.startsWith('/user') ? requested : '/user';
  const expired = useSession((s) => s.expired) || state.expired;
  const signIn = useSession((s) => s.signIn);
  const { user, ready } = useEnsureSession();
  const [mode, setMode] = useState<Mode>('member');

  // Demo MSW: „SSO” revine aici cu ?demo_sso=1 și intrăm ca studentul din datele de exemplu.
  const demoSso = USE_MOCKS && params.get('demo_sso') === '1';
  useEffect(() => {
    if (!demoSso) return;
    void client.auth.devUsers().then(async (users) => {
      const student = users.find((u) => u.role === 'student');
      if (!student) return;
      signIn(await client.auth.devLogin(student.email));
      navigate(from, { replace: true });
    });
  }, [demoSso, from, navigate, signIn]);

  if (!ready || demoSso) return <FullPageSpinner />;
  if (user) return <Navigate to={isAdmin(user) ? '/admin' : from} replace />;

  const done = () => navigate(from, { replace: true });

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-navy px-5 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="w-full max-w-[440px] rounded-4xl bg-surface p-7 shadow-pop sm:p-9">
        <h1 className="heading text-3xl leading-tight">{t('auth.member.title')}</h1>
        <p className="mt-2 text-[15px] text-muted">{t('auth.member.body')}</p>

        {expired && (
          <Banner tone="warn" title={t('auth.member.expiredTitle')} className="mt-5" role="status">
            {t('auth.member.expiredBody')}
          </Banner>
        )}

        <Segmented
          className="mt-6"
          aria-label={t('auth.member.modeLabel')}
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'member', label: t('auth.member.modeMember') },
            { value: 'external', label: t('auth.member.modeExternal') },
          ]}
        />

        {mode === 'member' ? (
          <div className="mt-6 space-y-3">
            <Button
              variant="accent"
              size="lg"
              className="w-full"
              onClick={() => startSso(from, 'member')}
              leftIcon={<GraduationCap className="h-5 w-5" aria-hidden />}
            >
              {t('auth.member.sso')}
            </Button>
            <p className="text-center text-xs text-muted">{t('auth.member.ssoNote')}</p>
          </div>
        ) : (
          <ExternalLogin onSignedIn={done} />
        )}

        <DevLoginPanel only="member" onSignedIn={done} />

        {USE_MOCKS && (
          <div className="mt-6 flex gap-3 rounded-2xl bg-brand-soft p-4 text-sm text-brand-text">
            <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p>{t('auth.member.demoHint')}</p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted">
          <Link to="/admin/login" className="font-semibold text-brand-text hover:underline">
            {t('auth.member.adminLink')}
          </Link>
        </p>
      </div>
    </div>
  );
}
