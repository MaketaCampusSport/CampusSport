import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  format,
  parse,
  startOfDay,
} from 'date-fns';
import { enUS, ro } from 'date-fns/locale';
import i18n from '@/i18n';

export { addDays, startOfDay, differenceInCalendarDays, differenceInCalendarWeeks };

export function currentLocale() {
  return i18n.language?.startsWith('en') ? enUS : ro;
}

/** Prima literă mare: date-fns scrie lunile/zilele cu literă mică în română. */
export function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function toDate(input: Date | string | number): Date {
  return input instanceof Date ? input : new Date(input);
}

/** Formatare localizată (RO/EN) cu date-fns. */
export function fmt(input: Date | string | number, pattern: string): string {
  return format(toDate(input), pattern, { locale: currentLocale() });
}

/** „Joi, 24 octombrie 2026” */
export function fmtLongDay(input: Date | string | number): string {
  return cap(fmt(input, 'EEEE, d MMMM yyyy'));
}

/** „Joi 24 oct” */
export function fmtShortDay(input: Date | string | number): string {
  return cap(fmt(input, 'EEE d MMM').replace('.', ''));
}

/** „14:20” */
export function fmtTime(input: Date | string | number): string {
  return format(toDate(input), 'HH:mm');
}

/** „Joi 24 oct · 14:20” */
export function fmtDayTime(input: Date | string | number): string {
  return `${fmtShortDay(input)} · ${fmtTime(input)}`;
}

/** Cheia unei zile calendaristice, folosită în API: `2026-10-24`. */
export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function fromDateKey(key: string): Date {
  return parse(key, 'yyyy-MM-dd', new Date());
}

export function toMonthKey(d: Date): string {
  return format(d, 'yyyy-MM');
}

export function fromMonthKey(key: string): Date {
  return parse(key, 'yyyy-MM', new Date());
}

/** Valoare pentru <input type="datetime-local"> în ora locală. */
export function toLocalInput(d: Date): string {
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function fromLocalInput(value: string): Date {
  return parse(value, "yyyy-MM-dd'T'HH:mm", new Date());
}

/** „08:00” → minute de la miezul nopții. */
export function timeToMinutes(hhmm: string): number {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
