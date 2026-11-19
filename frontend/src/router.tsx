import { useState } from 'react';
import { createBrowserRouter, type RouteObject } from 'react-router';
import { RequireAdmin } from '@/features/admin/auth/RequireAdmin';
import AvailabilityScreen from '@/features/user/booking/AvailabilityScreen';
import BookingConfirmScreen from '@/features/user/booking/BookingConfirmScreen';
import type { SelectedSlotSummary } from '@/features/user/booking/mapAvailability';
import type { ActiveReservation } from '@/features/user/components/QrTicketCard';
import StartScreen, { DEFAULT_UPCOMING_RESERVATION } from '@/features/user/home/StartScreen';
import { AdminLayout } from './app/layout/AdminLayout';
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

const adminPages: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import('@/features/admin/dashboard/DashboardPage')).default }) },
  { path: 'resources', lazy: async () => ({ Component: (await import('@/features/admin/resources/ResourcesPage')).default }) },
  { path: 'blocks', lazy: async () => ({ Component: (await import('@/features/admin/blocks/BlocksPage')).default }) },
  { path: 'schedule', lazy: async () => ({ Component: (await import('@/features/admin/schedule/SchedulePage')).default }) },
  { path: 'events', lazy: async () => ({ Component: (await import('@/features/admin/events/EventsPage')).default }) },
  { path: 'rules', lazy: async () => ({ Component: (await import('@/features/admin/rules/RulesPage')).default }) },
  { path: 'audit', lazy: async () => ({ Component: (await import('@/features/admin/audit/AuditPage')).default }) },
  { path: 'announcements', lazy: async () => ({ Component: (await import('@/features/admin/announcements/AnnouncementsPage')).default }) },
  { path: 'reports', lazy: async () => ({ Component: (await import('@/features/admin/reports/ReportsPage')).default }) },
  { path: 'sports', lazy: async () => ({ Component: (await import('@/features/admin/sports/SportsPage')).default }) },
  { path: 'users', lazy: async () => ({ Component: (await import('@/features/admin/users/UsersPage')).default }) },
  { path: 'checkin', lazy: async () => ({ Component: (await import('@/features/admin/checkin/CheckInPage')).default }) },
  { path: 'account', lazy: async () => ({ Component: (await import('@/features/admin/account/AccountPage')).default }) },
];

export const router = createBrowserRouter([
  {
    path: '/',
    element: <StudentFlowPage />,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/user/*',
    element: <StudentFlowPage />,
    errorElement: <RouteErrorPage />,
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