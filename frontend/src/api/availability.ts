import { http } from './http';

export interface SlotDto {
  start: string; end: string;
  status: 'free' | 'occupied' | 'mine' | 'blocked';
  bookable: boolean;
  block_kind?: 'pe_class' | 'event' | 'maintenance' | 'emergency';
}
export interface AvailabilityDto {
  date: string;
  resources: { resource_id: string; resource_name: string; slots: SlotDto[] }[];
}

export const getAvailability = (sportId: string, date: string, signal?: AbortSignal) =>
  http.get<AvailabilityDto>('/availability', { sport: sportId, date }, signal);