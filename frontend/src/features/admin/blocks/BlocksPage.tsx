import { Lock, Pencil, Plus, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Block, BlockStatus } from '@/api/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { fmtDayTime } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { useResources } from '../shared/queries';
import { DeliveryReportCard } from './DeliveryReportCard';
import { PlannedBlockDialog } from './PlannedBlockDialog';
import { useBlocks, useReleaseBlock } from './queries';

const KIND_TONE: Record<Block['kind'], BadgeTone> = { emergency: 'solid-danger', maintenance: 'warn', cleaning: 'brand' };

/** Blocări (FR-40…42): active, planificate, istoric; deblocare și raport de livrare. */
export default function BlocksPage() {
  const { t } = useTranslation();
  const blocks = useBlocks();
  const resources = useResources();
  const release = useReleaseBlock();

  const [tab, setTab] = useState<BlockStatus>('active');
  const [dialog, setDialog] = useState<{ block: Block | null } | null>(null);
  const [releasing, setReleasing] = useState<Block | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const items = (blocks.data?.items ?? []).filter((b) => b.status === tab);
  const counts = blocks.data?.counts;

  return (
    <>
      <PageHeader
        title={t('blocks.title')}
        subtitle={t('blocks.subtitle')}
        actions={
          <Button variant="accent" size="lg" leftIcon={<Plus className="h-5 w-5" aria-hidden />} onClick={() => setDialog({ block: null })}>
            {t('blocks.new')}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as BlockStatus)}>
        <TabsList aria-label={t('blocks.title')} className="mb-5">
          {(['active', 'planned', 'history'] as BlockStatus[]).map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`blocks.tabs.${s}`)}
              {counts ? ` (${counts[s]})` : ''}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {reportId && (
        <div className="mb-5">
          <DeliveryReportCard blockId={reportId} />
        </div>
      )}

      {blocks.isError ? (
        <ErrorState message={blocks.error.message} onRetry={() => void blocks.refetch()} />
      ) : blocks.isPending ? (
        <Skeleton className="h-72 rounded-3xl" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Lock className="h-6 w-6" aria-hidden />} title={t(`blocks.empty.${tab}`)} description={t('blocks.empty.body')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="table-head pl-6">{t('blocks.col.resource')}</th>
                <th scope="col" className="table-head">{t('blocks.col.kind')}</th>
                <th scope="col" className="table-head">{t('blocks.col.interval')}</th>
                <th scope="col" className="table-head">{t('blocks.col.affected')}</th>
                <th scope="col" className="table-head pr-6 text-right">{t('blocks.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-b-0">
                  <td className="py-3 pl-6 pr-3">
                    <div className="flex items-center gap-3">
                      <ResourceThumb src={b.resourcePhotoUrl} className="h-12 w-12" />
                      <div>
                        <p className="text-[15px] font-bold text-ink">{b.resourceName}</p>
                        <p className="text-sm text-muted">{b.reason}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={KIND_TONE[b.kind]}>{t(`blocks.kinds.${b.kind}`)}</Badge>
                    {b.recurrence !== 'none' && <p className="mt-1 text-xs text-muted">{t(`blocks.recurrence.${b.recurrence}`)}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-ink">
                    {fmtDayTime(b.startsAt)}
                    <br />
                    <span className="text-muted">
                      {b.endsAt ? `→ ${fmtDayTime(b.endsAt)}` : t('blocks.untilFurther')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[15px] text-muted">{b.affectedCount}</td>
                  <td className="py-3 pl-4 pr-6">
                    <div className="flex justify-end gap-2">
                      {b.hasDelivery && (
                        <Button size="sm" variant="soft" onClick={() => setReportId(reportId === b.id ? null : b.id)} aria-expanded={reportId === b.id}>
                          {t('blocks.viewReport')}
                        </Button>
                      )}
                      {b.status === 'planned' && (
                        <Button size="sm" variant="outline" leftIcon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setDialog({ block: b })}>
                          {t('common.edit')}
                        </Button>
                      )}
                      {b.status !== 'history' && (
                        <Button size="sm" variant="outline" leftIcon={<Unlock className="h-4 w-4" aria-hidden />} onClick={() => setReleasing(b)}>
                          {b.status === 'planned' ? t('blocks.cancelPlanned') : t('blocks.release')}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <PlannedBlockDialog
        open={!!dialog}
        block={dialog?.block ?? null}
        resources={resources.data ?? []}
        onClose={() => setDialog(null)}
      />

      <Modal
        open={!!releasing}
        onOpenChange={(o) => !o && setReleasing(null)}
        size="sm"
        tone="success"
        icon={<Unlock className="h-7 w-7" aria-hidden />}
        title={t('blocks.releaseConfirm.title', { name: releasing?.resourceName ?? '' })}
        description={t('blocks.releaseConfirm.body')}
        footer={
          <>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setReleasing(null)}>
              {t('common.cancelAction')}
            </Button>
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              loading={release.isPending}
              onClick={() =>
                releasing &&
                release.mutate(releasing.id, {
                  onSuccess: () => {
                    toast.success(t('blocks.toast.released', { name: releasing.resourceName }));
                    setReleasing(null);
                  },
                })
              }
            >
              {t('blocks.release')}
            </Button>
          </>
        }
      />
    </>
  );
}
