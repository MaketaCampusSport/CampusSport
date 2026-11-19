import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import memberEn from './member.en.json';
import memberRo from './member.ro.json';
import ro from './ro.json';

/**
 * Traducerile: `ro.json`/`en.json` pentru panoul de administrare și textele comune,
 * `member.*.json` pentru aplicația utilizatorilor și autentificare (chei de nivel 1 diferite).
 */
export const translations = {
  ro: { ...ro, ...memberRo },
  en: { ...en, ...memberEn },
};

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
  resources: { ro: { translation: translations.ro }, en: { translation: translations.en } },
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
