import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { client, type AuditEntry, type ListAuditLogData } from '@/api/client';
import { keys } from '@/api/keys';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { toCsv } from '@/lib/csv';
import { fmtDayTime } from '@/lib/dates';
import { downloadText } from '@/lib/download';
import { toast } from '@/stores/toastStore';
import { Pagination } from '../shared/Pagination';

const PAGE_SIZE = 10;
const PERIODS = ['24h', '7d', '30d', '12m'] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_HOURS: Record<Period, number> = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '12m': 24 * 365 };
/** Valorile `entity` înregistrate de server (AuditService.record). */
const ENTITIES = ['occupancy', 'resource', 'sport', 'settings', 'user', 'announcement'] as const;

/** Tonul insignei după verbul acțiunii (`block.create` → `create`). */
function toneOf(action: string): BadgeTone {
  const verb = action.split('.').pop() ?? '';
  if (action === 'block.create' || verb === 'suspend' || verb === 'delete') return 'danger';
  if (verb === 'cancel' || verb === 'reschedule') return 'warn';
  if (verb === 'create' || verb === 'reactivate') return 'success';
  return 'brand';
}

/** Rezumatul obiectului: un nume sau motiv din `after`/`before`, altfel identificatorul. */
function summary(e: AuditEntry): string {
  const data = { ...(e.before ?? {}), ...(e.after ?? {}) } as Record<string, unknown>;
  for (const k of ['name', 'full_name', 'name_ro', 'reason', 'message_ro']) {
    if (typeof data[k] === 'string' && data[k]) return data[k] as string;
  }
  return e.entity_id ?? '';
}

/** Jurnal de audit (FR-45): doar citire, filtre după administrator, entitate și perioadă, export CSV. */
export default function AuditPage() {
  const { t } = useTranslation();
  const [now] = useState(() => new Date());
  const [actor, setActor] = useState('');
  const [entity, setEntity] = useState('');
  const [period, setPeriod] = useState<Period>('7d');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Contractul nu are o listă de actori: numele vin din lista administratorilor.
  const admins = useQuery({
    queryKey: keys.admins,
    queryFn: () => client.admin.users({ role: 'admin', page_size: 100 }),
    staleTime: 5 * 60_000,
  });
  const actorName = (id: string) => admins.data?.items.find((u) => u.id === id)?.full_name ?? id;

  const filters: ListAuditLogData['query'] = {
    ...(actor ? { actor } : {}),
    ...(entity ? { entity } : {}),
    from: new Date(now.getTime() - PERIOD_HOURS[period] * 3600_000).toISOString(),
  };
  const query = { ...filters, page, page_size: PAGE_SIZE };
  const audit = useQuery({ queryKey: keys.audit(query), queryFn: () => client.admin.auditLog(query), placeholderData: keepPreviousData });
  const d = audit.data;

  const actionLabel = (a: string) => t(`audit.actions.${a}`, { defaultValue: a });
  const entityLabel = (e: string) => t(`audit.entities.${e}`, { defaultValue: e });

  /** CSV construit în browser din toate paginile filtrului curent (serverul nu are export pentru jurnal). */
  async function exportCsv() {
    setExporting(true);
    try {
      const rows: AuditEntry[] = [];
      for (let p = 1; p <= 50; p++) {
        const res = await client.admin.auditLog({ ...filters, page: p, page_size: 100 });
        rows.push(...res.items);
        if (p * res.page_size >= res.total) break;
      }
      const csv = toCsv([
        [t('audit.col.when'), t('audit.col.who'), t('audit.col.action'), t('audit.col.entity'), 'entity_id', 'before', 'after'],
        ...rows.map((e) => [
          e.at,
          actorName(e.actor_id),
          actionLabel(e.action),
          entityLabel(e.entity),
          e.entity_id ?? '',
          e.before ? JSON.stringify(e.before) : '',
          e.after ? JSON.stringify(e.after) : '',
        ]),
      ]);
      downloadText(csv, 'jurnal-audit.csv');
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <Button variant="outline" size="lg" loading={exporting} leftIcon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void exportCsv()}>
            {t('audit.export')}
          </Button>
        }
      />

      <div className="mb-5 flex gap-3">
        <div className="w-60">
          <Select
            aria-label={t('audit.actor')}
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('audit.allActors')}</option>
            {(admins.data?.items ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-56">
          <Select
            aria-label={t('audit.entity')}
            value={entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('audit.allEntities')}</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {entityLabel(e)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            aria-label={t('audit.period')}
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as Period);
              setPage(1);
            }}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`audit.periods.${p}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {audit.isError ? (
        <ErrorState message={audit.error.message} onRetry={() => void audit.refetch()} />
      ) : !d ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : d.items.length === 0 ? (
        <Card>
          <EmptyState icon={<Search className="h-6 w-6" aria-hidden />} title={t('audit.emptyTitle')} description={t('audit.emptyBody')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="table-head pl-6">{t('audit.col.when')}</th>
                <th scope="col" className="table-head">{t('audit.col.who')}</th>
                <th scope="col" className="table-head">{t('audit.col.action')}</th>
                <th scope="col" className="table-head pr-6">{t('audit.col.object')}</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-b-0">
                  <td className="whitespace-nowrap py-3 pl-6 pr-3 text-sm text-muted">{fmtDayTime(e.at)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 text-[15px] font-semibold">
                      <Avatar name={actorName(e.actor_id)} tone="soft" size="sm" />
                      {actorName(e.actor_id)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={toneOf(e.action)}>{actionLabel(e.action)}</Badge>
                  </td>
                  <td className="py-3 pl-4 pr-6 text-[15px] text-ink">
                    <span className="text-muted">{entityLabel(e.entity)}</span>
                    {summary(e) && <> · {summary(e)}</>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination meta={d} onPage={setPage} />
        </Card>
      )}
    </>
  );
}
