import { useMutation } from '@tanstack/react-query';
import { Camera, CameraOff, CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { USE_MOCKS } from '@/api/config';
import { api } from '@/api/endpoints';
import { ApiError } from '@/api/http';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { fmtTime } from '@/lib/dates';

function Scanner({ onCode }: { onCode: (code: string) => void }) {
    const { t } = useTranslation();
    const [error, setError] = useState(false);
    const onCodeRef = useRef(onCode);
    onCodeRef.current = onCode;

    useEffect(() => {
        let scanner: import('html5-qrcode').Html5Qrcode | null = null;
        let cancelled = false;
        (async () => {
            try {
                const { Html5Qrcode } = await import('html5-qrcode');
                if (cancelled) return;
                const s = new Html5Qrcode('qr-reader');
                await s.start({ facingMode: 'environment' }, { fps: 10, qrbox: 240 }, (text) => onCodeRef.current(text), () => { });
                if (cancelled) {
                    await s.stop();
                    return;
                }
                scanner = s;
            } catch {
                setError(true);
            }
        })();
        return () => {
            cancelled = true;
            if (scanner) {
                const s = scanner;
                void s.stop().then(() => s.clear()).catch(() => { });
            }
        };
    }, []);

    return (
        <div>
            <div id="qr-reader" className="overflow-hidden rounded-2xl bg-subtle" />
            {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger-ink">{t('checkin.cameraError')}</p>}
        </div>
    );
}

/** Check-in la intrare pentru personalul bazei (FR-03, FR-15): scanare QR sau cod introdus manual. */
export default function CheckInPage() {
    const { t } = useTranslation();
    const [scanning, setScanning] = useState(false);
    const [manual, setManual] = useState('');
    const lastScan = useRef<{ code: string; at: number } | null>(null);
    const verify = useMutation({ mutationFn: (code: string) => api.checkin.verify(code) });

    function handleCode(code: string) {
        const now = Date.now();
        // Camera citește același cod de mai multe ori pe secundă: ignoră repetările din ultimele 4 secunde.
        if (lastScan.current && lastScan.current.code === code && now - lastScan.current.at < 4000) return;
        lastScan.current = { code, at: now };
        verify.mutate(code);
    }

    const data = verify.data;
    const failure = verify.error instanceof ApiError ? verify.error.message : verify.error ? t('errors.generic') : null;

    return (
        <>
            <PageHeader title={t('checkin.title')} subtitle={t('checkin.subtitle')} />
            <div className="grid grid-cols-2 gap-6">
                <Card className="p-6">
                    <Button
                        variant={scanning ? 'outline' : 'accent'}
                        leftIcon={scanning ? <CameraOff className="h-4 w-4" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                        onClick={() => setScanning((s) => !s)}
                    >
                        {scanning ? t('checkin.stopCamera') : t('checkin.startCamera')}
                    </Button>
                    {scanning && <div className="mt-4"><Scanner onCode={handleCode} /></div>}

                    <form
                        noValidate
                        className="mt-6 space-y-3"
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (manual.trim()) handleCode(manual.trim());
                        }}
                    >
                        <Field label={t('checkin.manualLabel')} hint={USE_MOCKS ? t('checkin.manualHint') : undefined}>
                            {(c) => <Input {...c} value={manual} onChange={(e) => setManual(e.target.value)} autoComplete="off" />}
                        </Field>
                        <Button type="submit" variant="primary" loading={verify.isPending} disabled={!manual.trim()}>
                            {t('checkin.verify')}
                        </Button>
                    </form>
                </Card>

                <Card className="p-6" aria-live="polite">
                    <h2 className="heading mb-4 text-lg">{t('checkin.resultTitle')}</h2>
                    {!data && !failure && (
                        <p className="flex items-center gap-2 text-muted"><ScanLine className="h-5 w-5" aria-hidden />{t('checkin.idle')}</p>
                    )}
                    {data && (
                        <div className="space-y-3">
                            <p className="flex items-center gap-2 text-xl font-bold text-success-ink">
                                <CheckCircle2 className="h-6 w-6" aria-hidden />
                                {data.outcome === 'ok' ? t('checkin.ok') : t('checkin.already')}
                            </p>
                            <p className="text-lg font-bold text-ink">{data.userName}</p>
                            <Badge tone={data.userKind === 'external' ? 'warn' : 'success'}>
                                {data.userKind === 'external' ? t('checkin.external') : t('checkin.member')}
                            </Badge>
                            <p className="text-[15px] text-muted">{data.resourceName} · {fmtTime(data.startsAt)} – {fmtTime(data.endsAt)}</p>
                        </div>
                    )}
                    {failure && (
                        <div className="space-y-2" role="alert">
                            <p className="flex items-center gap-2 text-xl font-bold text-danger-ink">
                                <XCircle className="h-6 w-6" aria-hidden />
                                {t('checkin.failed')}
                            </p>
                            <p className="text-[15px] text-ink">{failure}</p>
                        </div>
                    )}
                </Card>
            </div>
        </>
    );
}
