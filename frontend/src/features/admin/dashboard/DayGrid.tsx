import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Block } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { ResourceThumb } from '@/components/ui/ResourceThumb';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { fmtTime } from '@/lib/dates';
import type { CellState, DayGridData } from './grid';

export const CELL_STYLES: Record<CellState, string> = {
  free: 'bg-subtle',
  booked: 'bg-brand',
  pe_class: 'bg-warn-soft',
  event: 'bg-sun',
  blocked: 'bg-danger-soft',
};

const LEGEND: CellState[] = ['free', 'booked', 'pe_class', 'event', 'blocked'];

interface Props {
  data: DayGridData;
  /** Blocarea activă acum, per resursă. */
  blockedBy: Map<string, Block>;
  onBlock: (resource: { id: string; name: string }) => void;
}

/**
 * Grila zilei (FR-43): o linie pe resursă, câte un segment pe slot (durata slotului diferă între resurse),
 * cu butonul de blocare de urgență pe fiecare resursă (UI-08). Orele închise rămân goale.
 */
export function DayGrid({ data, blockedBy, onBlock }: Props) {
  const { t } = useTranslation();
  const span = Math.max(1, data.lastHour - data.firstHour) * 60;
  const hours = Array.from({ length: data.lastHour - data.firstHour }, (_, i) => data.firstHour + i);
  const pos = (from: number, to: number) => ({
    left: `${((from - data.firstHour * 60) / span) * 100}%`,
    width: `${((to - from) / span) * 100}%`,
  });
  const GRID = 'grid grid-cols-[280px_minmax(0,1fr)] items-center';

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
        <div role="row" className={cn(GRID, 'border-b border-line pb-3')}>
          <span role="columnheader" className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t('dashboard.resource')}
          </span>
          <span role="columnheader" className="relative h-4">
            <span className="sr-only">{t('dashboard.hours')}</span>
            {hours.map((h) =>
              h % 2 === 0 ? (
                <span key={h} aria-hidden className="absolute text-xs font-semibold text-muted" style={{ left: pos(h * 60, h * 60 + 60).left }}>
                  {`${h}:00`}
                </span>
              ) : null,
            )}
          </span>
        </div>

        {data.rows.map((row) => {
          const block = blockedBy.get(row.resourceId);
          return (
            <div key={row.resourceId} role="row" className={cn(GRID, 'border-b border-line py-3 last:border-b-0')}>
              <div role="rowheader" className="flex items-center gap-3 pr-4">
                <ResourceThumb src={row.photoUrl} className="h-14 w-14" />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-ink">{row.name}</p>
                  {block ? (
                    <Link
                      to="/admin/blocks"
                      className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-danger-strong px-3 py-1 text-xs font-bold text-white"
                    >
                      <Lock className="h-3.5 w-3.5" aria-hidden />
                      {t('dashboard.blockedLabel', { kind: t(`dashboard.blockedKind.${block.kind}`) })}
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

              <div role="cell" className="relative h-11">
                {row.cells.length === 0 && <span className="text-sm text-muted">{t('dashboard.closed')}</span>}
                {row.cells.map((cell) => {
                  const range = `${fmtTime(cell.start)}–${fmtTime(cell.end)}`;
                  const text = `${range} · ${t(`dashboard.state.${cell.state}`)}${cell.holder ? ` · ${cell.holder}` : ''}`;
                  return (
                    <span key={cell.start} className="absolute inset-y-0 px-[3px]" style={pos(cell.from, cell.to)}>
                      <Tooltip content={text}>
                        <button
                          type="button"
                          aria-label={`${row.name} · ${text}`}
                          className={cn('block h-11 w-full rounded-xl transition-transform hover:scale-[1.06]', CELL_STYLES[cell.state])}
                        />
                      </Tooltip>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
