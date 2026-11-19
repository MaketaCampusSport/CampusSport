import type { AnnouncementInput, ExternalAccess, ExternalWindow, RuleSettings, Sport } from '@/api/types';
import { timeToMinutes } from './dates';

/** Dotările posibile (SRS: panouri, fileu, mingi, rachete, vestiar, tribună…). Etichetele sunt în i18n: `equipment.<id>`. */
export const EQUIPMENT_IDS = ['panouri', 'fileu', 'mingi', 'rachete', 'vestiar', 'tribuna', 'porti'] as const;

export const SLOT_MINUTES = [30, 45, 60, 90, 120] as const;

export interface ResourceFormState {
  name: string;
  capacity: string;
  sportIds: string[];
  equipment: string[];
  opensAt: string;
  closesAt: string;
  slotMinutes: number;
  externalAccess: ExternalAccess;
  externalWindow: ExternalWindow;
}

export type ResourceErrorKey =
  | 'nameRequired'
  | 'capacityInvalid'
  | 'sportRequired'
  | 'hoursInvalid'
  | 'slotTooLong'
  | 'windowDays'
  | 'windowHours';

export type ResourceErrors = Partial<Record<'name' | 'capacity' | 'sports' | 'hours' | 'slot' | 'window', ResourceErrorKey>>;

/** Sporturile selectate pentru care lipsesc dotări obligatorii (FR-07: baschet → panouri, tenis → fileu). */
export function missingEquipment(form: Pick<ResourceFormState, 'sportIds' | 'equipment'>, sports: Sport[]) {
  return sports
    .filter((s) => form.sportIds.includes(s.id))
    .map((s) => ({ sport: s, missing: s.requiredEquipment.filter((e) => !form.equipment.includes(e)) }))
    .filter((x) => x.missing.length > 0);
}

export function validateResource(form: ResourceFormState): ResourceErrors {
  const errors: ResourceErrors = {};
  if (!form.name.trim()) errors.name = 'nameRequired';
  const cap = Number(form.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 1000) errors.capacity = 'capacityInvalid';
  if (form.sportIds.length === 0) errors.sports = 'sportRequired';
  const open = timeToMinutes(form.opensAt);
  const close = timeToMinutes(form.closesAt);
  if (!form.opensAt || !form.closesAt || close <= open) errors.hours = 'hoursInvalid';
  else if (form.slotMinutes > close - open) errors.slot = 'slotTooLong';
  if (form.externalAccess === 'window') {
    if (form.externalWindow.days.length === 0) errors.window = 'windowDays';
    else if (timeToMinutes(form.externalWindow.to) <= timeToMinutes(form.externalWindow.from)) errors.window = 'windowHours';
  }
  return errors;
}

/* ───────────── Reguli (BR-01 … BR-07) ───────────── */

export type NumericRuleKey = Exclude<keyof RuleSettings, 'quotaPerSport'>;

export const RULE_LIMITS: Record<NumericRuleKey, [min: number, max: number]> = {
  quotaMonthly: [0, 31],
  maxActiveFuture: [1, 10],
  windowTeacherDays: [1, 90],
  windowStudentDays: [1, 90],
  windowExternalHours: [1, 168],
  cancelBeforeHours: [0, 72],
  checkinBeforeMin: [0, 60],
  checkinAfterMin: [0, 120],
  noShowLimit: [1, 20],
  suspensionDays: [1, 365],
  waitlistOfferMinutes: [1, 120],
};

export type RuleErrors = Partial<Record<NumericRuleKey, { min: number; max: number }>>;

/** Valorile din formular sunt text; valide = întregi în intervalul permis. */
export function validateRules(values: Record<NumericRuleKey, string>): RuleErrors {
  const errors: RuleErrors = {};
  for (const key of Object.keys(RULE_LIMITS) as NumericRuleKey[]) {
    const [min, max] = RULE_LIMITS[key];
    const raw = values[key];
    const n = Number(raw);
    if (raw.trim() === '' || !Number.isInteger(n) || n < min || n > max) errors[key] = { min, max };
  }
  return errors;
}

/* ───────────── Anunțuri ───────────── */

export type AnnouncementErrors = Partial<
  Record<'title' | 'message' | 'channels' | 'resource' | 'date' | 'time', 'titleRequired' | 'messageRequired' | 'channelRequired' | 'resourceRequired' | 'dateRequired' | 'timeInvalid'>
>;

export const TITLE_MAX = 80;
export const MESSAGE_MAX = 500;

export function validateAnnouncement(input: AnnouncementInput): AnnouncementErrors {
  const errors: AnnouncementErrors = {};
  if (!input.title.trim()) errors.title = 'titleRequired';
  if (!input.message.trim()) errors.message = 'messageRequired';
  if (input.channels.length === 0) errors.channels = 'channelRequired';
  if ((input.audience === 'resource' || input.audience === 'interval') && !input.resourceId) errors.resource = 'resourceRequired';
  if (input.audience === 'interval') {
    if (!input.date) errors.date = 'dateRequired';
    if (!input.allDay && (!input.from || !input.to || timeToMinutes(input.to) <= timeToMinutes(input.from))) errors.time = 'timeInvalid';
  }
  return errors;
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}
