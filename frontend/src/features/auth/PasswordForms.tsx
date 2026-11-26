import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { client } from '@/api/client';
import type { PasswordRegistration, Session } from '@/api/generated';
import { ApiError } from '@/api/http';
import { useSession } from '@/auth/sessionStore';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/fields';
import { Segmented } from '@/components/ui/Segmented';

/** Aceeași limită ca `PasswordRegistration.password` (minLength) din specificație. */
export const MIN_PASSWORD_LENGTH = 8;

type RegisterRole = PasswordRegistration['role'];

function errorText(error: unknown, fallback: string): string | undefined {
  if (!error) return undefined;
  return error instanceof ApiError ? error.message : fallback;
}

const looksLikeEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

/** Autentificare cu email și parolă (POST /auth/login), pentru toate rolurile. */
export function PasswordLoginForm({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => client.auth.login({ email: email.trim(), password }),
    onSuccess: (session) => {
      signIn(session);
      onSignedIn(session);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate();
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <Field label={t('auth.password.email')}>
        {(control) => (
          <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
        )}
      </Field>
      <Field label={t('auth.password.password')} error={errorText(login.error, t('errors.generic'))}>
        {(control) => (
          <Input
            {...control}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        )}
      </Field>
      <Button
        type="submit"
        variant="accent"
        size="lg"
        className="w-full"
        loading={login.isPending}
        disabled={!looksLikeEmail(email) || password.length === 0}
      >
        {t('auth.password.submitSignIn')}
      </Button>
    </form>
  );
}

/** Cont nou (POST /auth/register): nume, email, parolă și rolul student sau profesor; sesiunea se deschide direct. */
export function PasswordRegisterForm({ onSignedIn }: { onSignedIn: (s: Session) => void }) {
  const { t } = useTranslation();
  const signIn = useSession((s) => s.signIn);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<RegisterRole>('student');

  const register = useMutation({
    mutationFn: () => client.auth.register({ full_name: fullName.trim(), email: email.trim(), password, role }),
    onSuccess: (session) => {
      signIn(session);
      onSignedIn(session);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    register.mutate();
  };
  const ready = fullName.trim().length >= 2 && looksLikeEmail(email) && password.length >= MIN_PASSWORD_LENGTH;

  return (
    <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
      <Field label={t('auth.password.fullName')}>
        {(control) => (
          <Input {...control} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" autoFocus />
        )}
      </Field>
      <Field label={t('auth.password.email')}>
        {(control) => <Input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />}
      </Field>
      <Field label={t('auth.password.password')} hint={t('auth.password.passwordHint', { min: MIN_PASSWORD_LENGTH })}>
        {(control) => (
          <Input
            {...control}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        )}
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-ink">{t('auth.password.role')}</p>
        <Segmented
          aria-label={t('auth.password.role')}
          value={role}
          onValueChange={setRole}
          options={[
            { value: 'student', label: t('auth.roles.student') },
            { value: 'teacher', label: t('auth.roles.teacher') },
          ]}
        />
      </div>
      {register.error ? (
        <p role="alert" className="text-sm font-semibold text-danger-ink">
          {errorText(register.error, t('errors.generic'))}
        </p>
      ) : null}
      <Button type="submit" variant="accent" size="lg" className="w-full" loading={register.isPending} disabled={!ready}>
        {t('auth.password.submitRegister')}
      </Button>
    </form>
  );
}
