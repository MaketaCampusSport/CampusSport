import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/endpoints';
import { keys } from '@/api/keys';
import type { Resource, Sport } from '@/api/types';

export function useSports() {
  return useQuery({ queryKey: keys.sports, queryFn: () => api.catalog.sports(), staleTime: 5 * 60_000 });
}

export function useResources() {
  return useQuery({ queryKey: keys.resources, queryFn: () => api.catalog.resources() });
}

/** Numele unui sport în limba curentă. */
export function sportName(sport: Sport, lng: string): string {
  return lng.startsWith('en') ? sport.nameEn : sport.nameRo;
}

export function activeResources(list: Resource[] | undefined): Resource[] {
  return (list ?? []).filter((r) => r.active);
}
