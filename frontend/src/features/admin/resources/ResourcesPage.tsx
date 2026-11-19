import { Plus, Warehouse } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExternalAccess, Resource } from '@/api/client';
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
import { activeBlockByResource, sportName, useActiveBlocks, useResources, useSports } from '../shared/queries';
import { ResourcePanel } from './ResourcePanel';
import { useCreateResource, useUpdateResource } from './queries';

const EXTERNAL_TONE: Record<ExternalAccess, BadgeTone> = { never: 'neutral', window: 'warn', leftover: 'brand' };

export default function ResourcesPage() {
  const { t, i18n } = useTranslation();
  const resources = useResources();
  const sports = useSports();
  const activeBlocks = useActiveBlocks();
  const create = useCreateResource();
  const update = useUpdateResource();
  const toggle = useUpdateResource();

  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [blocking, setBlocking] = useState<{ id: string; name: string } | null>(null);

  const list = resources.data ?? [];
  const sportList = sports.data ?? [];
  const blockedBy = activeBlockByResource(activeBlocks.data);
  // Implicit se editează prima resursă (ca în machetă).
  const effectiveId = selectedId ?? list[0]?.id ?? null;
  const selected = effectiveId && effectiveId !== 'new' ? (list.find((r) => r.id === effectiveId) ?? null) : null;

  const activeCount = list.filter((r) => r.active !== false).length;
  const inactiveCount = list.length - activeCount;

  function statusBadge(r: Resource) {
    if (r.active === false) return <Badge tone="neutral">{t('resources.status.inactive')}</Badge>;
    if (blockedBy.has(r.id)) return <Badge tone="danger">{t('resources.status.blocked')}</Badge>;
    return <Badge tone="success">{t('resources.status.active')}</Badge>;
  }

  const sportsOf = (r: Resource) =>
    (r.sport_ids ?? [])
      .map((id) => sportList.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => sportName(s, i18n.language))
      .join(', ');

  function setActive(r: Resource, active: boolean, done?: () => void) {
    toggle.mutate(
      { id: r.id, input: { active } },
      {
        onSuccess: () => {
          done?.();
          toast.success(t(active ? 'resources.toast.activated' : 'resources.toast.deactivated', { name: r.name }));
        },
        onError: () => toast.error(t('errors.generic')),
      },
    );
  }

  return (
    <>
      <PageHeader
        title={t('resources.title')}
        subtitle={t('resources.subtitle', { active: activeCount, inactive: inactiveCount })}
        actions={
          <Button
            variant="accent"
            size="lg"
            leftIcon={<Plus className="h-5 w-5" aria-hidden />}
            onClick={() => {
              setSelectedId('new');
              create.reset();
            }}
          >
            {t('resources.new')}
          </Button>
        }
      />

      {resources.isError ? (
        <ErrorState message={resources.error.message} onRetry={() => void resources.refetch()} />
      ) : resources.isPending || sports.isPending ? (
        <Skeleton className="h-[560px] rounded-3xl" />
      ) : list.length === 0 && selectedId !== 'new' ? (
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
                  const external = r.external_access ?? 'never';
                  const select = () => {
                    setSelectedId(r.id);
                    update.reset();
                  };
                  return (
                    <tr
                      key={r.id}
                      onClick={select}
                      className={cn('cursor-pointer border-b border-line last:border-b-0 transition-colors hover:bg-subtle', isSel && 'bg-brand-soft/60')}
                    >
                      <td className="py-3 pl-6 pr-3">
                        <button
                          type="button"
                          aria-pressed={isSel}
                          onClick={(e) => {
                            e.stopPropagation();
                            select();
                          }}
                          className="flex items-center gap-3 text-left"
                        >
                          <ResourceThumb src={r.photo_url ?? ''} className="h-12 w-12" />
                          <span>
                            <span className="block text-[15px] font-bold text-ink">{r.name}</span>
                            {r.type && <span className="block text-xs text-muted">{r.type}</span>}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[15px] text-muted">{sportsOf(r)}</td>
                      <td className="px-4 py-3 text-[15px] text-muted">{r.capacity}</td>
                      <td className="px-4 py-3">
                        <Badge tone={EXTERNAL_TONE[external]}>{t(`resources.externalShort.${external}`)}</Badge>
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
            blocked={selected ? blockedBy.get(selected.id) : undefined}
            sports={sportList}
            saving={create.isPending || update.isPending}
            saveError={selected ? update.error : create.error}
            onSave={(input) => {
              if (selected) {
                update.mutate({ id: selected.id, input }, { onSuccess: (r) => toast.success(t('resources.toast.saved', { name: r.name ?? input.name })) });
              } else {
                create.mutate(input, {
                  onSuccess: (created) => {
                    setSelectedId(created.id);
                    toast.success(t('resources.toast.created', { name: created.name ?? input.name }));
                  },
                });
              }
            }}
            onDeactivate={() => setConfirmDeactivate(true)}
            onActivate={() => selected && setActive(selected, true)}
            onBlock={() => selected && setBlocking({ id: selected.id, name: selected.name ?? '' })}
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
              loading={toggle.isPending}
              onClick={() => selected && setActive(selected, false, () => setConfirmDeactivate(false))}
            >
              {t('resources.deactivate')}
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-2xl bg-subtle p-3">
              <ResourceThumb src={selected.photo_url ?? ''} className="h-14 w-14" />
              <div>
                <p className="font-extrabold text-ink">{selected.name}</p>
                <p className="text-sm text-muted">
                  {sportsOf(selected)} · {t('resources.confirm.people', { count: selected.capacity ?? 0 })}
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
