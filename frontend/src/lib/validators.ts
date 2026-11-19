import type { ExternalAccess, SettingsWritable, Sport } from '@/api/client';
import { timeToMinutes } from './dates';

/** 1 = luni … 7 = duminică (ISO 8601). */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const ISO_WEEKDAYS: IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7];

/** Dotările propuse în formulare (SRS: panouri, fileu, mingi, rachete, vestiar, tribună…). Etichetele: `equipment.<id>`. */
export const EQUIPMENT_IDS = ['panouri', 'fileu', 'mingi', 'rachete', 'vestiar', 'tribuna', 'porti'] as const;

export const SLOT_MINUTES = [30, 45, 60, 90, 120] as const;

/* ───────────── Resurse (FR-39) ───────────── */

export interface WeeklyWindow {
  days: IsoWeekday[];
  from: string; // HH:mm
  to: string; // HH:mm
}

/** Formularul unei resurse: programul este același în zilele alese (contractul permite program diferit pe zile). */
export interface ResourceFormState {
  name: string;
  type: string;
  location: string;
  photoUrl: string;
  capacity: string;
  sportIds: string[];
  equipment: string[];
  hours: WeeklyWindow;
  slotMinutes: number;
  externalAccess: ExternalAccess;
  externalWindow: WeeklyWindow;
}

export type ResourceErrorKey =
  | 'nameRequired'
  | 'typeRequired'
  | 'locationRequired'
  | 'photoInvalid'
  | 'capacityInvalid'
  | 'sportRequired'
  | 'daysRequired'
  | 'hoursInvalid'
  | 'slotTooLong'
  | 'windowDays'
  | 'windowHours';

export type ResourceErrors = Partial<
  Record<'name' | 'type' | 'location' | 'photo' | 'capacity' | 'sports' | 'hours' | 'slot' | 'window', ResourceErrorKey>
>;

/** Sporturile selectate pentru care lipsesc dotări obligatorii (FR-07: baschet → panouri, tenis → fileu). */
export function missingEquipment(form: Pick<ResourceFormState, 'sportIds' | 'equipment'>, sports: Sport[]) {
  return sports
    .filter((s) => form.sportIds.includes(s.id))
    .map((s) => ({ sport: s, missing: s.required_equipment.filter((e) => !form.equipment.includes(e)) }))
    .filter((x) => x.missing.length > 0);
}

function validUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateResource(form: ResourceFormState): ResourceErrors {
  const errors: ResourceErrors = {};
  if (!form.name.trim()) errors.name = 'nameRequired';
  if (!form.type.trim()) errors.type = 'typeRequired';
  if (!form.location.trim()) errors.location = 'locationRequired';
  if (form.photoUrl.trim() && !validUrl(form.photoUrl.trim())) errors.photo = 'photoInvalid';
  const cap = Number(form.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 1000) errors.capacity = 'capacityInvalid';
  if (form.sportIds.length === 0) errors.sports = 'sportRequired';
  const open = timeToMinutes(form.hours.from);
  const close = timeToMinutes(form.hours.to);
  if (form.hours.days.length === 0) errors.hours = 'daysRequired';
  else if (!form.hours.from || !form.hours.to || close <= open) errors.hours = 'hoursInvalid';
  else if (form.slotMinutes > close - open) errors.slot = 'slotTooLong';
  if (form.externalAccess === 'window') {
    if (form.externalWindow.days.length === 0) errors.window = 'windowDays';
    else if (timeToMinutes(form.externalWindow.to) <= timeToMinutes(form.externalWindow.from)) errors.window = 'windowHours';
  }
  return errors;
}

/* ───────────── Reguli (SRS 9.2, BR-01 … BR-08) ───────────── */

export type NumericRuleKey = Exclude<keyof SettingsWritable, 'monthly_quota_per_sport' | 'member_replaces_external'>;

/** Aceleași limite ca validarea serverului (PUT /admin/settings). */
export const RULE_LIMITS: Record<NumericRuleKey, [min: number, max: number]> = {
  monthly_quota: [0, 100],
  max_active_bookings: [1, 50],
  booking_window_days_student: [1, 365],
  booking_window_days_teacher: [1, 365],
  booking_window_hours_external: [1, 720],
  cancel_free_hours: [0, 72],
  checkin_minutes_before: [0, 120],
  checkin_minutes_after: [0, 120],
  no_show_threshold: [1, 100],
  no_show_suspension_days: [0, 365],
  waitlist_offer_minutes: [1, 1440],
  waitlist_simultaneous_under_hours: [0, 72],
  default_slot_minutes: [15, 480],
};

export const NUMERIC_RULE_KEYS = Object.keys(RULE_LIMITS) as NumericRuleKey[];

export type RuleErrors = Partial<Record<NumericRuleKey, { min: number; max: number }>>;

export function isIntInRange(raw: string, min: number, max: number): boolean {
  const n = Number(raw);
  return raw.trim() !== '' && Number.isInteger(n) && n >= min && n <= max;
}

/** Valorile din formular sunt text; valide = întregi în intervalul permis. */
export function validateRules(values: Record<NumericRuleKey, string>): RuleErrors {
  const errors: RuleErrors = {};
  for (const key of NUMERIC_RULE_KEYS) {
    const [min, max] = RULE_LIMITS[key];
    if (!isIntInRange(values[key] ?? '', min, max)) errors[key] = { min, max };
  }
  return errors;
}

/** Cota per sport (FR-25): aceleași limite ca cota globală. Întoarce sporturile cu valori nevalide. */
export function invalidSportQuotas(values: Record<string, string>): string[] {
  const [min, max] = RULE_LIMITS.monthly_quota;
  return Object.entries(values)
    .filter(([, v]) => !isIntInRange(v, min, max))
    .map(([id]) => id);
}

/* ───────────── Anunțuri ───────────── */

export interface AnnouncementForm {
  messageRo: string;
  messageEn: string;
  /** '' = toate resursele (atunci intervalul este obligatoriu). */
  resourceId: string;
  withInterval: boolean;
  date: string; // yyyy-MM-dd
  from: string; // HH:mm
  to: string; // HH:mm
}

export type AnnouncementErrors = Partial<
  Record<'messageRo' | 'target' | 'date' | 'time', 'messageRequired' | 'targetRequired' | 'dateRequired' | 'timeInvalid'>
>;

export const MESSAGE_MAX = 500;

/** Serverul cere `resource_id` sau intervalul `start` + `end` (POST /admin/announcements). */
export function validateAnnouncement(form: AnnouncementForm): AnnouncementErrors {
  const errors: AnnouncementErrors = {};
  if (!form.messageRo.trim()) errors.messageRo = 'messageRequired';
  if (!form.resourceId && !form.withInterval) errors.target = 'targetRequired';
  if (form.withInterval) {
    if (!form.date) errors.date = 'dateRequired';
    if (!form.from || !form.to || timeToMinutes(form.to) <= timeToMinutes(form.from)) errors.time = 'timeInvalid';
  }
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}
