import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { CellState, DashboardData } from '@/api/types';
import { Card } from '@/components/ui/Card';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';

export const CELL_STYLES: Record<CellState, string> = {
  free: 'bg-subtle',
  booked: 'bg-brand',
  pe_class: 'bg-warn-soft',
  event: 'bg-sun',
  blocked: 'bg-danger-soft',
  closed: 'border border-dashed border-line bg-transparent',
};

const LEGEND: CellState[] = ['free', 'booked', 'pe_class', 'event', 'blocked'];

const GRID = 'grid items-center gap-x-1.5';

interface Props {
  data: DashboardData;
  onBlock: (resource: { id: string; name: string }) => void;
}

/** Grila zilei: o linie pe resursă, o celulă pe oră (FR-43), cu butonul de blocare de urgență pe fiecare resursă (UI-08). */
export function DayGrid({ data, onBlock }: Props) {
  const { t } = useTranslation();
  const style = { gridTemplateColumns: `280px repeat(${data.hours.length}, minmax(0, 1fr))` };
  const pad = (h: number) => String(h).padStart(2, '0');

  return (
    <Card className="overflow-x-auto p-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2" aria-label={t('dashboard.legend')} role="group">
        {LEGEND.map((s) => (
          <span key={s} className="flex items-center gap-2 text-xs font-semibold text-muted">
            <span aria-hidden className={cn('h-3.5 w-3.5 rounded-md', CELL_STYLES[s])} />
            {t(`dashboard.state.${s}`)}
          </span>
        ))}
      </div>

      <div role="table" aria-label={t('dashboard.gridLabel')} className="min-w-[960px]">
        <div role="row" className={cn(GRID, 'border-b border-line pb-3')} style={style}>
          <span role="columnheader" className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t('dashboard.resource')}
          </span>
          {data.hours.map((h) => (
            <span key={h} role="columnheader" className="text-xs font-semibold text-muted">
              {h % 2 === 0 ? `${h}:00` : <span className="sr-only">{`${h}:00`}</span>}
            </span>
          ))}
        </div>

        {data.rows.map((row) => (
          <div key={row.resourceId} role="row" className={cn(GRID, 'border-b border-line py-3 last:border-b-0')} style={style}>
            <div role="rowheader" className="flex items-center gap-3 pr-4">
              <ResourceThumb src={row.photoUrl} className="h-14 w-14" />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-ink">{row.name}</p>
                {row.blocked ? (
                  <Link
                    to="/admin/blocks"
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-danger-strong px-3 py-1 text-xs font-bold text-white"
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                    {t('dashboard.blockedLabel', { kind: t(`dashboard.blockedKind.${row.blockedLabel ?? 'emergency'}`) })}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => onBlock({ id: row.resourceId, name: row.name })}
                    aria-label={t('dashboard.blockNow', { name: row.name })}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger-ink transition-colors hover:brightness-95"
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden />
                    {t('dashboard.block')}
                  </button>
                )}
              </div>
            </div>

            {row.cells.map((cell) => {
              const range = `${pad(cell.hour)}:00–${pad(cell.hour + 1)}:00`;
              const text = `${row.name} · ${range} · ${t(`dashboard.state.${cell.state}`)}${cell.label ? ` · ${cell.label}` : ''}`;
              return (
                <div key={cell.hour} role="cell">
                  <Tooltip content={`${range} · ${t(`dashboard.state.${cell.state}`)}${cell.label ? ` · ${cell.label}` : ''}`}>
                    <button
                      type="button"
                      aria-label={text}
                      className={cn('block h-11 w-full rounded-xl transition-transform hover:scale-[1.06]', CELL_STYLES[cell.state])}
                    />
                  </Tooltip>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}
