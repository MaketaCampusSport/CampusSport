import { create } from 'zustand';
import type { User } from '@/api/generated';
import { refreshSession, setAccessToken, type SessionPayload } from '@/api/http';

export type SessionStatus = 'unknown' | 'loading' | 'authenticated' | 'anonymous';

interface SessionState {
  status: SessionStatus;
  user: User | null;
  /** Serverul a răspuns 401 într-o sesiune deja pornită (ex. cele 8 ore de admin au trecut). */
  expired: boolean;
  /** Reface sesiunea din cookie-ul de refresh, o singură dată per încărcare a paginii. */
  ensure: () => Promise<User | null>;
  /** După login (email și parolă, cont nou sau dev login). */
  signIn: (session: SessionPayload) => void;
  /** Local: uită tokenul și utilizatorul (logout-ul pe server îl face apelantul). */
  clear: () => void;
  markExpired: () => void;
  /** Profilul s-a schimbat (ex. fotografia nouă), sesiunea rămâne aceeași. */
  setUser: (user: User) => void;
}

let pending: Promise<User | null> | null = null;

export const useSession = create<SessionState>((set, get) => ({
  status: 'unknown',
  user: null,
  expired: false,

  ensure() {
    const { status, user } = get();
    if (status === 'authenticated' || status === 'anonymous') return Promise.resolve(user);
    if (!pending) {
      set({ status: 'loading' });
      pending = refreshSession().then((session) => {
        pending = null;
        if (!session) set({ status: 'anonymous', user: null });
        return session?.user ?? null;
      });
    }
    return pending;
  },

  signIn(session) {
    setAccessToken(session.access_token);
    set({ status: 'authenticated', user: session.user, expired: false });
  },

  clear() {
    setAccessToken(null);
    set({ status: 'anonymous', user: null });
  },

  markExpired() {
    setAccessToken(null);
    set({ status: 'anonymous', user: null, expired: true });
  },

  setUser(user) {
    if (get().user?.id === user.id) set({ user });
  },
}));

export const isAdmin = (user: User | null | undefined) => user?.role === 'admin';
export const isMember = (user: User | null | undefined) => !!user && user.role !== 'admin';
