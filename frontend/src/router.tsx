import { createBrowserRouter, type RouteObject } from 'react-router';
import { HomeRedirect, RequireAdmin, RequireMember } from '@/auth/guards';
import { MemberLayout } from '@/features/user/MemberLayout';
import { AdminLayout } from './app/layout/AdminLayout';
import { adminPages } from './features/admin/routes';
import { FullPageSpinner, NotFoundPage, RouteErrorPage } from './app/RouteFallbacks';

/** Aplicația utilizatorilor (PWA): fiecare pas are propriul URL, deci reîncărcarea și „Înapoi” funcționează. */
const memberPages: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import('@/features/user/home/HomePage')).default }) },
  { path: 'search', lazy: async () => ({ Component: (await import('@/features/user/booking/SearchPage')).default }) },
  { path: 'book/:resourceId', lazy: async () => ({ Component: (await import('@/features/user/booking/ConfirmPage')).default }) },
  { path: 'bookings', lazy: async () => ({ Component: (await import('@/features/user/bookings/MyBookingsPage')).default }) },
  { path: 'profile', lazy: async () => ({ Component: (await import('@/features/user/profile/ProfilePage')).default }) },
];

export const router = createBrowserRouter([
  { path: '/', element: <HomeRedirect />, errorElement: <RouteErrorPage /> },
  {
    path: '/login',
    HydrateFallback: FullPageSpinner,
    errorElement: <RouteErrorPage />,
    lazy: async () => ({ Component: (await import('@/features/auth/MemberLoginPage')).default }),
  },
  // DEZACTIVAT (autentificare cu email și parolă): pasul 2FA al administratorilor după SSO.
  // {
  //   path: '/auth/2fa',
  //   HydrateFallback: FullPageSpinner,
  //   errorElement: <RouteErrorPage />,
  //   lazy: async () => ({ Component: (await import('@/features/auth/TwoFactorPage')).default }),
  // },
  {
    path: '/user',
    element: <RequireMember />,
    errorElement: <RouteErrorPage />,
    HydrateFallback: FullPageSpinner,
    children: [{ element: <MemberLayout />, children: memberPages }],
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