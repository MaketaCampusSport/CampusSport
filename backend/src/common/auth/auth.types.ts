import type { AccountStatus, Role } from '../../database/enums';

/** The authenticated caller, attached to `request.user` by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  status: AccountStatus;
  suspendedUntil: Date | null;
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  typ: 'access';
}

/** Loads the caller for a verified token; DB-backed in the app, fake in controller tests. */
export interface AuthUserLoader {
  load(userId: string): Promise<AuthUser | null>;
}

export const AUTH_USER_LOADER = Symbol('AUTH_USER_LOADER');

/** A suspension ends by itself once `suspended_until` has passed (FR-05). */
export function isSuspended(user: Pick<AuthUser, 'status' | 'suspendedUntil'>, now = new Date()): boolean {
  return user.status === 'suspended' && (user.suspendedUntil === null || user.suspendedUntil > now);
}
