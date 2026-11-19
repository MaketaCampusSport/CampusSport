import { create } from 'zustand';

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'cs-theme';

function readTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Aplică tema pe <html data-theme="…">; „system” urmează setarea sistemului de operare. */
export function applyTheme(pref: ThemePreference): void {
  const dark =
    pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
}

interface UiState {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
}

export const useUiStore = create<UiState>((set) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* mod privat */
    }
    applyTheme(theme);
    set({ theme });
  },
}));
/** Aplică tema la pornire și o urmărește pe cea a sistemului când preferința este „system”. */
export function initTheme(): void {
  applyTheme(useUiStore.getState().theme);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (useUiStore.getState().theme === 'system') applyTheme('system');
  });
}