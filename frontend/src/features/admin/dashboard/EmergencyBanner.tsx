import { useTranslation } from 'react-i18next';
import type { Block } from '@/api/client';
import { Banner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { fmtTime } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { deliveryComplete, useDelivery, useReleaseBlock } from '../blocks/queries';

/** O urgență activă: câți utilizatori au fost anunțați și pe ce canale (SDD 7.3, pasul 4). */
export function EmergencyBanner({ block, resourceName }: { block: Block; resourceName: string }) {
  const { t } = useTranslation();
  const { data: report } = useDelivery(block.id);
  const release = useReleaseBlock();

  const action = (
    <Button
      variant="outline"
      loading={release.isPending}
      onClick={() =>
        release.mutate(block.id, {
          onSuccess: () => toast.success(t('blocks.toast.released', { name: resourceName })),
          onError: () => toast.error(t('errors.generic')),
        })
      }
    >
      {t('blocks.release')}
    </Button>
  );

  const inProgress = report && !deliveryComplete(report);
  return (
    <Banner
      tone={inProgress ? 'warn' : 'success'}
      role="status"
      className="mb-5"
      title={t('dashboard.emergency.title', { name: resourceName, since: fmtTime(block.start), reason: block.reason })}
      action={action}
    >
      {!report
        ? t('dashboard.emergency.loading')
        : inProgress
          ? t('dashboard.emergency.progress', { delivered: report.delivered, total: report.notified })
          : t('dashboard.emergency.done', {
              total: report.notified,
              push: report.by_channel.push ?? 0,
              email: report.by_channel.email ?? 0,
              sms: report.by_channel.sms ?? 0,
            })}
    </Banner>
  );
}
