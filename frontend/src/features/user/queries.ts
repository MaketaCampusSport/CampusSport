import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { client } from '@/api/client';
import { USE_MOCKS } from '@/api/config';
import type { BookingCreate, NotificationPreferences, WaitlistJoin } from '@/api/generated';
import { useSession } from '@/auth/sessionStore';

/** Chei TanStack Query ale aplicației utilizatorilor (separate de cele ale panoului de admin). */
export const memberKeys = {
  sports: ['member', 'sports'] as const,
  resource: (id: string) => ['member', 'resource', id] as const,
  availability: (sport: string, date: string) => ['member', 'availability', sport, date] as const,
  availabilityAll: ['member', 'availability'] as const,
  quota: ['member', 'quota'] as const,
  bookings: (scope: 'upcoming' | 'history') => ['member', 'bookings', scope] as const,
  bookingsAll: ['member', 'bookings'] as const,
  waitlist: ['member', 'waitlist'] as const,
  preferences: ['member', 'preferences'] as const,
};

export function useSports() {
  return useQuery({
    queryKey: memberKeys.sports,
    queryFn: ({ signal }) => client.catalog.sports(signal),
    staleTime: 5 * 60_000,
  });
}

export function useResource(id: string | undefined) {
  return useQuery({
    queryKey: memberKeys.resource(id ?? ''),
    queryFn: ({ signal }) => client.catalog.resource(id!, signal),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

/** Cota lunară există doar pentru studenți (FR-26; `GET /me/quota` are x-min-role student). */
export function useQuota() {
  const role = useSession((s) => s.user?.role);
  return useQuery({ queryKey: memberKeys.quota, queryFn: () => client.me.quota(), enabled: role === 'student' });
}

export function useMyBookings(scope: 'upcoming' | 'history') {
  return useQuery({
    queryKey: memberKeys.bookings(scope),
    queryFn: () => client.me.bookings({ scope, page: 1, page_size: 50 }),
  });
}

export function useMyWaitlist() {
  return useQuery({ queryKey: memberKeys.waitlist, queryFn: () => client.me.waitlist() });
}

/** Grila de disponibilitate; se reîmprospătează la evenimentele SSE `slot-changed` (FR-10) și periodic. */
export function useAvailability(sportId: string, date: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: memberKeys.availability(sportId, date),
    queryFn: ({ signal }) => client.availability.get({ sport: sportId, date }, signal),
    enabled: Boolean(sportId && date),
    refetchInterval: 30_000,
  });

  // Un EventSource per resursă (contractul cere `resource`); limităm la 3 ca să nu epuizăm conexiunile HTTP/1.1.
  const watched = (query.data?.resources ?? []).slice(0, 3).map((r) => r.resource_id).join(',');
  useEffect(() => {
    if (USE_MOCKS || typeof EventSource === 'undefined' || !watched || !date) return;
    const sources = watched.split(',').map((id) => {
      const es = new EventSource(client.availability.streamUrl(id, date));
      es.addEventListener('slot-changed', () => {
        void qc.invalidateQueries({ queryKey: memberKeys.availability(sportId, date) });
      });
      return es;
    });
    return () => sources.forEach((es) => es.close());
  }, [watched, date, sportId, qc]);

  return query;
}

function useInvalidateBookings() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: memberKeys.bookingsAll });
    void qc.invalidateQueries({ queryKey: memberKeys.availabilityAll });
    void qc.invalidateQueries({ queryKey: memberKeys.quota });
    void qc.invalidateQueries({ queryKey: memberKeys.waitlist });
  };
}

export function useCreateBooking() {
  const done = useInvalidateBookings();
  return useMutation({ mutationFn: (input: BookingCreate) => client.bookings.create(input), onSuccess: done });
}

export function useCancelBooking() {
  const done = useInvalidateBookings();
  return useMutation({ mutationFn: (id: string) => client.bookings.cancel(id), onSuccess: done });
}

export function useJoinWaitlist() {
  const done = useInvalidateBookings();
  return useMutation({ mutationFn: (input: WaitlistJoin) => client.waitlist.join(input), onSuccess: done });
}

export function useLeaveWaitlist() {
  const done = useInvalidateBookings();
  return useMutation({ mutationFn: (id: string) => client.waitlist.leave(id), onSuccess: done });
}

export function useAcceptOffer() {
  const done = useInvalidateBookings();
  return useMutation({ mutationFn: (id: string) => client.waitlist.accept(id), onSuccess: done });
}

export function useNotificationPreferences() {
  return useQuery({ queryKey: memberKeys.preferences, queryFn: () => client.me.notificationPreferences() });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPreferences) => client.me.updateNotificationPreferences(prefs),
    onSuccess: (prefs) => qc.setQueryData(memberKeys.preferences, prefs),
  });
}

/** Descarcă `.ics`-ul unei rezervări (GET /bookings/{id}/calendar.ics). */
export async function downloadBookingCalendar(id: string, code: string): Promise<void> {
  const blob = await client.bookings.calendar(id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `CampusSport-${code.replace('#', '')}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
