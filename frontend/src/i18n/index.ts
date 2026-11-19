import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ro from './ro.json';

export const LANGUAGES = ['ro', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const LANG_KEY = 'cs-lang';

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ro' || saved === 'en') return saved;
  } catch {
    /* mod privat */
  }
  // Interfața e în română, cu engleza ca a doua limbă (SRS 3.4).
  return 'ro';
}

void i18n.use(initReactI18next).init({
  resources: { ro: { translation: ro }, en: { translation: en } },
  lng: initialLanguage(),
  fallbackLng: 'ro',
  interpolation: { escapeValue: false },
  returnNull: false,
});

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language;

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_KEY, lng);
  } catch {
    /* mod privat */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

export function setLanguage(lng: Language): void {
  void i18n.changeLanguage(lng);
}

export default i18n;
