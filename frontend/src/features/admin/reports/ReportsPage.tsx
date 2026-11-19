import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/api/endpoints';
import { keys } from '@/api/keys';
import type { ExportFormat, Kpi } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { StatCard } from '@/components/ui/StatCard';
import { cap, fmt, fromMonthKey, toMonthKey } from '@/lib/dates';
import { downloadBlob } from '@/lib/download';
import { formatDelta, formatNumber, formatPercent } from '@/lib/format';
import { toast } from '@/stores/toastStore';

function Delta({ kpi, invert }: { kpi: Kpi; invert?: boolean }) {
  const { t } = useTranslation();
  if (kpi.deltaPct === undefined) return null;
  const good = invert ? kpi.deltaPct <= 0 : kpi.deltaPct >= 0;
  return (
    <span className={good ? 'text-sm font-bold text-success-ink' : 'text-sm font-bold text-danger-ink'}>
      {formatDelta(kpi.deltaPct, 1)} <span className="sr-only">{t('reports.vsPrevious')}</span>
    </span>
  );
}

/** Rapoarte lunare (FR-45): indicatori, ocupare pe ore și pe resurse, export CSV/PDF. */
export default function ReportsPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const report = useQuery({ queryKey: keys.report(month), queryFn: () => api.reports.get(month) });

  const monthDate = fromMonthKey(month);
  const shift = (n: number) => setMonth(toMonthKey(new Date(monthDate.getFullYear(), monthDate.getMonth() + n, 1)));
  const isCurrent = month === toMonthKey(new Date());

  async function doExport(format: ExportFormat) {
    setExporting(format);
    try {
      downloadBlob(await api.reports.export(month, format), `raport-${month}.${format}`);
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setExporting(null);
    }
  }

  const d = report.data;
   const chartColors = {
    bar: 'rgb(var(--c-brand))',
    peak: 'rgb(var(--c-sun))',
    grid: 'rgb(var(--c-line))',
    tick: 'rgb(var(--c-muted))',
  };

  return (
    <>
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-full bg-surface p-1 shadow-card">
              <Button variant="ghost" size="sm" aria-label={t('reports.prevMonth')} onClick={() => shift(-1)}><ChevronLeft className="h-5 w-5" aria-hidden /></Button>
              <span className="min-w-36 text-center text-sm font-bold" aria-live="polite">{cap(fmt(monthDate, 'LLLL yyyy'))}</span>
              <Button variant="ghost" size="sm" aria-label={t('reports.nextMonth')} disabled={isCurrent} onClick={() => shift(1)}><ChevronRight className="h-5 w-5" aria-hidden /></Button>
            </div>
            <Button variant="outline" size="lg" loading={exporting === 'csv'} leftIcon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void doExport('csv')}>CSV</Button>
            <Button variant="accent" size="lg" loading={exporting === 'pdf'} leftIcon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void doExport('pdf')}>PDF</Button>
          </>
        }
      />

      {report.isError ? (
        <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
      ) : report.isPending || !d ? (
        <Skeleton className="h-[520px] rounded-3xl" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-5">
            <StatCard label={t('reports.kpi.occupancy')} value={formatPercent(d.kpis.occupancy.value)} tone="brand" aside={<Delta kpi={d.kpis.occupancy} />} />
            <StatCard label={t('reports.kpi.bookings')} value={formatNumber(d.kpis.bookings.value)} aside={<Delta kpi={d.kpis.bookings} />} />
            <StatCard label={t('reports.kpi.noShow')} value={formatPercent(d.kpis.noShowRate.value, 1)} tone="warn" aside={<Delta kpi={d.kpis.noShowRate} invert />} />
            <StatCard label={t('reports.kpi.atLimit')} value={formatNumber(d.kpis.studentsAtLimit.value)} aside={<Delta kpi={d.kpis.studentsAtLimit} invert />} />
          </div>

          <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6">
            <Card className="p-6">
              <h2 className="heading text-lg">{t('reports.hourly')}</h2>
              <div className="mt-4 h-72" role="img" aria-label={t('reports.hourlyAlt')}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.hourly} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid vertical={false} stroke={chartColors.grid} />
                    <XAxis dataKey="hour" tickFormatter={(h: number) => `${h}`} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: chartColors.tick }} />
                    <YAxis tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} tickLine={false} axisLine={false} fontSize={12} tick={{ fill: chartColors.tick }} />
                    <Tooltip
                      formatter={(v) => `${v}%`}
                      labelFormatter={(h) => `${h}:00`}
                      cursor={{ fill: 'rgb(var(--c-brand) / 0.08)' }}
                      contentStyle={{
                        background: 'rgb(var(--c-surface))',
                        border: '1px solid rgb(var(--c-line))',
                        borderRadius: 12,
                        color: 'rgb(var(--c-ink))',
                      }}
                    />
                    <Bar dataKey="pct" radius={[6, 6, 0, 0]}>
                      {d.hourly.map((h) => <Cell key={h.hour} fill={h.pct >= 85 ? chartColors.peak : chartColors.bar} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Alternativă accesibilă graficului (NFR-07). */}
              <table className="sr-only">
                <caption>{t('reports.hourly')}</caption>
                <thead><tr><th scope="col">{t('reports.hour')}</th><th scope="col">{t('reports.kpi.occupancy')}</th></tr></thead>
                <tbody>{d.hourly.map((h) => <tr key={h.hour}><th scope="row">{h.hour}:00</th><td>{h.pct}%</td></tr>)}</tbody>
              </table>
            </Card>

            <Card className="p-6">
              <h2 className="heading text-lg">{t('reports.perResource')}</h2>
              <ul className="mt-4 space-y-4">
                {d.perResource.map((r) => (
                  <li key={r.resourceId} className="flex items-center gap-3">
                    <ResourceThumb src={r.photoUrl} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-sm font-semibold"><span>{r.name}</span><span>{r.pct}%</span></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-label={r.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.pct}>
                        <div className="h-full rounded-full bg-brand" style={{ width: `${r.pct}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm text-muted">{t('reports.members', { members: d.kpis.members, external: d.kpis.external })}</p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
