import type { Resource, ResourceInput, TimeRange, WeeklyHours } from '@/api/client';
import { ISO_WEEKDAYS, type IsoWeekday, type ResourceFormState, type WeeklyWindow } from '@/lib/validators';

/** Cheile din `WeeklyHours`, în ordinea ISO (1 = luni). */
export const WEEKDAY_KEYS: Record<IsoWeekday, keyof WeeklyHours> = {
  1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun',
};

const DEFAULT_HOURS: WeeklyWindow = { days: [1, 2, 3, 4, 5, 6, 7], from: '08:00', to: '22:00' };
const DEFAULT_WINDOW: WeeklyWindow = { days: [1, 2, 3, 4, 5], from: '16:00', to: '20:00' };

/**
 * `WeeklyHours` → formularul simplificat (aceleași ore în zilele alese). Dacă zilele au ore diferite,
 * se păstrează primul interval al primei zile deschise; salvarea aplică același program tuturor zilelor alese.
 */
export function fromWeeklyHours(hours: WeeklyHours | null | undefined, fallback: WeeklyWindow): WeeklyWindow {
  if (!hours) return fallback;
  const days = ISO_WEEKDAYS.filter((d) => (hours[WEEKDAY_KEYS[d]]?.length ?? 0) > 0);
  const first: TimeRange | undefined = days.length ? hours[WEEKDAY_KEYS[days[0] as IsoWeekday]]?.[0] : undefined;
  if (!first) return { ...fallback, days: [] };
  return { days, from: first.open, to: first.close };
}

export function toWeeklyHours(w: WeeklyWindow): WeeklyHours {
  const out: WeeklyHours = {};
  for (const d of w.days) out[WEEKDAY_KEYS[d]] = [{ open: w.from, close: w.to }];
  return out;
}

/** Programul are ore diferite pe zile (formularul le-ar uniformiza la salvare). */
export function hasMixedHours(hours: WeeklyHours | null | undefined): boolean {
  if (!hours) return false;
  const ranges = ISO_WEEKDAYS.map((d) => hours[WEEKDAY_KEYS[d]]).filter((r): r is TimeRange[] => !!r && r.length > 0);
  const sig = (r: TimeRange[]) => r.map((x) => `${x.open}-${x.close}`).join(',');
  return ranges.some((r) => r.length > 1 || sig(r) !== sig(ranges[0] as TimeRange[]));
}

export function toForm(r: Resource | null, defaultSlot = 60): ResourceFormState {
  return {
    name: r?.name ?? '',
    type: r?.type ?? '',
    location: r?.location ?? '',
    photoUrl: r?.photo_url ?? '',
    capacity: String(r?.capacity ?? 10),
    sportIds: r?.sport_ids ?? [],
    equipment: r?.equipment ?? [],
    hours: fromWeeklyHours(r?.opening_hours, DEFAULT_HOURS),
    slotMinutes: r?.slot_minutes ?? defaultSlot,
    externalAccess: r?.external_access ?? 'leftover',
    externalWindow: fromWeeklyHours(r?.external_access_windows, DEFAULT_WINDOW),
  };
}

/** Formular → `ResourceInput` (creare: tot obiectul; PATCH: serverul acceptă același obiect). */
export function toResourceInput(form: ResourceFormState, active: boolean): ResourceInput {
  return {
    name: form.name.trim(),
    type: form.type.trim(),
    location: form.location.trim(),
    photo_url: form.photoUrl.trim() || null,
    capacity: Number(form.capacity),
    sport_ids: form.sportIds,
    equipment: form.equipment,
    opening_hours: toWeeklyHours(form.hours),
    slot_minutes: form.slotMinutes,
    external_access: form.externalAccess,
    ...(form.externalAccess === 'window' ? { external_access_windows: toWeeklyHours(form.externalWindow) } : {}),
    active,
  };
}
