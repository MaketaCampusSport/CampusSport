import type { User } from '@/api/generated';
import { ADMIN, db } from './db';

/** Parola conturilor demo (aceeași ca EXAMPLE_PASSWORD din datele de exemplu ale serverului). */
export const MOCK_PASSWORD = 'parola123';

/** Conturile demo; aceleași roluri ca în datele de exemplu ale serverului. Înregistrarea din demo adaugă aici. */
export const MOCK_USERS: User[] = [
  { id: 'u-admin-1', full_name: ADMIN.fullName, email: ADMIN.email, role: 'admin', status: 'active' },
  { id: 'u-student-1', full_name: 'Andrei Popescu', email: 'andrei.popescu@student.univ.example', role: 'student', status: 'active' },
  { id: 'u-teacher-1', full_name: 'Elena Munteanu', email: 'elena.munteanu@univ.example', role: 'teacher', status: 'active' },
  { id: 'u-external-1', full_name: 'Ana Rusu', email: 'ana.rusu@example.com', phone: '+37360000001', role: 'external', status: 'active' },
];

const KEY = 'cs-mock-session';

/** „Cookie-ul de refresh” al demo-ului: utilizatorul conectat, păstrat la reîncărcarea paginii. */
export function currentUser(): User | null {
  try {
    const id = sessionStorage.getItem(KEY);
    return MOCK_USERS.find((u) => u.id === id) ?? null;
  } catch {
    return memoryUser;
  }
}

let memoryUser: User | null = null;

export function setCurrentUser(user: User | null): void {
  memoryUser = user;
  db.session = user?.role === 'admin' ? 'ok' : 'none';
  try {
    if (user) sessionStorage.setItem(KEY, user.id);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* mod privat */
  }
}

export function sessionFor(user: User) {
  return { access_token: `mock.${user.id}`, token_type: 'Bearer' as const, expires_in: 900, user };
}

/** La pornire, panoul de admin vede sesiunea restaurată. */
export function restoreSession(): void {
  const user = currentUser();
  if (user) setCurrentUser(user);
}
