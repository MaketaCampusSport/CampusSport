import { describe, expect, it } from 'vitest';
import type { Sport } from '@/api/types';
import { RULE_LIMITS, hasErrors, missingEquipment, validateAnnouncement, validateResource, validateRules, type NumericRuleKey, type ResourceFormState } from './validators';

const baseForm: ResourceFormState = {
  name: 'Teren 1', capacity: '10', sportIds: ['s-baschet'], equipment: ['panouri'], opensAt: '08:00', closesAt: '22:00',
  slotMinutes: 60, externalAccess: 'never', externalWindow: { days: [1], from: '16:00', to: '20:00' },
};
const sports: Sport[] = [
  { id: 's-baschet', nameRo: 'Baschet', nameEn: 'Basketball', requiredEquipment: ['panouri'] },
  { id: 's-tenis', nameRo: 'Tenis', nameEn: 'Tennis', requiredEquipment: ['fileu'] },
];

describe('validateResource', () => {
  it('acceptă o resursă validă', () => expect(hasErrors(validateResource(baseForm))).toBe(false));
  it('cere denumire, capacitate validă și cel puțin un sport', () => {
    const e = validateResource({ ...baseForm, name: ' ', capacity: '0', sportIds: [] });
    expect(e).toMatchObject({ name: 'nameRequired', capacity: 'capacityInvalid', sports: 'sportRequired' });
  });
  it('respinge program inversat și interval mai lung decât programul', () => {
    expect(validateResource({ ...baseForm, closesAt: '07:00' }).hours).toBe('hoursInvalid');
    expect(validateResource({ ...baseForm, opensAt: '08:00', closesAt: '09:00', slotMinutes: 120 }).slot).toBe('slotTooLong');
  });
  it('validează fereastra externă', () => {
    expect(validateResource({ ...baseForm, externalAccess: 'window', externalWindow: { days: [], from: '16:00', to: '20:00' } }).window).toBe('windowDays');
    expect(validateResource({ ...baseForm, externalAccess: 'window', externalWindow: { days: [1], from: '20:00', to: '16:00' } }).window).toBe('windowHours');
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
  const ok = Object.fromEntries((Object.keys(RULE_LIMITS) as NumericRuleKey[]).map((k) => [k, String(RULE_LIMITS[k][0] === 0 ? 1 : RULE_LIMITS[k][0])])) as Record<NumericRuleKey, string>;
  it('acceptă valori în interval', () => expect(hasErrors(validateRules(ok))).toBe(false));
  it('respinge goale, zecimale și în afara intervalului', () => {
    const e = validateRules({ ...ok, quotaMonthly: '', maxActiveFuture: '2.5', noShowLimit: '99' });
    expect(Object.keys(e).sort()).toEqual(['maxActiveFuture', 'noShowLimit', 'quotaMonthly']);
  });
});

describe('validateAnnouncement', () => {
  const base = { category: 'general', title: 'Salut', message: 'Mesaj', channels: ['push'], audience: 'all_with_bookings', resourceId: null, date: null, allDay: true, from: null, to: null } as const;
  it('acceptă un anunț complet', () => expect(hasErrors(validateAnnouncement({ ...base, channels: ['push'] }))).toBe(false));
  it('cere titlu, mesaj, canal', () => {
    expect(validateAnnouncement({ ...base, title: '', message: '', channels: [] })).toMatchObject({ title: 'titleRequired', message: 'messageRequired', channels: 'channelRequired' });
  });
  it('pentru interval cere resursă, dată și ore valide', () => {
    const e = validateAnnouncement({ ...base, audience: 'interval', channels: ['push'], allDay: false, from: '12:00', to: '10:00' });
    expect(e).toMatchObject({ resource: 'resourceRequired', date: 'dateRequired', time: 'timeInvalid' });
  });
});
