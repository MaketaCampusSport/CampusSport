import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http as mswHttp, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client } from '@/api/client';
import '@/i18n';
import { EmergencyBlockDialog } from '@/features/admin/blocks/EmergencyBlockDialog';
import CheckInPage, { bookingIdFromToken } from '@/features/admin/checkin/CheckInPage';
import { toDateKey } from '@/lib/dates';
import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { staffCheckIn } from '@/mocks/occupancy';
import { signInAs } from './session';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(async () => {
  resetDb();
  await signInAs('admin');
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('API simulat – autentificare', () => {
  it('respinge un cod TOTP greșit', async () => {
    resetDb();
    await expect(client.auth.verifyTwoFactor('demo', '000000')).rejects.toMatchObject({ status: 401, code: 'OTP_INVALID' });
  });
});

describe('Blocare de urgență (FR-40/FR-41, SDD 7.3)', () => {
  it('anulează rezervările active suprapuse, marchează sloturile și raportează livrarea', async () => {
    const activeBefore = db.bookings.filter((b) => b.resource_id === 'r-court-2' && b.status === 'active' && new Date(b.end) > new Date());
    const result = await client.admin.createBlock({ resource_id: 'r-court-2', kind: 'emergency', reason: 'Țeavă spartă', end: null });
    expect(result.block).toMatchObject({ resource_id: 'r-court-2', kind: 'emergency', end: null });
    expect(result.cancelled_bookings_count).toBe(activeBefore.length);
    expect(result.notified_users_count).toBe(new Set(activeBefore.map((b) => b.user_id)).size);

    const day = await client.admin.dashboard(toDateKey(new Date()));
    const row = day.resources.find((r) => r.resource_id === 'r-court-2')!;
    const future = row.slots.filter((s) => new Date(s.end) > new Date());
    expect(future.every((s) => s.status === 'blocked' && s.block_kind === 'emergency')).toBe(true);

    const now = new Date();
    const active = await client.admin.blocks({ from: now.toISOString(), to: new Date(now.getTime() + 60_000).toISOString() });
    expect(active.items.some((b) => b.id === result.block.id)).toBe(true);

    const delivery = await client.admin.blockDelivery(result.block.id);
    expect(delivery.notified).toBe(result.notified_users_count);
    expect(delivery.delivered).toBeLessThanOrEqual(delivery.notified);

    const audit = await client.admin.auditLog({ entity: 'occupancy', page_size: 5 });
    expect(audit.items[0]).toMatchObject({ action: 'block.create', entity_id: result.block.id });

    await client.admin.deleteBlock(result.block.id);
    expect(db.blocks.some((b) => b.id === result.block.id)).toBe(false);
  });

  it('o blocare peste una de același nivel primește 409 BLOCK_CONFLICT', async () => {
    // b-1: mentenanță activă acum pe sala de fitness.
    await expect(client.admin.createBlock({ resource_id: 'r-fitness', kind: 'emergency', reason: 'Inundație' })).rejects.toMatchObject({
      status: 409,
      code: 'BLOCK_CONFLICT',
    });
  });

  it('recurența răspunde 501, ca serverul', async () => {
    await expect(
      client.admin.createBlock({ resource_id: 'r-court-2', kind: 'maintenance', reason: 'x', recurrence: { rule: 'FREQ=WEEKLY', valid_from: '2026-11-01', valid_to: '2026-12-01' } }),
    ).rejects.toMatchObject({ status: 501 });
  });

  it('dialogul cere un motiv când se alege „Alt motiv” și trimite blocarea altfel', async () => {
    const user = userEvent.setup();
    let closed = false;
    wrap(<EmergencyBlockDialog resource={{ id: 'r-court-2', name: 'Terenul 2' }} onClose={() => (closed = true)} />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/motiv/i), 'other');
    expect(await screen.findByRole('alert')).toHaveTextContent(/motiv/i);
    expect(screen.getByRole('button', { name: /blochează acum/i })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/motiv/i, { selector: 'select' }), 'burst');
    const confirm = screen.getByRole('button', { name: /blochează acum/i });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() => expect(closed).toBe(true));
    expect(db.blocks.some((b) => b.resource_id === 'r-court-2' && b.kind === 'emergency' && b.reason === 'Țeavă spartă')).toBe(true);
  });
});

describe('Check-in la intrare (FR-15)', () => {
  it('identificatorul rezervării este primul segment al tokenului', () => {
    expect(bookingIdFromToken('bk-1.abc.sig')).toBe('bk-1');
    expect(bookingIdFromToken(' bk-1.abc.sig ')).toBe('bk-1');
    expect(bookingIdFromToken('DEMO-OK')).toBeNull();
    expect(bookingIdFromToken('a..b')).toBeNull();
  });

  it('logica de check-in a mock-ului respectă fereastra și tokenul', () => {
    const b = db.bookings.find((x) => x.status === 'active')!;
    expect(staffCheckIn(b.id, 'gresit')).toMatchObject({ ok: false, code: 'QR_INVALID' });
    const start = new Date(b.start);
    expect(staffCheckIn(b.id, b.qr_token, new Date(start.getTime() - 3 * 3600_000))).toMatchObject({ ok: false, code: 'CHECKIN_WINDOW_CLOSED' });
    b.checked_in_at = null;
    expect(staffCheckIn(b.id, b.qr_token, start)).toMatchObject({ ok: true, result: { booking_id: b.id, holder_name: b.holder_name } });
    expect(staffCheckIn(b.id, b.qr_token, start)).toMatchObject({ ok: false, code: 'ALREADY_CHECKED_IN' });
  });

  it('pagina trimite tokenul la POST /bookings/{id}/check-in și arată titularul', async () => {
    let body: unknown = null;
    server.use(
      mswHttp.post('http://localhost/api/v1/bookings/:id/check-in', async ({ request, params }) => {
        body = { id: params.id, ...((await request.json()) as object) };
        return HttpResponse.json({ booking_id: params.id, checked_in_at: new Date().toISOString(), holder_name: 'Ana Rusu', category: 'external' });
      }),
    );
    const user = userEvent.setup();
    wrap(<CheckInPage />);
    await user.type(screen.getByLabelText(/conținutul codului qr/i), 'bk-7.n0nce.s1g');
    await user.click(screen.getByRole('button', { name: /verifică/i }));
    expect(await screen.findByText('Ana Rusu')).toBeInTheDocument();
    expect(screen.getByText(/persoană externă/i)).toBeInTheDocument();
    expect(body).toEqual({ id: 'bk-7', method: 'qr', qr_token: 'bk-7.n0nce.s1g' });
  });

  it('pagina traduce codurile de eroare ale serverului', async () => {
    server.use(
      mswHttp.post('http://localhost/api/v1/bookings/:id/check-in', () =>
        HttpResponse.json({ code: 'CHECKIN_WINDOW_CLOSED', message_ro: 'x', message_en: 'x' }, { status: 422 }),
      ),
    );
    const user = userEvent.setup();
    wrap(<CheckInPage />);
    await user.type(screen.getByLabelText(/conținutul codului qr/i), 'bk-7.n0nce.s1g');
    await user.click(screen.getByRole('button', { name: /verifică/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nu este permis acum/i);
  });

  it('un cod fără forma tokenului e respins local', async () => {
    const user = userEvent.setup();
    wrap(<CheckInPage />);
    await user.type(screen.getByLabelText(/conținutul codului qr/i), 'DEMO-OK');
    await user.click(screen.getByRole('button', { name: /verifică/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/nu este valid/i);
  });
});
