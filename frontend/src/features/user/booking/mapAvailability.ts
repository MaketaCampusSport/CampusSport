import type { SlotDto } from '@/api/availability';

export type SlotStatus = 'free' | 'occupied' | 'my_booking' | 'pe_class';

export interface TimeSlotItem {
  id: string;
  time: string;
  endTime: string;
  status: SlotStatus;
}

export interface SelectedSlotSummary {
  sportId: string;
  sportName: string;
  resourceId: string;
  resourceName: string;
  location: string;
  dayId: string;
  dayLabel: string;
  slotId: string;
  time: string;
  endTime: string;
}

export function toSlotStatus(s: SlotDto): SlotStatus {
  if (s.status === 'mine') return 'my_booking';
  if (s.status === 'blocked') return s.block_kind === 'pe_class' ? 'pe_class' : 'occupied';
  return s.status; // 'free' | 'occupied'
}

export const toSlotItem = (prefix: string, s: SlotDto): TimeSlotItem => ({
  id: `${prefix}-${s.start}`,
  time: s.start.slice(11, 16),
  endTime: s.end.slice(11, 16),
  status: s.status === 'free' && !s.bookable ? 'occupied' : toSlotStatus(s),
});