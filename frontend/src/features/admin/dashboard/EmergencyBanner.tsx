import { useTranslation } from 'react-i18next';
import type { ActiveEmergency } from '@/api/types';
import { Banner } from '@/components/ui/feedback';
import { Button } from '@/components/ui/Button';
import { toast } from '@/stores/toastStore';
import { useDelivery, useReleaseBlock } from '../blocks/queries';

/** Confirmarea după o blocare de urgență: câți au fost anunțați și pe ce canale (SDD 7.3, pasul 4). */
export function EmergencyBanner({ emergency }: { emergency: ActiveEmergency }) {
  const { t } = useTranslation();
  const { data: report } = useDelivery(emergency.blockId);
  const release = useReleaseBlock();

  const action = (
    <Button
      variant="outline"
      loading={release.isPending}
      onClick={() =>
        release.mutate(emergency.blockId, {
          onSuccess: () => toast.success(t('blocks.toast.released', { name: emergency.resourceName })),
        })
      }
    >
      {t('blocks.release')}
    </Button>
  );

  const inProgress = report && !report.complete;
  return (
    <Banner
      tone={inProgress ? 'warn' : 'success'}
      role="status"
      className="mb-5"
      title={t('dashboard.emergency.title', { name: emergency.resourceName, count: emergency.affectedCount })}
      action={action}
    >
      {!report
        ? t('dashboard.emergency.loading')
        : inProgress
          ? t('dashboard.emergency.progress', { delivered: report.delivered, total: report.total })
          : t('dashboard.emergency.done', {
              seconds: report.durationSeconds,
              push: report.push,
              email: report.email,
              sms: report.sms,
            })}
    </Banner>
  );
}
