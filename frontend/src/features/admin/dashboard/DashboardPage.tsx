import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { client } from '@/api/client';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { addDays, fmtLongDay, fromDateKey, toDateKey, toMonthKey } from '@/lib/dates';
import { downloadBlob } from '@/lib/download';
import { toast } from '@/stores/toastStore';
import { EmergencyBlockDialog } from '../blocks/EmergencyBlockDialog';
import { activeBlockByResource, resourceName, useActiveBlocks, useResources } from '../shared/queries';
import { DayGrid } from './DayGrid';
import { EmergencyBanner } from './EmergencyBanner';
import { dashboardKpis, toDayGrid } from './grid';

/** Panoul zilei (FR-43): indicatori + grila resurselor, cu blocare de urgență din 2 acțiuni. */
export default function DashboardPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const todayKey = toDateKey(new Date());
  const dateKey = params.get('date') ?? todayKey;
  const date = fromDateKey(dateKey);
  const [blocking, setBlocking] = useState<{ id: string; name: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const resources = useResources();
  const activeBlocks = useActiveBlocks();

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: keys.dashboard(dateKey),
    queryFn: () => client.admin.dashboard(dateKey),
    // Panoul rămâne la zi fără reîncărcare manuală (rezervări noi, check-in-uri).
    refetchInterval: 30_000,
  });

  function go(offset: number) {
    const next = toDateKey(addDays(date, offset));
    setParams(next === todayKey ? {} : { date: next }, { replace: true });
  }

  async function exportReport() {
    setExporting(true);
    try {
      const month = toMonthKey(date);
      downloadBlob(await client.admin.reportFile(month, 'csv'), `raport-${month}.csv`);
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setExporting(false);
    }
  }

  const blockedBy = activeBlockByResource(activeBlocks.data);
  const emergencies = (activeBlocks.data ?? []).filter((b) => b.kind === 'emergency');
  const kpis = data ? dashboardKpis(data) : null;

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label={t('dashboard.prevDay')}
              className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <span aria-live="polite">{fmtLongDay(date)}</span>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label={t('dashboard.nextDay')}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-ink"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            {dateKey !== todayKey && (
              <button
                type="button"
                onClick={() => setParams({}, { replace: true })}
                className="ml-1 rounded-full px-3 py-1 text-sm font-bold text-brand-text hover:bg-brand-soft"
              >
                {t('dashboard.today')}
              </button>
            )}
          </span>
        }
        actions={
          <Button variant="outline" size="lg" loading={exporting} leftIcon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void exportReport()}>
            {t('dashboard.export')}
          </Button>
        }
      />

      {emergencies.map((b) => (
        <EmergencyBanner key={b.id} block={b} resourceName={resourceName(resources.data, b.resource_id)} />
      ))}

      {isError ? (
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      ) : isPending || !kpis ? (
        <div className="space-y-5" aria-busy="true">
          <div className="grid grid-cols-4 gap-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[118px] rounded-3xl" />
            ))}
          </div>
          <Skeleton className="h-[520px] rounded-3xl" />
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-4 gap-5">
            <StatCard label={t('dashboard.kpi.bookings')} value={kpis.bookings} />
            <StatCard label={t('dashboard.kpi.checkIns')} value={kpis.checkIns} tone="success" />
            <StatCard label={t('dashboard.kpi.noShows')} value={kpis.noShows} tone="danger" />
            <StatCard label={t('dashboard.kpi.occupancy')} value={`${kpis.occupancyPct}%`} tone="brand" />
          </div>

          <DayGrid data={toDayGrid(data, resources.data)} blockedBy={blockedBy} onBlock={setBlocking} />
        </>
      )}

      <EmergencyBlockDialog resource={blocking} onClose={() => setBlocking(null)} />
    </>
  );
}
