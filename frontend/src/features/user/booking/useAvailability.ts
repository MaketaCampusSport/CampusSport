import { useQuery } from '@tanstack/react-query';
import { getAvailability } from '@/api/availability';
import { getSports } from '@/api/sports';

export function useAvailability(sportId: string, date: string) {
  return useQuery({
    queryKey: ['availability', sportId, date],
    queryFn: ({ signal }) => getAvailability(sportId, date, signal),
    enabled: Boolean(sportId && date),
  });
}

export function useSports() {
  return useQuery({
    queryKey: ['sports'],
    queryFn: ({ signal }) => getSports(signal),
    staleTime: 5 * 60 * 1000,
  });
}