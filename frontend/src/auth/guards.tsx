import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSpinner } from '@/app/RouteFallbacks';
import { isAdmin, isMember, useSession } from './sessionStore';

/** Reface sesiunea din cookie (o dată) și întoarce starea ei. */
export function useEnsureSession() {
  const status = useSession((s) => s.status);
  const user = useSession((s) => s.user);
  const ensure = useSession((s) => s.ensure);
  useEffect(() => {
    if (status === 'unknown') void ensure();
  }, [status, ensure]);
  return { status, user, ready: status === 'authenticated' || status === 'anonymous' };
}

/**
 * Rute protejate pe rol (SDD 2.3). Autorizarea reală o face serverul la fiecare cerere (RBAC);
 * aici doar alegem ecranul potrivit. Un token de admin există doar după al doilea pas (TOTP).
 */
function RequireRole({ role, loginPath }: { role: 'admin' | 'member'; loginPath: string }) {
  const location = useLocation();
  const expired = useSession((s) => s.expired);
  const { user, ready } = useEnsureSession();

  if (!ready) return <FullPageSpinner />;
  const from = location.pathname + location.search;
  if (!user) return <Navigate to={loginPath} state={{ from, expired }} replace />;
  if (role === 'admin' && !isAdmin(user)) return <Navigate to="/user" replace />;
  if (role === 'member' && !isMember(user)) return <Navigate to="/admin" replace />;
  return <Outlet />;
}

export const RequireAdmin = () => <RequireRole role="admin" loginPath="/admin/login" />;
export const RequireMember = () => <RequireRole role="member" loginPath="/login" />;

/** Rădăcina `/`: trimite fiecare utilizator la aplicația lui. */
export function HomeRedirect() {
  const { user, ready } = useEnsureSession();
  if (!ready) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={isAdmin(user) ? '/admin' : '/user'} replace />;
}
