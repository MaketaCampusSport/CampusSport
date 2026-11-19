import { useState } from 'react';
import { createBrowserRouter } from 'react-router';
import { HomeRedirect, RequireAdmin, RequireMember } from '@/auth/guards';
import AvailabilityScreen from '@/features/user/booking/AvailabilityScreen';
import BookingConfirmScreen from '@/features/user/booking/BookingConfirmScreen';
import type { SelectedSlotSummary } from '@/features/user/booking/mapAvailability';
import type { ActiveReservation } from '@/features/user/components/QrTicketCard';
import StartScreen, { DEFAULT_UPCOMING_RESERVATION } from '@/features/user/home/StartScreen';
import { AdminLayout } from './app/layout/AdminLayout';
import { adminPages } from './features/admin/routes';
import { FullPageSpinner, NotFoundPage, RouteErrorPage } from './app/RouteFallbacks';

function StudentFlowPage() {
  const [selectedSportId, setSelectedSportId] = useState<string | null>(null);
  const [pendingBooking, setPendingBooking] = useState<SelectedSlotSummary | null>(null);

  const totalEntries = 4;
  const [remainingEntries, setRemainingEntries] = useState<number>(3);
  const [upcomingReservation, setUpcomingReservation] = useState<ActiveReservation>(
    DEFAULT_UPCOMING_RESERVATION,
  );

  if (pendingBooking) {
    return (
      <BookingConfirmScreen
        selection={pendingBooking}
        remainingEntries={remainingEntries}
        totalEntries={totalEntries}
        onBack={() => setPendingBooking(null)}
        onComplete={(createdReservation) => {
          setUpcomingReservation(createdReservation);
          setRemainingEntries((prev) => Math.max(0, prev - 1));
          setPendingBooking(null);
          setSelectedSportId(null);
        }}
      />
    );
  }

  if (selectedSportId) {
    return (
      <AvailabilityScreen
        sportId={selectedSportId}
        onBack={() => setSelectedSportId(null)}
        onContinue={(selection) => setPendingBooking(selection)}
      />
    );
  }

  return (
    <StartScreen
      remainingEntries={remainingEntries}
      totalEntries={totalEntries}
      upcomingReservation={upcomingReservation}
      onSelectSport={(sportId) => {
        setSelectedSportId(sportId);
        setPendingBooking(null);
      }}
    />
  );
}

export const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect />, errorElement: <RouteErrorPage /> },
  {
    path: '/login',
    HydrateFallback: FullPageSpinner,
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await import('@/features/auth/MemberLoginPage')).default }),
  },
  {
    path: '/auth/2fa',
    HydrateFallback: FullPageSpinner,
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await import('@/features/auth/TwoFactorPage')).default }),
  },
  {
    path: '/user',
    element: <RequireMember />,
    errorElement: <RouteErrorPage />,
    children: [{ path: '*?', element: <StudentFlowPage /> }],
  },
  {
    path: '/admin/login',
    HydrateFallback: FullPageSpinner,
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await import('@/features/admin/auth/LoginPage')).default }),
  },
  {
    path: '/admin',
    element: <RequireAdmin />,
    HydrateFallback: FullPageSpinner,
    errorElement: <RouteErrorPage />,
    children: [{ element: <AdminLayout />, children: adminPages }],
  },
  { path: '*', element: <NotFoundPage /> },
]);