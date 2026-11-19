import { CheckCircle2, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { fmtDayTime } from '@/lib/dates';
import { formatNumber } from '@/lib/format';
import { deliveryComplete, useDelivery } from './queries';

interface Props {
  blockId: string;
  resourceName: string;
  startedAt: string;
}

/** Contorul „anunțați / livrați” al unei blocări (SDD 7.3, pasul 4; GET /admin/blocks/{id}/delivery). */
export function DeliveryReportCard({ blockId, resourceName, startedAt }: Props) {
  const { t } = useTranslation();
  const { data, isPending, isError, error, refetch } = useDelivery(blockId);

  if (isError) return <Card><ErrorState message={error.message} onRetry={() => void refetch()} /></Card>;
  if (isPending || !data) return <Skeleton className="h-40" />;

  const done = data.delivered + data.failed;
  const pct = data.notified === 0 ? 100 : Math.round((done / data.notified) * 100);
  const complete = deliveryComplete(data);

  return (
    <Card className="p-6" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow">{t('blocks.delivery.eyebrow')}</p>
          <h3 className="heading text-xl">{resourceName}</h3>
          <p className="text-sm text-muted">{t('blocks.delivery.since', { at: fmtDayTime(startedAt) })}</p>
        </div>
        {complete ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-success-ink">
            <CheckCircle2 className="h-5 w-5" aria-hidden /> {t('blocks.delivery.complete')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-text">
            <Send className="h-5 w-5 animate-pulse" aria-hidden /> {t('blocks.delivery.sending')}
          </span>
        )}
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-sm font-semibold">
          <span>{t('blocks.delivery.progress', { delivered: formatNumber(data.delivered), total: formatNumber(data.notified) })}</span>
          <span>{pct}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={t('blocks.delivery.eyebrow')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-3 overflow-hidden rounded-full bg-subtle"
        >
          <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4 text-center sm:grid-cols-6">
        {(
          [
            ['notified', data.notified],
            ['delivered', data.delivered],
            ['failed', data.failed],
            ['push', data.by_channel.push ?? 0],
            ['email', data.by_channel.email ?? 0],
            ['sms', data.by_channel.sms ?? 0],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex flex-col-reverse rounded-2xl bg-subtle px-2 py-3">
            <dt className="mt-1 text-xs text-muted">{t(`blocks.delivery.stats.${k}`)}</dt>
            <dd className="heading text-2xl leading-none">{formatNumber(v)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
