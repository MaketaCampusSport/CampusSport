import type { WeeklyHours } from '../../database/entities';
import { Interval, overlaps, slotsForDay } from '../availability/slots';

export interface AlternativeResource {
  id: string;
  name: string;
  openingHours: WeeklyHours;
  slotMinutes: number;
}

export interface Suggestion {
  resourceId: string;
  resourceName: string;
  start: Date;
  end: Date;
}

/**
 * SDD 7.3: the cancellation notice offers 2–3 alternatives — free future slots the same day on
 * compatible resources, closest in time to the cancelled one.
 */
export function pickAlternatives(input: {
  resources: AlternativeResource[];
  occupied: { resourceId: string; start: Date; end: Date | null }[];
  original: Interval;
  day: string;
  zone: string;
  now: Date;
  limit?: number;
}): Suggestion[] {
  const candidates: Suggestion[] = [];
  for (const r of input.resources) {
    const busy = input.occupied.filter((o) => o.resourceId === r.id);
    for (const slot of slotsForDay(r.openingHours, r.slotMinutes, input.day, input.zone)) {
      if (slot.start <= input.now || busy.some((o) => overlaps(o, slot))) continue;
      candidates.push({ resourceId: r.id, resourceName: r.name, start: slot.start, end: slot.end });
    }
  }
  const target = input.original.start.getTime();
  return candidates
    .sort((a, b) => Math.abs(a.start.getTime() - target) - Math.abs(b.start.getTime() - target) || a.resourceName.localeCompare(b.resourceName))
    .slice(0, input.limit ?? 3);
}
