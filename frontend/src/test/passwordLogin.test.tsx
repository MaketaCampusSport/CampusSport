import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '@/i18n';
import { useSession } from '@/auth/sessionStore';
import MemberLoginPage from '@/features/auth/MemberLoginPage';
import { resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { MOCK_PASSWORD, MOCK_USERS, setCurrentUser } from '@/mocks/session';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  setCurrentUser(null);
  useSession.setState({ status: 'unknown', user: null });
});

function renderLogin(path = '/login') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<MemberLoginPage />} />
          <Route path="/user" element={<p>pagina membrului</p>} />
          <Route path="/admin" element={<p>panoul de administrare</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Autentificare cu email și parolă (FR-01)', () => {
  it('intră cu parola corectă și arată eroarea pentru una greșită', async () => {
    const student = MOCK_USERS.find((u) => u.role === 'student')!;
    const user = userEvent.setup();
    renderLogin();

    await user.type(await screen.findByLabelText('Email'), student.email);
    await user.type(screen.getByLabelText('Parolă'), 'gresita1');
    await user.click(screen.getByRole('button', { name: 'Intră' }));
    expect(await screen.findByText(/emailul sau parola nu sunt corecte/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Parolă'));
    await user.type(screen.getByLabelText('Parolă'), MOCK_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Intră' }));
    expect(await screen.findByText('pagina membrului')).toBeInTheDocument();
  });

  it('creează un cont de profesor și deschide sesiunea', async () => {
    const user = userEvent.setup();
    renderLogin('/login?mode=register');

    await user.type(await screen.findByLabelText('Nume complet'), 'Elena Munteanu-Test');
    await user.type(screen.getByLabelText('Email'), 'elena.ui.test@example.edu');
    await user.type(screen.getByLabelText('Parolă'), 'parola-noua');
    await user.click(screen.getByRole('radio', { name: 'Profesor' }));
    await user.click(screen.getByRole('button', { name: 'Creează contul' }));

    expect(await screen.findByText('pagina membrului')).toBeInTheDocument();
    expect(useSession.getState().user).toMatchObject({ email: 'elena.ui.test@example.edu', role: 'teacher' });
  });

  it('nu mai arată SSO, externii sau legătura spre panoul de administrare', async () => {
    renderLogin();
    await screen.findByLabelText('Email');
    expect(screen.queryByText(/contul universității/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/extern/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ești administrator/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/autentificare de dezvoltare/i)).not.toBeInTheDocument();
  });
});
