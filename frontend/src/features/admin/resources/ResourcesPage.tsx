import { Plus, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/api/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Modal } from '@/components/ui/Modal';
import { PageHeader } from '@/components/ui/PageHeader';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { cn } from '@/lib/cn';
import { toast } from '@/stores/toastStore';
import { EmergencyBlockDialog } from '../blocks/EmergencyBlockDialog';
import { sportName, useResources, useSports } from '../shared/queries';
import { ResourcePanel } from './ResourcePanel';
import { useCreateResource, useSetResourceActive, useUpdateResource } from './queries';

const EXTERNAL_TONE: Record<Resource['externalAccess'], BadgeTone> = { never: 'neutral', window: 'warn', leftover: 'brand' };

export default function ResourcesPage() {
  const { t, i18n } = useTranslation();
  const resources = useResources();
  const sports = useSports();
  const create = useCreateResource();
  const update = useUpdateResource();
  const setActive = useSetResourceActive();

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [blocking, setBlocking] = useState<Resource | null>(null);

  const list = resources.data ?? [];
  const sportList = sports.data ?? [];
  // Implicit se editează prima resursă (ca în machetă).
  const effectiveId = selectedId ?? list[0]?.id ?? null;
  const selected = effectiveId && effectiveId !== 'new' ? list.find((r) => r.id === effectiveId) ?? null : null;

  const activeCount = list.filter((r) => r.active).length;
  const inactiveCount = list.length - activeCount;

  function statusBadge(r: Resource) {
    if (!r.active) return <Badge tone="neutral">{t('resources.status.inactive')}</Badge>;
    if (r.blocked) return <Badge tone="danger">{t('resources.status.blocked')}</Badge>;
    return <Badge tone="success">{t('resources.status.active')}</Badge>;
  }

  const sportsOf = (r: Resource) =>
    r.sportIds.map((id) => sportList.find((s) => s.id === id)).filter(Boolean).map((s) => sportName(s as NonNullable<typeof s>, i18n.language)).join(', ');

  return (
    <>
      <PageHeader
        title={t('resources.title')}
        subtitle={t('resources.subtitle', { active: activeCount, inactive: inactiveCount })}
        actions={
          <Button variant="accent" size="lg" leftIcon={<Plus className="h-5 w-5" aria-hidden />} onClick={() => { setSelectedId('new'); create.reset(); }}>
            {t('resources.new')}
          </Button>
        }
      />

      {resources.isError ? (
        <ErrorState message={resources.error.message} onRetry={() => void resources.refetch()} />
      ) : resources.isPending || sports.isPending ? (
        <Skeleton className="h-[560px] rounded-3xl" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={<Warehouse className="h-6 w-6" aria-hidden />} title={t('resources.emptyTitle')} description={t('resources.emptyBody')} />
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_440px] items-start gap-6">
          <Card className="overflow-hidden">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="table-head pl-6">{t('resources.col.resource')}</th>
                  <th scope="col" className="table-head">{t('resources.col.sports')}</th>
                  <th scope="col" className="table-head">{t('resources.col.capacity')}</th>
                  <th scope="col" className="table-head">{t('resources.col.external')}</th>
                  <th scope="col" className="table-head pr-6">{t('resources.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const isSel = r.id === effectiveId;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => { setSelectedId(r.id); update.reset(); }}
                      className={cn('cursor-pointer border-b border-line last:border-b-0 transition-colors hover:bg-subtle', isSel && 'bg-brand-soft/60')}
                    >
                      <td className="py-3 pl-6 pr-3">
                        <button
                          type="button"
                          aria-pressed={isSel}
                          onClick={(e) => { e.stopPropagation(); setSelectedId(r.id); update.reset(); }}
                          className="flex items-center gap-3 text-left"
                        >
                          <ResourceThumb src={r.photoUrl} className="h-12 w-12" />
                          <span className="text-[15px] font-bold text-ink">{r.name}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[15px] text-muted">{sportsOf(r)}</td>
                      <td className="px-4 py-3 text-[15px] text-muted">{r.capacity}</td>
                      <td className="px-4 py-3">
                        <Badge tone={EXTERNAL_TONE[r.externalAccess]}>{t(`resources.externalShort.${r.externalAccess}`)}</Badge>
                      </td>
                      <td className="py-3 pl-4 pr-6">{statusBadge(r)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <ResourcePanel
            key={effectiveId ?? 'none'}
            resource={selected}
            sports={sportList}
            saving={create.isPending || update.isPending}
            saveError={create.error ?? update.error}
            onSave={(input) => {
              if (selected) {
                update.mutate({ id: selected.id, input }, { onSuccess: () => toast.success(t('resources.toast.saved', { name: input.name })) });
              } else {
                create.mutate(input, {
                  onSuccess: (created) => {
                    setSelectedId(created.id);
                    toast.success(t('resources.toast.created', { name: created.name }));
                  },
                });
              }
            }}
            onDeactivate={() => setConfirmDeactivate(true)}
            onActivate={() =>
              selected && setActive.mutate({ id: selected.id, active: true }, { onSuccess: () => toast.success(t('resources.toast.activated', { name: selected.name })) })
            }
            onBlock={() => setBlocking(selected)}
          />
        </div>
      )}

      <Modal
        open={confirmDeactivate && !!selected}
        onOpenChange={setConfirmDeactivate}
        size="sm"
        tone="warn"
        title={t('resources.confirm.title')}
        description={t('resources.confirm.body')}
        footer={
          <>
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setConfirmDeactivate(false)}>
              {t('common.cancelAction')}
            </Button>
            <Button
              variant="accent"
              size="lg"
              className="flex-1"
              loading={setActive.isPending}
              onClick={() =>
                selected &&
                setActive.mutate(
                  { id: selected.id, active: false },
                  {
                    onSuccess: () => {
                      setConfirmDeactivate(false);
                      toast.success(t('resources.toast.deactivated', { name: selected.name }));
                    },
                  },
                )
              }
            >
              {t('resources.deactivate')}
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-subtle p-3">
              <ResourceThumb src={selected.photoUrl} className="h-14 w-14" />
              <div>
                <p className="font-extrabold text-ink">{selected.name}</p>
                <p className="text-sm text-muted">
                  {sportsOf(selected)} · {t('resources.confirm.people', { count: selected.capacity })}
                </p>
              </div>
            </div>
            <p className="flex items-center gap-3 text-sm text-muted">
              <Badge tone="success">{t('resources.status.active')}</Badge>
              {t('resources.confirm.willBecome')}
            </p>
          </div>
        )}
      </Modal>

      <EmergencyBlockDialog resource={blocking} onClose={() => setBlocking(null)} />
    </>
  );
}
