import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api } from '@/api/endpoints';
import { http } from '@/api/http';
import '@/i18n';
import SportsPage from '@/features/admin/sports/SportsPage';
import UsersPage from '@/features/admin/users/UsersPage';
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

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

describe('Accesibilitate (NFR-07) – structură', () => {
  it('pagina Sporturi nu are încălcări axe', async () => {
    const { container } = wrap(<SportsPage />);
    await screen.findByText('Fotbal');
    const results = await axe.run(container, OPTIONS);
    expect(results.violations).toEqual([]);
  });

  it('pagina Utilizatori nu are încălcări axe', async () => {
    const { container } = wrap(<UsersPage />);
    await screen.findByText('Andrei Popescu');
    const results = await axe.run(container, OPTIONS);
    expect(results.violations).toEqual([]);
  });
});
