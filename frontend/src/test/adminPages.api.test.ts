import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client } from '@/api/client';
import { toDateKey, toMonthKey } from '@/lib/dates';
import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { signInAs } from './session';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  resetDb();
  await signInAs('admin');
});

describe('Sporturi (NFR-14)', () => {
  it('creează și înlocuiește un sport (POST + PUT, fără ștergere)', async () => {
    const created = await client.admin.createSport({ name_ro: 'Badminton', name_en: 'Badminton', icon: 'badminton', required_equipment: ['fileu'] });
    expect((await client.catalog.sports()).some((s) => s.id === created.id)).toBe(true);
    const updated = await client.admin.updateSport(created.id, { name_ro: 'Badminton 2', name_en: 'Badminton', icon: 'badminton', required_equipment: [] });
    expect(updated).toMatchObject({ name_ro: 'Badminton 2', required_equipment: [] });
  });

  it('validează pictograma (422 VALIDATION_FAILED)', async () => {
    await expect(
      client.admin.createSport({ name_ro: 'X', name_en: 'X', icon: 'Nu Valid', required_equipment: [] }),
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
  });
});

describe('Resurse (FR-39)', () => {
  it('creează o resursă cu program săptămânal și o dezactivează', async () => {
    const created = await client.admin.createResource({
      name: 'Teren nou',
      type: 'teren',
      location: 'Campus',
      capacity: 8,
      sport_ids: ['s-baschet'],
      equipment: ['panouri'],
      opening_hours: { mon: [{ open: '09:00', close: '18:00' }] },
      slot_minutes: 60,
      external_access: 'never',
    });
    expect(created.opening_hours).toEqual({ mon: [{ open: '09:00', close: '18:00' }] });
    const off = await client.admin.updateResource(created.id, { active: false });
    expect(off.active).toBe(false);
    expect((await client.catalog.resources()).some((r) => r.id === created.id)).toBe(false);
    expect((await client.catalog.resources({ include_inactive: true })).some((r) => r.id === created.id)).toBe(true);
  });

  it('cere câmpurile obligatorii la creare', async () => {
    await expect(client.admin.createResource({ name: 'Fără restul' })).rejects.toMatchObject({ status: 422 });
  });
});

describe('Utilizatori (FR-05)', () => {
  it('listează paginat, suspendă până la o dată și reactivează', async () => {
    const page = await client.admin.users({ role: 'student', status: 'active', page_size: 2 });
    expect(page).toMatchObject({ page: 1, page_size: 2 });
    expect(page.items).toHaveLength(2);
    const u = page.items[0]!;
    const until = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const s = await client.admin.suspendUser(u.id, { until, reason: 'No-show repetat' });
    expect(s).toMatchObject({ status: 'suspended' });
    expect(new Date(s.suspended_until as string).getTime()).toBeCloseTo(new Date(until).getTime(), -4);
    expect((await client.admin.reactivateUser(u.id)).status).toBe('active');
  });

  it('respinge o dată de suspendare din trecut', async () => {
    await expect(client.admin.suspendUser('u-2', { until: '2020-01-01T00:00:00Z', reason: 'x' })).rejects.toMatchObject({ status: 422 });
  });
});

describe('Rezervări (admin)', () => {
  it('listează rezervările zilei și anulează una cu motiv', async () => {
    const today = toDateKey(new Date());
    const list = await client.admin.bookings({ date: today, status: 'active', page_size: 100 });
    const target = list.items.find((b) => new Date(b.start) > new Date());
    if (!target) return; // seara târziu nu mai există rezervări active azi
    expect(target).not.toHaveProperty('holder_name');
    await expect(client.admin.cancelBooking(target.id, ' ')).rejects.toMatchObject({ status: 422 });
    const res = await client.admin.cancelBooking(target.id, 'Teren indisponibil');
    expect(res).toMatchObject({ quota_refunded: true, booking: { id: target.id, status: 'cancelled', cancel_source: 'admin' } });
    await expect(client.admin.cancelBooking(target.id, 'din nou')).rejects.toMatchObject({ status: 409, code: 'BOOKING_NOT_ACTIVE' });
  });

  it('filtrează după resursă și stare', async () => {
    const page = await client.admin.bookings({ resource: 'r-court-2', status: 'completed', page_size: 100 });
    expect(page.items.every((b) => b.resource_id === 'r-court-2' && b.status === 'completed')).toBe(true);
  });
});

describe('Anunțuri', () => {
  it('cere o resursă sau un interval', async () => {
    await expect(client.admin.announce({ message_ro: 'Salut' })).rejects.toMatchObject({ status: 422 });
  });

  it('întoarce numărul destinatarilor', async () => {
    const res = await client.admin.announce({ resource_id: 'r-football-1', message_ro: 'Teren ud' });
    expect(res.recipients_count).toBeGreaterThanOrEqual(0);
    expect(db.audit[0]?.action).toBe('announcement.create');
  });
});

describe('Rapoarte (FR-44)', () => {
  it('raportul lunar are forma MonthlyReport, iar CSV-ul se descarcă', async () => {
    const month = toMonthKey(new Date());
    const r = await client.admin.report(month);
    expect(r.month).toBe(month);
    expect(r.occupancy[0]).toMatchObject({ resource_id: expect.any(String), rate: expect.any(Number) });
    expect(r.occupancy.every((o) => o.rate >= 0 && o.rate <= 1)).toBe(true);
    const csv = await client.admin.reportFile(month, 'csv');
    expect(csv.size).toBeGreaterThan(0);
    expect(csv.type).toContain('text/csv');
  });

  it('PDF-ul răspunde 501 ca serverul', async () => {
    await expect(client.admin.reportFile('2026-10', 'pdf')).rejects.toMatchObject({ status: 501 });
  });
});

describe('Rute încă neimplementate pe server', () => {
  it('orarul EF și evenimentele răspund 501 NOT_IMPLEMENTED', async () => {
    await expect(client.admin.createEvent({ resource_id: 'r-multi', reason: 'Gală', start: new Date().toISOString(), end: new Date().toISOString() })).rejects.toMatchObject({
      status: 501,
      code: 'NOT_IMPLEMENTED',
    });
    await expect(client.admin.confirmScheduleImport('imp-1')).rejects.toMatchObject({ status: 501 });
  });
});

describe('Autorizare (x-min-role: admin)', () => {
  it('un student primește 403 pe rutele de administrare', async () => {
    await signInAs('student');
    await expect(client.admin.settings()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });
});
