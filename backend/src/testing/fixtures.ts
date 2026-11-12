import type { User } from '../database/entities';
import { EXAMPLE_USERS } from '../database/seeds/example-data';

const CREATED_AT = new Date('2026-09-01T09:00:00+03:00');

/** A `User` entity built from the example data, as a repository would return it. */
export function userEntity(key: keyof typeof EXAMPLE_USERS, overrides: Partial<User> = {}): User {
  const u = EXAMPLE_USERS[key];
  const verified = u.role === 'external' ? CREATED_AT : null;
  return {
    id: u.id,
    fullName: u.full_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: 'active',
    suspendedUntil: null,
    ssoSubject: u.sso_subject,
    emailVerifiedAt: verified,
    phoneVerifiedAt: verified,
    calendarToken: '6f1e2d3c-4b5a-4968-8776-655443322110',
    notificationPreferences: { push: true, email: true, sms: false, language: 'ro' },
    lastActiveAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}
