import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/api/endpoints';
import { keys } from '@/api/keys';
import type { AuditAction, AuditPeriod, AuditQuery } from '@/api/types';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/fields';
import { PageHeader } from '@/components/ui/PageHeader';
import { fmtDayTime } from '@/lib/dates';
import { downloadBlob } from '@/lib/download';
import { toast } from '@/stores/toastStore';

const PAGE_SIZE = 10;
const PERIODS: AuditPeriod[] = ['24h', '7d', '30d', '12m'];

function toneOf(a: AuditAction): BadgeTone {
  if (a === 'emergency_block' || a === 'account_suspended') return 'danger';
  if (a === 'planned_block' || a === 'block_updated' || a === 'rule_changed' || a === 'sport_deleted') return 'warn';
  if (
    a === 'unblock' ||
    a === 'resource_activated' ||
    a === 'resource_created' ||
    a === 'sport_created' ||
    a === 'account_reactivated' ||
    a === 'twofa_enabled'
  ) {
    return 'success';
  }
  return 'brand';
}


/** Jurnal de audit (FR-45): doar citire, căutare, filtre, export CSV. */
export default function AuditPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [actorId, setActorId] = useState('');
  const [period, setPeriod] = useState<AuditPeriod>('7d');
  const [page, setPage] = useState(1);

  // Căutarea pornește după o scurtă pauză de tastare.
  useEffect(() => {
    const id = setTimeout(() => { setQ(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  const query: AuditQuery = { q: q || undefined, actorId: actorId || undefined, period, page, pageSize: PAGE_SIZE };
  const audit = useQuery({ queryKey: keys.audit(query), queryFn: () => api.audit.list(query), placeholderData: keepPreviousData });
  const d = audit.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.pageSize)) : 1;

  async function exportCsv() {
    try {
      downloadBlob(await api.audit.exportCsv({ q: query.q, actorId: query.actorId, period }), 'jurnal-audit.csv');
    } catch {
      toast.error(t('errors.generic'));
    }
  }

  return (
    <>
      <PageHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={<Button variant="outline" size="lg" leftIcon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void exportCsv()}>{t('audit.export')}</Button>}
      />

      <div className="mb-5 flex gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" className="pl-12" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('audit.search')} aria-label={t('audit.search')} />
        </div>
        <div className="w-56">
          <Select aria-label={t('audit.actor')} value={actorId} onChange={(e) => { setActorId(e.target.value); setPage(1); }}>
            <option value="">{t('audit.allActors')}</option>
            {(d?.actors ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </div>
        <div className="w-52">
          <Select aria-label={t('audit.period')} value={period} onChange={(e) => { setPeriod(e.target.value as AuditPeriod); setPage(1); }}>
            {PERIODS.map((p) => <option key={p} value={p}>{t(`audit.periods.${p}`)}</option>)}
          </Select>
        </div>
      </div>

      {audit.isError ? (
        <ErrorState message={audit.error.message} onRetry={() => void audit.refetch()} />
      ) : !d ? (
        <Skeleton className="h-96 rounded-3xl" />
      ) : d.items.length === 0 ? (
        <Card><EmptyState icon={<Search className="h-6 w-6" aria-hidden />} title={t('audit.emptyTitle')} description={t('audit.emptyBody')} /></Card>
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
                  <td className="px-4 py-3"><span className="flex items-center gap-2 text-[15px] font-semibold"><Avatar name={e.actor.name} tone="soft" size="sm" />{e.actor.name}</span></td>
                  <td className="px-4 py-3"><Badge tone={toneOf(e.action)}>{t(`audit.actions.${e.action}`)}</Badge></td>
                  <td className="py-3 pl-4 pr-6 text-[15px] text-ink">{e.object}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-6 py-3">
            <p className="text-sm text-muted" aria-live="polite">{t('audit.pageInfo', { page: d.page, pages, total: d.total })}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} aria-label={t('audit.prev')} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
              <Button variant="outline" size="sm" disabled={page >= pages} aria-label={t('audit.next')} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}
