import { describe, expect, it } from 'vitest';
import type { Sport } from '@/api/client';
import {
  NUMERIC_RULE_KEYS,
  RULE_LIMITS,
  hasErrors,
  invalidSportQuotas,
  missingEquipment,
  validateAnnouncement,
  validateResource,
  validateRules,
  type AnnouncementForm,
  type NumericRuleKey,
  type ResourceFormState,
} from './validators';

const baseForm: ResourceFormState = {
  name: 'Teren 1',
  type: 'teren',
  location: 'Complexul sportiv',
  photoUrl: '',
  capacity: '10',
  sportIds: ['s-baschet'],
  equipment: ['panouri'],
  hours: { days: [1, 2, 3, 4, 5], from: '08:00', to: '22:00' },
  slotMinutes: 60,
  externalAccess: 'never',
  externalWindow: { days: [1], from: '16:00', to: '20:00' },
};
const sports: Sport[] = [
  { id: 's-baschet', name_ro: 'Baschet', name_en: 'Basketball', icon: 'basketball', required_equipment: ['panouri'] },
  { id: 's-tenis', name_ro: 'Tenis', name_en: 'Tennis', icon: 'tennis', required_equipment: ['fileu'] },
];

describe('validateResource', () => {
  it('acceptă o resursă validă', () => expect(hasErrors(validateResource(baseForm))).toBe(false));
  it('cere denumire, tip, locație, capacitate validă și cel puțin un sport', () => {
    const e = validateResource({ ...baseForm, name: ' ', type: '', location: '', capacity: '0', sportIds: [] });
    expect(e).toMatchObject({
      name: 'nameRequired',
      type: 'typeRequired',
      location: 'locationRequired',
      capacity: 'capacityInvalid',
      sports: 'sportRequired',
    });
  });
  it('validează adresa fotografiei', () => {
    expect(validateResource({ ...baseForm, photoUrl: 'nu-e-url' }).photo).toBe('photoInvalid');
    expect(validateResource({ ...baseForm, photoUrl: 'https://cdn.example/x.jpg' }).photo).toBeUndefined();
  });
  it('respinge program fără zile, inversat sau mai scurt decât intervalul', () => {
    expect(validateResource({ ...baseForm, hours: { ...baseForm.hours, days: [] } }).hours).toBe('daysRequired');
    expect(validateResource({ ...baseForm, hours: { ...baseForm.hours, to: '07:00' } }).hours).toBe('hoursInvalid');
    expect(validateResource({ ...baseForm, hours: { days: [1], from: '08:00', to: '09:00' }, slotMinutes: 120 }).slot).toBe(
      'slotTooLong',
    );
  });
  it('validează fereastra externă', () => {
    expect(validateResource({ ...baseForm, externalAccess: 'window', externalWindow: { days: [], from: '16:00', to: '20:00' } }).window).toBe(
      'windowDays',
    );
    expect(validateResource({ ...baseForm, externalAccess: 'window', externalWindow: { days: [1], from: '20:00', to: '16:00' } }).window).toBe(
      'windowHours',
    );
  });
});

describe('missingEquipment (FR-07)', () => {
  it('semnalează dotările obligatorii lipsă', () => {
    const r = missingEquipment({ sportIds: ['s-baschet', 's-tenis'], equipment: ['panouri'] }, sports);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ missing: ['fileu'] });
    expect(r[0]?.sport.id).toBe('s-tenis');
  });
  it('nu semnalează nimic când dotările sunt complete', () => {
    expect(missingEquipment({ sportIds: ['s-baschet'], equipment: ['panouri'] }, sports)).toEqual([]);
  });
});

describe('validateRules', () => {
  const ok = Object.fromEntries(NUMERIC_RULE_KEYS.map((k) => [k, String(RULE_LIMITS[k][0] === 0 ? 1 : RULE_LIMITS[k][0])])) as Record<
    NumericRuleKey,
    string
  >;
  it('acceptă valori în interval', () => expect(hasErrors(validateRules(ok))).toBe(false));
  it('respinge goale, zecimale și în afara intervalului', () => {
    const e = validateRules({ ...ok, monthly_quota: '', max_active_bookings: '2.5', no_show_threshold: '999' });
    expect(Object.keys(e).sort()).toEqual(['max_active_bookings', 'monthly_quota', 'no_show_threshold']);
  });
  it('validează cota per sport', () => {
    expect(invalidSportQuotas({ a: '3', b: '-1', c: '' })).toEqual(['b', 'c']);
  });
});

describe('validateAnnouncement', () => {
  const base: AnnouncementForm = {
    messageRo: 'Mesaj',
    messageEn: '',
    resourceId: 'r-1',
    withInterval: false,
    date: '2026-11-20',
    from: '10:00',
    to: '12:00',
  };
  it('acceptă un anunț pentru o resursă', () => expect(hasErrors(validateAnnouncement(base))).toBe(false));
  it('acceptă un anunț doar pentru un interval', () =>
    expect(hasErrors(validateAnnouncement({ ...base, resourceId: '', withInterval: true }))).toBe(false));
  it('cere mesajul în română și o resursă sau un interval', () => {
    expect(validateAnnouncement({ ...base, messageRo: ' ', resourceId: '' })).toMatchObject({
      messageRo: 'messageRequired',
      target: 'targetRequired',
    });
  });
  it('pentru interval cere dată și ore valide', () => {
    const e = validateAnnouncement({ ...base, withInterval: true, date: '', from: '12:00', to: '10:00' });
    expect(e).toMatchObject({ date: 'dateRequired', time: 'timeInvalid' });
  });
});
