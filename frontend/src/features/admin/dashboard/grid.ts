import type { Dashboard, Resource, Slot } from '@/api/client';
import { fromDateKey } from '@/lib/dates';

/** Culorile grilei din panou: sloturile contractului (`SlotState` + `block_kind`) pe înțelesul administratorului. */
export type CellState = 'free' | 'booked' | 'pe_class' | 'event' | 'blocked';

export interface GridCell {
  start: string;
  end: string;
  /** Minute de la miezul nopții (ora locală). */
  from: number;
  to: number;
  state: CellState;
  holder?: string;
}

export interface GridRow {
  resourceId: string;
  name: string;
  photoUrl: string;
  cells: GridCell[];
}

export interface DayGridData {
  rows: GridRow[];
  /** Prima și ultima oră afișată (ore întregi). */
  firstHour: number;
  lastHour: number;
}

export function cellState(slot: Slot): CellState {
  if (slot.status === 'free') return 'free';
  if (slot.status === 'occupied' || slot.status === 'mine') return 'booked';
  if (slot.block_kind === 'pe_class') return 'pe_class';
  if (slot.block_kind === 'event') return 'event';
  return 'blocked';
}

export function toDayGrid(d: Dashboard, resources: Resource[] | undefined): DayGridData {
  const midnight = fromDateKey(d.date).getTime();
  const minutes = (iso: string) => Math.round((new Date(iso).getTime() - midnight) / 60_000);
  let first = Infinity;
  let last = -Infinity;
  const rows = d.resources.map((r): GridRow => {
    const cells = r.slots.map((s): GridCell => {
      const from = minutes(s.start);
      const to = minutes(s.end);
      first = Math.min(first, from);
      last = Math.max(last, to);
      return { start: s.start, end: s.end, from, to, state: cellState(s), holder: s.holder_name };
    });
    return {
      resourceId: r.resource_id,
      name: r.resource_name,
      photoUrl: resources?.find((x) => x.id === r.resource_id)?.photo_url ?? '',
      cells,
    };
  });
  if (!Number.isFinite(first)) return { rows, firstHour: 8, lastHour: 22 };
  return { rows, firstHour: Math.max(0, Math.floor(first / 60)), lastHour: Math.min(24, Math.ceil(last / 60)) };
}

/** Indicatorii zilei. Rezervările și ocuparea se calculează din sloturi; check-in / no-show vin de la server. */
export function dashboardKpis(d: Dashboard) {
  const slots = d.resources.flatMap((r) => r.slots);
  const bookings = slots.filter((s) => s.status === 'occupied' || s.status === 'mine').length;
  const usable = slots.filter((s) => s.status !== 'blocked').length;
  return {
    bookings,
    checkIns: d.check_ins_count,
    noShows: d.no_shows_count,
    occupancyPct: usable ? Math.round((bookings / usable) * 100) : 0,
  };
}
