import { Navigate, Outlet, useLocation } from 'react-router';
import { ApiError } from '@/api/http';
import { ErrorState } from '@/components/ui/feedback';
import { FullPageSpinner } from '@/app/RouteFallbacks';
import { useAuthStore } from '@/stores/authStore';
import { useSession } from './useSession';

/**
 * Rută protejată pe rol (SDD 2.3: „rute protejate pe rol”): lasă să treacă doar administratorii
 * cu al doilea pas (TOTP) confirmat. Autorizarea reală se face oricum pe server la fiecare cerere (RBAC).
 */
export function RequireAdmin() {
  const location = useLocation();
  const expired = useAuthStore((s) => s.sessionExpired);
  const { data, error, isPending, refetch } = useSession();

  const to = `/admin/login`;
  const state = { from: location.pathname + location.search };

  if (expired) return <Navigate to={to} state={{ ...state, expired: true }} replace />;
  if (isPending) return <FullPageSpinner />;

  if (error) {
    if (error instanceof ApiError && error.status === 401) return <Navigate to={to} state={state} replace />;
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ErrorState message={error.message} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!data.twoFactorVerified) return <Navigate to={to} state={state} replace />;
  return <Outlet />;
}
