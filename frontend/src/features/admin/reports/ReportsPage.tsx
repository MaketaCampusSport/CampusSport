import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { client, type MonthlyReport } from '@/api/client';
import { keys } from '@/api/keys';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { StatCard } from '@/components/ui/StatCard';
import { cap, fmt, fromMonthKey, toMonthKey } from '@/lib/dates';
import { downloadBlob } from '@/lib/download';
import { formatNumber, formatPercent } from '@/lib/format';
import { toast } from '@/stores/toastStore';
import { useResources } from '../shared/queries';

/** Vederea paginii peste `MonthlyReport`: procente 0–100, medii pe resurse și pe ore. */
export interface ReportView {
  occupancyPct: number;
  bookings: number;
  members: number;
  externals: number;
  noShows: number;
  atLimit: number;
  hourly: { hour: number; pct: number }[];
  perResource: { resourceId: string; name: string; pct: number }[];
}

const pct = (rate: number) => Math.round(rate * 1000) / 10;

export function toReportView(r: MonthlyReport): ReportView {
  const byHour = new Map<number, number[]>();
  for (const o of r.occupancy) for (const h of o.by_hour) byHour.set(h.hour, [...(byHour.get(h.hour) ?? []), h.rate]);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    occupancyPct: pct(avg(r.occupancy.map((o) => o.rate))),
    bookings: r.bookings_by_category.members + r.bookings_by_category.externals,
    members: r.bookings_by_category.members,
    externals: r.bookings_by_category.externals,
    noShows: r.no_shows_count,
    atLimit: r.users_reaching_limit_count,
    hourly: [...byHour.entries()].sort(([a], [b]) => a - b).map(([hour, rates]) => ({ hour, pct: Math.round(avg(rates) * 100) })),
    perResource: r.occupancy
      .map((o) => ({ resourceId: o.resource_id, name: o.resource_name, pct: Math.round(o.rate * 100) }))
      .sort((a, b) => b.pct - a.pct),
  };
}

/** Rapoarte lunare (FR-44): indicatori, ocupare pe ore și pe resurse, export CSV (PDF: încă 501 pe server). */
export default function ReportsPage() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(() => toMonthKey(new Date()));
  const [exporting, setExporting] = useState(false);
  const report = useQuery({ queryKey: keys.report(month), queryFn: () => client.admin.report(month) });
  const resources = useResources();

  const monthDate = fromMonthKey(month);
  const shift = (n: number) => setMonth(toMonthKey(new Date(monthDate.getFullYear(), monthDate.getMonth() + n, 1)));
  const isCurrent = month === toMonthKey(new Date());

  async function exportCsv() {
    setExporting(true);
    try {
      downloadBlob(await client.admin.reportFile(month, 'csv'), `raport-${month}.csv`);
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setExporting(false);
    }
  }

  const d = report.data ? toReportView(report.data) : null;
  const photoOf = (id: string) => resources.data?.find((r) => r.id === id)?.photo_url ?? '';
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
              <Button variant="ghost" size="sm" aria-label={t('reports.prevMonth')} onClick={() => shift(-1)}>
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </Button>
              <span className="min-w-36 text-center text-sm font-bold" aria-live="polite">
                {cap(fmt(monthDate, 'LLLL yyyy'))}
              </span>
              <Button variant="ghost" size="sm" aria-label={t('reports.nextMonth')} disabled={isCurrent} onClick={() => shift(1)}>
                <ChevronRight className="h-5 w-5" aria-hidden />
              </Button>
            </div>
            <Button variant="accent" size="lg" loading={exporting} leftIcon={<Download className="h-4 w-4" aria-hidden />} onClick={() => void exportCsv()}>
              {t('reports.exportCsv')}
            </Button>
          </>
        }
      />

      {report.isError ? (
        <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
      ) : !d ? (
        <Skeleton className="h-[520px] rounded-3xl" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-5">
            <StatCard label={t('reports.kpi.occupancy')} value={formatPercent(d.occupancyPct, 1)} tone="brand" />
            <StatCard label={t('reports.kpi.bookings')} value={formatNumber(d.bookings)} />
            <StatCard label={t('reports.kpi.noShows')} value={formatNumber(d.noShows)} tone="warn" />
            <StatCard label={t('reports.kpi.atLimit')} value={formatNumber(d.atLimit)} />
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
                      {d.hourly.map((h) => (
                        <Cell key={h.hour} fill={h.pct >= 85 ? chartColors.peak : chartColors.bar} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Alternativă accesibilă graficului (NFR-07). */}
              <table className="sr-only">
                <caption>{t('reports.hourly')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('reports.hour')}</th>
                    <th scope="col">{t('reports.kpi.occupancy')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.hourly.map((h) => (
                    <tr key={h.hour}>
                      <th scope="row">{h.hour}:00</th>
                      <td>{h.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-6">
              <h2 className="heading text-lg">{t('reports.perResource')}</h2>
              <ul className="mt-4 space-y-4">
                {d.perResource.map((r) => (
                  <li key={r.resourceId} className="flex items-center gap-3">
                    <ResourceThumb src={photoOf(r.resourceId)} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-sm font-semibold">
                        <span>{r.name}</span>
                        <span>{r.pct}%</span>
                      </div>
                      <div
                        className="mt-1 h-2 overflow-hidden rounded-full bg-subtle"
                        role="progressbar"
                        aria-label={r.name}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={r.pct}
                      >
                        <div className="h-full rounded-full bg-brand" style={{ width: `${r.pct}%` }} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm text-muted">{t('reports.byCategory', { members: formatNumber(d.members), externals: formatNumber(d.externals) })}</p>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
