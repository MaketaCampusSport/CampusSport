import { create } from 'zustand';

interface AuthState {
  /** Serverul a răspuns 401 într-o sesiune deja pornită (ex. cele 8 ore au trecut). */
  sessionExpired: boolean;
  markExpired: () => void;
  clearExpired: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  sessionExpired: false,
  markExpired: () => set({ sessionExpired: true }),
  clearExpired: () => set({ sessionExpired: false }),
}));
