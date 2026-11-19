import { http as mswHttp, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client } from '@/api/client';
import { toDateKey } from '@/lib/dates';
import { ADMIN, resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { signInAs } from './session';

const BASE = 'http://localhost/api/v1';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  resetDb();
  await signInAs('admin');
});

describe('Contract API (assets/livrabil05/openapi.yaml)', () => {
  it('trimite parametrii de interogare în URL (regresie buildUrl)', async () => {
    let seen = '';
    server.use(
      mswHttp.get(`${BASE}/admin/dashboard`, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json({ date: '2026-11-17', resources: [], check_ins_count: 0, no_shows_count: 0 });
      }),
    );
    await client.admin.dashboard('2026-11-17');
    expect(seen).toBe('?date=2026-11-17');
  });

  it('filtrele jurnalului de audit sunt cele din spec (actor, entity, from, page, page_size)', async () => {
    let seen: URLSearchParams | null = null;
    server.use(
      mswHttp.get(`${BASE}/admin/audit-log`, ({ request }) => {
        seen = new URL(request.url).searchParams;
        return HttpResponse.json({ page: 1, page_size: 5, total: 0, items: [] });
      }),
    );
    await client.admin.auditLog({ actor: ADMIN.id, entity: 'resource', from: '2026-11-01T00:00:00Z', page: 1, page_size: 5 });
    expect(Object.fromEntries(seen!)).toEqual({ actor: ADMIN.id, entity: 'resource', from: '2026-11-01T00:00:00Z', page: '1', page_size: '5' });
  });

  it('setările circulă în snake_case (round-trip)', async () => {
    const s = await client.admin.settings();
    expect(s.monthly_quota).toBe(4);
    const { updated_at: _a, updated_by: _b, ...writable } = s;
    const saved = await client.admin.updateSettings({ ...writable, monthly_quota: 5 });
    expect(saved.monthly_quota).toBe(5);
    expect((await client.admin.settings()).booking_window_days_student).toBe(s.booking_window_days_student);
  });

  it('setările nevalide primesc 422 cu details.fields', async () => {
    const s = await client.admin.settings();
    await expect(client.admin.updateSettings({ ...s, no_show_threshold: 0 })).rejects.toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      details: { fields: { no_show_threshold: expect.any(Array) } },
    });
  });

  it('jurnalul de audit este paginat și înregistrează mutațiile', async () => {
    await client.admin.updateSettings({ ...(await client.admin.settings()), cancel_free_hours: 3 });
    const page = await client.admin.auditLog({ entity: 'settings', page: 1, page_size: 5 });
    expect(page).toMatchObject({ page: 1, page_size: 5 });
    expect(page.items[0]).toMatchObject({ action: 'settings.update', entity: 'settings', actor_id: ADMIN.id });
  });

  it('erorile au forma { code, message_ro, message_en }', async () => {
    const missing = await fetch(`${BASE}/resources/nu-exista`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ code: 'NOT_FOUND', message_ro: expect.any(String), message_en: expect.any(String) });
  });

  it('disponibilitatea are sloturi cu stare și, pentru admin, titularul', async () => {
    const a = await client.availability.get({ resource: 'r-court-2', date: toDateKey(new Date()) });
    expect(a.resources).toHaveLength(1);
    const slots = a.resources[0]!.slots;
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => ['free', 'occupied', 'mine', 'blocked'].includes(s.status))).toBe(true);
    const occupied = slots.find((s) => s.status === 'occupied');
    if (occupied) expect(occupied.holder_name).toEqual(expect.any(String));
  });

  it('lista blocărilor filtrează după tip și interval', async () => {
    const now = new Date();
    const page = await client.admin.blocks({ kind: 'maintenance', from: now.toISOString(), to: new Date(now.getTime() + 60_000).toISOString() });
    expect(page.items.map((b) => b.id)).toEqual(['b-1']);
  });
});
