import { Lock, Plus, Unlock } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Block, BlockKind, ListBlocksData } from '@/api/client';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/fields';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { Segmented } from '@/components/ui/Segmented';
import { fmtDayTime } from '@/lib/dates';
import { toast } from '@/stores/toastStore';
import { errorMessage } from '../shared/errors';
import { Pagination } from '../shared/Pagination';
import { resourceName, useResources } from '../shared/queries';
import { DeliveryReportCard } from './DeliveryReportCard';
import { PlannedBlockDialog } from './PlannedBlockDialog';
import { useBlocks, useReleaseBlock } from './queries';

const KINDS: BlockKind[] = ['emergency', 'maintenance', 'pe_class', 'event'];
const KIND_TONE: Record<BlockKind, BadgeTone> = { emergency: 'solid-danger', maintenance: 'warn', pe_class: 'brand', event: 'neutral' };
const PERIODS = ['upcoming', 'past', 'all'] as const;
type Period = (typeof PERIODS)[number];
type BlockState = 'active' | 'planned' | 'ended';
const STATE_TONE: Record<BlockState, BadgeTone> = { active: 'danger', planned: 'brand', ended: 'neutral' };
const PAGE_SIZE = 20;

export function blockState(b: Block, now = new Date()): BlockState {
  if (new Date(b.start) > now) return 'planned';
  if (b.end && new Date(b.end) <= now) return 'ended';
  return 'active';
}

/** Blocări (FR-40…42): toate rândurile din `occupancy` care nu sunt rezervări; deblocare și raport de livrare. */
export default function BlocksPage() {
  const { t } = useTranslation();
  const resources = useResources();
  const release = useReleaseBlock();
  // Momentul de referință pentru filtre: fix pe durata vizitei, ca cheia interogării să fie stabilă.
  const [now] = useState(() => new Date());

  const [period, setPeriod] = useState<Period>('upcoming');
  const [resource, setResource] = useState('');
  const [kind, setKind] = useState<BlockKind | ''>('');
  const [page, setPage] = useState(1);
  const [planning, setPlanning] = useState(false);
  const [releasing, setReleasing] = useState<Block | null>(null);
  const [report, setReport] = useState<Block | null>(null);

  const query: ListBlocksData['query'] = {
    ...(period === 'upcoming' ? { from: now.toISOString() } : period === 'past' ? { to: now.toISOString() } : {}),
    ...(resource ? { resource } : {}),
    ...(kind ? { kind } : {}),
    page,
    page_size: PAGE_SIZE,
  };
  const blocks = useBlocks(query);
  const items = blocks.data?.items ?? [];
  const nameOf = (id: string) => resourceName(resources.data, id);
  const photoOf = (id: string) => resources.data?.find((r) => r.id === id)?.photo_url ?? '';

  return (
    <>
      <PageHeader
        title={t('blocks.title')}
        subtitle={t('blocks.subtitle')}
        actions={
          <Button variant="accent" size="lg" leftIcon={<Plus className="h-5 w-5" aria-hidden />} onClick={() => setPlanning(true)}>
            {t('blocks.new')}
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented
          aria-label={t('blocks.period')}
          value={period}
          onValueChange={(v) => {
            setPeriod(v);
            setPage(1);
          }}
          options={PERIODS.map((p) => ({ value: p, label: t(`blocks.tabs.${p}`) }))}
        />
        <div className="ml-auto w-56">
          <Select
            aria-label={t('blocks.col.resource')}
            value={resource}
            onChange={(e) => {
              setResource(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('blocks.allResources')}</option>
            {(resources.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select
            aria-label={t('blocks.col.kind')}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as BlockKind | '');
              setPage(1);
            }}
          >
            <option value="">{t('blocks.allKinds')}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`blocks.kinds.${k}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {report && (
        <div className="mb-5">
          <DeliveryReportCard blockId={report.id} resourceName={nameOf(report.resource_id)} startedAt={report.start} />
        </div>
      )}

      {blocks.isError ? (
        <ErrorState message={blocks.error.message} onRetry={() => void blocks.refetch()} />
      ) : !blocks.data ? (
        <Skeleton className="h-72 rounded-3xl" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<Lock className="h-6 w-6" aria-hidden />} title={t(`blocks.empty.${period}`)} description={t('blocks.empty.body')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="table-head pl-6">{t('blocks.col.resource')}</th>
                <th scope="col" className="table-head">{t('blocks.col.kind')}</th>
                <th scope="col" className="table-head">{t('blocks.col.interval')}</th>
                <th scope="col" className="table-head">{t('blocks.col.state')}</th>
                <th scope="col" className="table-head pr-6 text-right">{t('blocks.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => {
                const state = blockState(b);
                const name = nameOf(b.resource_id);
                const canReport = b.kind === 'emergency' || b.kind === 'maintenance';
                // Orele EF recurente se gestionează din Orar EF (DELETE /admin/schedule/recurrences/{id}).
                const canRelease = state !== 'ended' && b.kind !== 'pe_class';
                return (
                  <tr key={b.id} className="border-b border-line last:border-b-0">
                    <td className="py-3 pl-6 pr-3">
                      <div className="flex items-center gap-3">
                        <ResourceThumb src={photoOf(b.resource_id)} className="h-12 w-12" />
                        <div>
                          <p className="text-[15px] font-bold text-ink">{name}</p>
                          <p className="text-sm text-muted">{b.reason}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={KIND_TONE[b.kind]}>{t(`blocks.kinds.${b.kind}`)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-ink">
                      {fmtDayTime(b.start)}
                      <br />
                      <span className="text-muted">{b.end ? `→ ${fmtDayTime(b.end)}` : t('blocks.untilFurther')}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATE_TONE[state]}>{t(`blocks.state.${state}`)}</Badge>
                    </td>
                    <td className="py-3 pl-4 pr-6">
                      <div className="flex justify-end gap-2">
                        {canReport && (
                          <Button size="sm" variant="soft" onClick={() => setReport(report?.id === b.id ? null : b)} aria-expanded={report?.id === b.id}>
                            {t('blocks.viewReport')}
                          </Button>
                        )}
                        {canRelease && (
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<Unlock className="h-4 w-4" aria-hidden />}
                            onClick={() => {
                              release.reset();
                              setReleasing(b);
                            }}
                          >
                            {state === 'planned' ? t('blocks.cancelPlanned') : t('blocks.release')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination meta={blocks.data} onPage={setPage} />
        </Card>
      )}

      <PlannedBlockDialog
        open={planning}
        resources={resources.data ?? []}
        onClose={() => setPlanning(false)}
        onCreated={(result) => setReport(result.block)}
      />

      <Modal
        open={!!releasing}
        onOpenChange={(o) => !o && setReleasing(null)}
        size="sm"
        tone="success"
        icon={<Unlock className="h-7 w-7" aria-hidden />}
        title={t('blocks.releaseConfirm.title', { name: releasing ? nameOf(releasing.resource_id) : '' })}
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
                    toast.success(t('blocks.toast.released', { name: nameOf(releasing.resource_id) }));
                    if (report?.id === releasing.id) setReport(null);
                    setReleasing(null);
                  },
                })
              }
            >
              {t('blocks.release')}
            </Button>
          </>
        }
      >
        {release.isError && (
          <p role="alert" className="text-sm font-semibold text-danger-ink">
            {errorMessage(release.error, t)}
          </p>
        )}
      </Modal>
    </>
  );
}
