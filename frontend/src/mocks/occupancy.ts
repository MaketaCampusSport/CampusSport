import { addDays, addHours, differenceInCalendarDays, startOfDay } from 'date-fns';
import type { Block, BlockStatus, CellState, DashboardCell, Resource } from '@/api/types';
import { db, HOURS, POPULARITY, type DbBlock } from './db';

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PEOPLE = [
  'Andrei Popescu', 'Mihai Ionescu', 'Diana Rusu', 'Ion Moraru', 'Elena Stan', 'Radu Marin',
  'Ioana Dumitru', 'Alex Vasilescu', 'Teodora Pavel', 'Vlad Munteanu', 'Cristina Toma', 'Bogdan Lazăr',
];

const CURVE = [0.25, 0.4, 0.35, 0.5, 0.6, 0.45, 0.55, 0.75, 0.9, 1, 0.95, 0.8, 0.55, 0.35];

export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

export function cellKey(resourceId: string, day: Date, hour: number): string {
  return `${resourceId}|${dateKey(day)}|${hour}`;
}

function blockWindowCovers(b: DbBlock, start: Date, end: Date): boolean {
  const bStart = new Date(b.startsAt);
  const bEnd = b.endsAt ? new Date(b.endsAt) : null;
  const released = b.releasedAt ? new Date(b.releasedAt) : null;
  if (released && start >= released) return false;

  if (b.recurrence === 'none') {
    const effEnd = released && bEnd ? (released < bEnd ? released : bEnd) : (released ?? bEnd);
    return bStart < end && (effEnd === null || effEnd > start);
  }
  if (!bEnd) return false;
  const day = startOfDay(start);
  if (day < startOfDay(bStart)) return false;
  if (b.recurrence === 'weekly' && isoWeekday(day) !== isoWeekday(bStart)) return false;
  const ws = new Date(day);
  ws.setHours(bStart.getHours(), bStart.getMinutes(), 0, 0);
  const we = new Date(day);
  we.setHours(bEnd.getHours(), bEnd.getMinutes(), 0, 0);
  return ws < end && we > start;
}

function findBlock(resourceId: string, start: Date, end: Date, excludeId?: string): DbBlock | undefined {
  return db.blocks.find(
    (b) => b.resourceId === resourceId && b.id !== excludeId && blockWindowCovers(b, start, end),
  );
}

export interface DayOptions {
  excludeBlockId?: string;
}

/** Starea fiecărei ore dintr-o zi, pentru o resursă. Prioritatea (SRS 9.1): blocare > curs EF > eveniment > rezervare. */
export function cellsForDay(resource: Resource, day: Date, opts: DayOptions = {}): DashboardCell[] {
  const openH = Number(resource.opensAt.split(':')[0]);
  const closeH = Number(resource.closesAt.split(':')[0]);
  const weekday = isoWeekday(day);
  const dk = dateKey(day);

  return HOURS.map((hour): DashboardCell => {
    if (hour < openH || hour >= closeH) return { hour, state: 'closed' };

    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = addHours(start, 1);

    const block = findBlock(resource.id, start, end, opts.excludeBlockId);
    if (block) return { hour, state: 'blocked', label: block.reason };

    const ef = db.efClasses.find((c) => c.resourceId === resource.id && c.weekday === weekday && hour >= c.from && hour < c.to);
    if (ef) return { hour, state: 'pe_class', label: ef.course };

    const ev = db.events.find((e) => e.resourceIds.includes(resource.id) && new Date(e.startsAt) < end && new Date(e.endsAt) > start);
    if (ev) return { hour, state: 'event', label: ev.name };

    if (!db.cancelled.has(cellKey(resource.id, day, hour))) {
      const r = rng(hash(`${resource.id}|${dk}|${hour}`));
      const weekendBoost = weekday >= 6 ? 1.1 : 1;
      const p = (POPULARITY[resource.id] ?? 0.4) * (CURVE[hour - 8] ?? 0.4) * weekendBoost;
      if (r() < p) return { hour, state: 'booked', label: PEOPLE[Math.floor(r() * PEOPLE.length)] };
    }
    return { hour, state: 'free' };
  });
}

/** Câte rezervări active se suprapun cu intervalul (folosit pentru „N rezervări vor fi anulate”). */
export function countAffected(resource: Resource, from: Date, to: Date | null, excludeBlockId?: string): number {
  const limit = addDays(from, 30);
  const end = to && to < limit ? to : limit;
  let count = 0;
  const days = differenceInCalendarDays(end, from);
  for (let i = 0; i <= days; i++) {
    const day = startOfDay(addDays(from, i));
    for (const cell of cellsForDay(resource, day, { excludeBlockId })) {
      if (cell.state !== 'booked') continue;
      const cs = new Date(day);
      cs.setHours(cell.hour, 0, 0, 0);
      if (addHours(cs, 1) > from && cs < end) count++;
    }
  }
  return count;
}

/** Marchează ca anulate rezervările din interval, ca să nu „reapară” după deblocare. */
export function cancelBookings(resource: Resource, from: Date, to: Date | null, excludeBlockId?: string): number {
  const limit = addDays(from, 30);
  const end = to && to < limit ? to : limit;
  let count = 0;
  const days = differenceInCalendarDays(end, from);
  for (let i = 0; i <= days; i++) {
    const day = startOfDay(addDays(from, i));
    for (const cell of cellsForDay(resource, day, { excludeBlockId })) {
      if (cell.state !== 'booked') continue;
      const cs = new Date(day);
      cs.setHours(cell.hour, 0, 0, 0);
      if (addHours(cs, 1) > from && cs < end) {
        db.cancelled.add(cellKey(resource.id, day, cell.hour));
        count++;
      }
    }
  }
  return count;
}

export function blockStatus(b: DbBlock, now = new Date()): BlockStatus {
  const start = new Date(b.startsAt);
  const end = b.endsAt ? new Date(b.endsAt) : null;
  const released = b.releasedAt ? new Date(b.releasedAt) : null;
  if (b.recurrence !== 'none') {
    if (released) return 'history';
    return blockWindowCovers(b, now, new Date(now.getTime() + 1)) ? 'active' : 'planned';
  }
  if (released && released <= now) return 'history';
  if (end && end <= now) return 'history';
  if (start > now) return 'planned';
  return 'active';
}

export function toBlockDto(b: DbBlock): Block {
  const resource = db.resources.find((r) => r.id === b.resourceId);
  return {
    id: b.id,
    resourceId: b.resourceId,
    resourceName: resource?.name ?? b.resourceId,
    resourcePhotoUrl: resource?.photoUrl ?? '',
    kind: b.kind,
    reason: b.reason,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    recurrence: b.recurrence,
    affectedCount: b.affectedCount,
    status: blockStatus(b),
    createdBy: b.createdBy,
    hasDelivery: b.hasDelivery,
    releasedAt: b.releasedAt,
  };
}

/** Resursa se află acum sub o blocare? (pentru coloana „Stare” și butonul din panou) */
export function currentBlock(resourceId: string, now = new Date()): DbBlock | undefined {
  return db.blocks.find(
    (b) => b.resourceId === resourceId && blockStatus(b, now) === 'active' && blockWindowCovers(b, now, new Date(now.getTime() + 1)),
  );
}

export const STATE_ORDER: CellState[] = ['free', 'booked', 'pe_class', 'event', 'blocked', 'closed'];
