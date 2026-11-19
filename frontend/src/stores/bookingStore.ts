import { create } from 'zustand';
import type { SelectedSlotSummary } from '@/features/user/booking/availabilityMockData';
import { DEFAULT_UPCOMING_RESERVATION } from '@/features/user/home/StartScreen';
import type { ActiveReservation } from '@/features/user/components/QrTicketCard';

interface BookingState {
  totalEntries: number;
  remainingEntries: number;
  upcomingReservation: ActiveReservation;
  pendingBooking: SelectedSlotSummary | null;
  setPending: (s: SelectedSlotSummary | null) => void;
  complete: (r: ActiveReservation) => void;
}

export const useBookingStore = create<BookingState>()((set) => ({
  totalEntries: 4,
  remainingEntries: 3,
  upcomingReservation: DEFAULT_UPCOMING_RESERVATION,
  pendingBooking: null,
  setPending: (pendingBooking) => set({ pendingBooking }),
  complete: (upcomingReservation) =>
    set((s) => ({ upcomingReservation, remainingEntries: Math.max(0, s.remainingEntries - 1), pendingBooking: null })),
}));