import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'react-qr-code';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { fmtTime } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { useSession } from '../auth/useSession';

/** Contul administratorului: date de sesiune și configurarea TOTP (NFR-08). */
export default function AccountPage() {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const session = useSession();
    const [code, setCode] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const setup = useMutation({ mutationFn: () => api.account.totpSetup() });
    const confirm = useMutation({
        mutationFn: (c: string) => api.account.totpConfirm(c),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: keys.auditAll });
            toast.success(t('account.toast.enabled'));
            setup.reset();
            setCode('');
            setSubmitted(false);
        },
    });

    if (session.isError) return <ErrorState message={session.error.message} onRetry={() => void session.refetch()} />;
    if (!session.data) return <Skeleton className="h-[360px] rounded-3xl" />;

    const { user, expiresAt } = session.data;
    const codeOk = /^\d{6}$/.test(code);

    return (
        <>
            <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />
            <div className="grid grid-cols-2 gap-6">
                <Card className="p-6">
                    <p className="eyebrow">{t('account.sessionTitle')}</p>
                    <p className="mt-2 text-xl font-bold text-ink">{user.fullName}</p>
                    <p className="text-[15px] text-muted">{t('account.email')}: {user.email}</p>
                    <p className="mt-3 text-[15px] text-muted">{t('account.expires', { time: fmtTime(expiresAt) })}</p>
                </Card>

                <Card className="p-6">
                    <p className="eyebrow">{t('account.twofaTitle')}</p>
                    <p className="mt-2 text-[15px] text-muted">{t('account.twofaBody')}</p>

                    {!setup.data ? (
                        <div className="mt-4">
                            <Button variant="accent" leftIcon={<ShieldCheck className="h-4 w-4" aria-hidden />} loading={setup.isPending} onClick={() => setup.mutate()}>
                                {t('account.setup')}
                            </Button>
                            {setup.isError && (
                                <p role="alert" className="mt-3 text-sm font-semibold text-danger-ink">
                                    {setup.error instanceof ApiError ? setup.error.message : t('errors.generic')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <form
                            noValidate
                            className="mt-4 space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                setSubmitted(true);
                                if (codeOk) confirm.mutate(code);
                            }}
                        >
                            {/* Codul QR rămâne închis pe fundal alb în ambele teme, ca să poată fi scanat. */}
                            <div className="inline-block rounded-2xl bg-white p-4">
                                <QRCode value={setup.data.otpauthUrl} size={176} fgColor="#1A2238" bgColor="#FFFFFF" />
                            </div>
                            <p className="text-sm text-muted">
                                {t('account.secret')}: <code className="font-mono font-semibold text-ink">{setup.data.secret}</code>
                            </p>
                            <Field label={t('account.code')} error={submitted && !codeOk ? t('account.errors.code') : undefined}>
                                {(c) => <Input {...c} inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />}
                            </Field>
                            {confirm.isError && (
                                <p role="alert" className="text-sm font-semibold text-danger-ink">
                                    {confirm.error instanceof ApiError ? confirm.error.message : t('errors.generic')}
                                </p>
                            )}
                            <div className="flex gap-3">
                                <Button type="submit" variant="accent" loading={confirm.isPending}>{t('account.confirm')}</Button>
                                <Button variant="outline" onClick={() => { setup.reset(); setCode(''); setSubmitted(false); }}>{t('account.cancel')}</Button>
                            </div>
                        </form>
                    )}
                </Card>
            </div>
        </>
    );
}
