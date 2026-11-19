import { useMutation, useQueryClient } from '@tanstack/react-query';
import { http } from './http';

export interface CreateBookingInput {
  resource_id: string;
  start: string;
  participants_count: number;
}

export interface BookingCreatedDto {
  id: string;
  qr_token: string;
  message_ro: string;
  message_en: string;
}

export interface JoinWaitlistInput {
  resource_id: string;
  start: string;
}

export const createBooking = (input: CreateBookingInput) =>
  http.post<BookingCreatedDto>('/bookings', input);

export const joinWaitlist = (input: JoinWaitlistInput) =>
  http.post<{ ok: boolean }>('/waitlist', input);

export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
  });
}

export function useJoinWaitlist() {
  return useMutation({
    mutationFn: joinWaitlist,
  });
}