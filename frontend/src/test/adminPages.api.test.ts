import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/endpoints';
import { http } from '@/api/http';
import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  resetDb();
  await http.post('/auth/sso/login');
  await api.auth.verifyTotp('123456');
});

describe('Sporturi (NFR-14)', () => {
  it('creează, modifică și șterge un sport', async () => {
    const created = await api.sports.create({ nameRo: 'Badminton', nameEn: 'Badminton', requiredEquipment: ['fileu'] });
    expect((await api.catalog.sports()).some((s) => s.id === created.id)).toBe(true);
    const updated = await api.sports.update(created.id, { nameRo: 'Badminton 2', nameEn: 'Badminton', requiredEquipment: [] });
    expect(updated.nameRo).toBe('Badminton 2');
    await api.sports.remove(created.id);
    expect((await api.catalog.sports()).some((s) => s.id === created.id)).toBe(false);
  });

  it('refuză ștergerea unui sport folosit de o resursă', async () => {
    await expect(api.sports.remove('s-fotbal')).rejects.toMatchObject({ status: 409 });
  });
});

describe('Utilizatori (FR-05)', () => {
  it('suspendă și reactivează un cont', async () => {
    const u = (await api.users.list({ role: 'student', status: 'active' }))[0];
    if (!u) throw new Error('lipsește un student activ în datele demo');
    const s = await api.users.suspend(u.id, { days: 14, reason: 'No-show repetat' });
    expect(s.status).toBe('suspended');
    const r = await api.users.reactivate(u.id);
    expect(r.status).toBe('active');
  });

  it('validează durata suspendării', async () => {
    await expect(api.users.suspend('u-1', { days: 0, reason: 'x' })).rejects.toMatchObject({ status: 422 });
  });
});

describe('Check-in (FR-03 / FR-15)', () => {
  it('acceptă un cod valid', async () => {
    expect((await api.checkin.verify('DEMO-OK')).outcome).toBe('ok');
  });

  it('respinge un cod necunoscut', async () => {
    await expect(api.checkin.verify('xyz')).rejects.toMatchObject({ status: 422 });
  });
});

describe('2FA administrator (NFR-08)', () => {
  it('configurează TOTP', async () => {
    const setup = await api.account.totpSetup();
    expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    await expect(api.account.totpConfirm('000000')).rejects.toMatchObject({ status: 422 });
    await expect(api.account.totpConfirm('123456')).resolves.toBeUndefined();
  });
});
