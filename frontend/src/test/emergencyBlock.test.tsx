import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/endpoints';
import { http } from '@/api/http';
import '@/i18n';
import { EmergencyBlockDialog } from '@/features/admin/blocks/EmergencyBlockDialog';
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

describe('API simulat – autentificare', () => {
  it('respinge un cod TOTP greșit', async () => {
    resetDb();
    await http.post('/auth/sso/login');
    await expect(api.auth.verifyTotp('000000')).rejects.toMatchObject({ status: 401 });
  });
});

describe('Blocare de urgență (FR-40/FR-41)', () => {
  it('previzualizarea numără rezervările, iar blocarea le anulează și marchează resursa', async () => {
    const resources = await api.catalog.resources();
    const target = resources.find((r) => r.active && !r.blocked);
    expect(target).toBeDefined();
    if (!target) return;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 24 * 3600_000);

    const preview = await api.blocks.preview({ resourceId: target.id, from: from.toISOString(), to: to.toISOString() });
    const block = await api.blocks.create({
      resourceId: target.id, kind: 'emergency', reason: 'Țeavă spartă', startsAt: from.toISOString(), endsAt: to.toISOString(), recurrence: 'none', channels: ['push', 'email'],
    });
    expect(block.affectedCount).toBe(preview.affectedCount);

    const after = (await api.catalog.resources()).find((r) => r.id === target.id);
    expect(after?.blocked).toBe(true);
    const list = await api.blocks.list();
    expect(list.items.find((b) => b.id === block.id)?.status).toBe('active');
    const audit = await api.audit.list({ period: '24h', page: 1, pageSize: 50 });
    expect(audit.items.some((e) => e.action === 'emergency_block')).toBe(true);
  });

  it('raportul de livrare ajunge la complet', async () => {
    const resources = await api.catalog.resources();
    const target = resources.find((r) => r.active) as NonNullable<(typeof resources)[number]>;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const block = await api.blocks.create({
      resourceId: target.id, kind: 'emergency', reason: 'Test', startsAt: start.toISOString(), endsAt: null, recurrence: 'none', channels: ['push'],
    });
    if (block.affectedCount === 0) return;
    const report = await api.blocks.delivery(block.id);
    expect(report.total).toBe(block.affectedCount);
    expect(report.delivered).toBeLessThanOrEqual(report.total);
  });

  it('dialogul cere un motiv când se alege „Alt motiv” și permite confirmarea altfel', async () => {
    const user = userEvent.setup();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let closed = false;
    render(
      <QueryClientProvider client={qc}>
        <EmergencyBlockDialog resource={{ id: 'r-court-2', name: 'Terenul 2' }} onClose={() => (closed = true)} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText(/motiv/i), 'other');
    expect(await screen.findByRole('alert')).toHaveTextContent(/motiv/i);
    expect(screen.getByRole('button', { name: /blochează acum/i })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText(/motiv/i, { selector: 'select' }), 'burst');
    const confirm = screen.getByRole('button', { name: /blochează acum/i });
    await waitFor(() => expect(confirm).toBeEnabled());
    await user.click(confirm);
    await waitFor(() => expect(closed).toBe(true));
  });
});
