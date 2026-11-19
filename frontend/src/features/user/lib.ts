import type { Booking, Sport } from '@/api/generated';

/** Ora bazei sportive (backend: FACILITY_TIMEZONE). Toate orele afișate sunt în acest fus, nu în cel al telefonului. */
export const FACILITY_TZ = 'Europe/Chisinau';

/** Implicitele din specificație (BR-04, BR-05); regulile reale le aplică serverul. */
export const CHECKIN_BEFORE_MIN = 10;
export const CHECKIN_AFTER_MIN = 15;
export const FREE_CANCEL_HOURS = 2;

export type Lang = 'ro' | 'en';
export const langOf = (language: string | undefined): Lang => (language?.startsWith('en') ? 'en' : 'ro');
const locale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'ro-RO');

function parts(iso: string | Date, opts: Intl.DateTimeFormatOptions, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: FACILITY_TZ, ...opts }).format(new Date(iso));
}

/** `HH:mm` în fusul bazei. */
export const fmtTime = (iso: string) => parts(iso, { hour: '2-digit', minute: '2-digit', hour12: false }, 'ro');
export const fmtTimeRange = (start: string, end: string) => `${fmtTime(start)} – ${fmtTime(end)}`;
/** „joi, 24 oct.” */
export const fmtDayLong = (iso: string, lang: Lang) => parts(iso, { weekday: 'long', day: 'numeric', month: 'short' }, lang);
export const fmtWeekdayShort = (iso: string, lang: Lang) =>
  parts(iso, { weekday: 'short' }, lang).replace('.', '').toUpperCase();
export const fmtDayNumber = (iso: string) => parts(iso, { day: 'numeric' }, 'ro');
export const fmtMonth = (iso: string | Date, lang: Lang) => parts(iso, { month: 'long' }, lang);

/** `YYYY-MM-DD` al unei zile în fusul bazei. */
export function dayKey(date: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FACILITY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(date),
  );
}

/** Următoarele `count` zile (începând de azi, în fusul bazei), ca chei `YYYY-MM-DD` + o oră de referință (prânz). */
export function nextDays(count: number): { key: string; noon: string }[] {
  const today = dayKey();
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const noon = new Date(Date.UTC(y!, m! - 1, d! + i, 10));
    return { key: noon.toISOString().slice(0, 10), noon: noon.toISOString() };
  });
}

export function checkInWindow(start: string): string {
  const s = new Date(start).getTime();
  return `${fmtTime(new Date(s - CHECKIN_BEFORE_MIN * 60_000).toISOString())} – ${fmtTime(
    new Date(s + CHECKIN_AFTER_MIN * 60_000).toISOString(),
  )}`;
}

export const sportName = (sport: Pick<Sport, 'name_ro' | 'name_en'> | undefined, lang: Lang) =>
  sport ? (lang === 'en' ? sport.name_en : sport.name_ro) || sport.name_ro : '';

/** Fotografiile locale din public/images/resources, după `icon`-ul sportului. */
const ICON_IMAGES: Record<string, string> = {
  football: '/images/resources/football.jpg',
  soccer: '/images/resources/football.jpg',
  basketball: '/images/resources/basketball.jpg',
  tennis: '/images/resources/tennis.jpg',
  volleyball: '/images/resources/volleyball.jpg',
  fitness: '/images/resources/fitness.jpg',
  gym: '/images/resources/fitness.jpg',
  swimming: '/images/resources/pool.jpg',
  pool: '/images/resources/pool.jpg',
};

const ICON_GRADIENTS: Record<string, string> = {
  football: 'from-emerald-800 to-emerald-950',
  basketball: 'from-amber-800 to-stone-900',
  tennis: 'from-blue-700 to-slate-900',
  volleyball: 'from-orange-700 to-slate-900',
  fitness: 'from-slate-700 to-slate-950',
  swimming: 'from-cyan-700 to-blue-950',
};

export const sportImage = (icon: string | undefined) => (icon ? ICON_IMAGES[icon] : undefined);
export const sportGradient = (icon: string | undefined) =>
  (icon && ICON_GRADIENTS[icon]) || 'from-slate-700 to-slate-950';

/** Cod scurt, lizibil, pentru afișare (id-ul complet rămâne în QR). */
export const bookingCode = (b: Pick<Booking, 'id'>) => `#${b.id.slice(0, 8).toUpperCase()}`;

export const isUpcoming = (b: Pick<Booking, 'status' | 'end'>) => b.status === 'active' && new Date(b.end) > new Date();
