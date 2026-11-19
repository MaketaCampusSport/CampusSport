import { http as mswHttp, HttpResponse } from 'msw';
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

describe('Contract API', () => {
  it('trimite parametrii de interogare în URL (regresie buildUrl)', async () => {
    let seen = '';
    server.use(
      mswHttp.get('http://localhost/api/v1/admin/dashboard', ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json({});
      }),
    );
    await api.dashboard.get('2026-11-17');
    expect(seen).toBe('?date=2026-11-17');
  });

  it('setările circulă nemodificate (round-trip)', async () => {
    const s = await api.settings.get();
    expect(s.quotaMonthly).toBe(4);
    const saved = await api.settings.update({ ...s, quotaMonthly: 5 });
    expect(saved.quotaMonthly).toBe(5);
    expect((await api.settings.get()).windowStudentDays).toBe(s.windowStudentDays);
  });

  it('jurnalul de audit folosește o singură rută', async () => {
    const page = await api.audit.list({ period: '30d', page: 1, pageSize: 5 });
    expect(page.items.length).toBeGreaterThan(0);
  });
});
