import { File as NodeFile } from 'node:buffer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { useSession } from '@/auth/sessionStore';
import UsersPage from '@/features/admin/users/UsersPage';
import { userChanges, validateUserDraft } from '@/features/admin/users/UserFormModal';
import ProfilePage from '@/features/user/profile/ProfilePage';
import { db, resetDb } from '@/mocks/db';
import { server } from '@/mocks/node';
import { signInAs } from './session';

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' });
  // Uploads: jsdom brings its own FormData/File, but fetch and Request (which MSW parses) are Node's.
  // A browser has one implementation of each; here we use Node's for both, only in this file.
  const form = await new Response('a=1', { headers: { 'content-type': 'application/x-www-form-urlencoded' } }).formData();
  vi.stubGlobal('FormData', form.constructor);
  vi.stubGlobal('File', NodeFile);
  // jsdom has no object URLs; the dialog only needs one for the preview of a photo not uploaded yet.
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => undefined }));
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
beforeEach(() => resetDb());

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * jsdom cannot draw images, so prepareAvatar() sends the original (small) file. It is built with Node's File:
 * under jsdom the global File is jsdom's, which Node's FormData (used by fetch/MSW) rejects. Browsers have one File.
 */
const photo = (): File =>
  new NodeFile([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])], 'poza.png', {
    type: 'image/png',
  }) as File;

describe('Utilizatori – creare, editare, fotografie, ștergere (FR-05)', () => {
  beforeEach(async () => {
    await signInAs('admin');
  });

  it('creează un cont nou cu fotografie', async () => {
    const user = userEvent.setup();
    wrap(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Adaugă utilizator' }));
    const dialog = await screen.findByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Adaugă fotografie'), photo());
    await user.type(within(dialog).getByLabelText('Nume complet'), 'Sorin Test');
    await user.type(within(dialog).getByLabelText('Email'), 'sorin.test@univ.example');
    await user.selectOptions(within(dialog).getByLabelText('Rol'), 'teacher');
    await user.type(within(dialog).getByLabelText('Parolă'), 'parola123');
    await user.click(within(dialog).getByRole('button', { name: 'Creează contul' }));

    expect(await screen.findByText('Sorin Test')).toBeInTheDocument();
    const created = db.users.find((u) => u.email === 'sorin.test@univ.example')!;
    expect(created).toMatchObject({ role: 'teacher', status: 'active' });
    expect(created.avatar_url).toMatch(/^data:image\/png;base64,/);
  });

  it('cere telefon pentru externi și o parolă de cel puțin 8 caractere', async () => {
    const user = userEvent.setup();
    wrap(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Adaugă utilizator' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nume complet'), 'Extern Fără Telefon');
    await user.type(within(dialog).getByLabelText('Email'), 'extern@mail.example');
    await user.selectOptions(within(dialog).getByLabelText('Rol'), 'external');
    await user.type(within(dialog).getByLabelText('Parolă'), 'scurt');
    await user.click(within(dialog).getByRole('button', { name: 'Creează contul' }));
    expect(within(dialog).getByText('Externii au nevoie de un număr de telefon.')).toBeInTheDocument();
    expect(within(dialog).getByText('Parola trebuie să aibă cel puțin 8 caractere.')).toBeInTheDocument();
    expect(db.users.some((u) => u.email === 'extern@mail.example')).toBe(false);
  });

  it('modifică numele și rolul unui cont și îi schimbă fotografia', async () => {
    const user = userEvent.setup();
    wrap(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Editează Andrei Popescu' }));
    const dialog = await screen.findByRole('dialog');
    await user.upload(within(dialog).getByLabelText('Adaugă fotografie'), photo());
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /schimbă fotografia/i })).toBeInTheDocument());

    const name = within(dialog).getByLabelText('Nume complet');
    await user.clear(name);
    await user.type(name, 'Andrei Popescu-Rusu');
    await user.selectOptions(within(dialog).getByLabelText('Rol'), 'teacher');
    await user.click(within(dialog).getByRole('button', { name: 'Salvează' }));

    expect(await screen.findByText('Andrei Popescu-Rusu')).toBeInTheDocument();
    expect(db.users.find((u) => u.id === 'u-student-1')).toMatchObject({ full_name: 'Andrei Popescu-Rusu', role: 'teacher' });
  });

  it('administratorul nu își poate schimba propriul rol și nu se poate șterge', async () => {
    const user = userEvent.setup();
    wrap(<UsersPage />);
    const me = useSession.getState().user!;
    await user.click(await screen.findByRole('button', { name: `Editează ${me.full_name}` }));
    expect(within(await screen.findByRole('dialog')).getByLabelText('Rol')).toBeDisabled();
    expect(screen.queryByRole('button', { name: `Șterge ${me.full_name}` })).not.toBeInTheDocument();
  });

  it('șterge un cont; un cont din jurnalul de audit rămâne', async () => {
    const user = userEvent.setup();
    wrap(<UsersPage />);
    await user.click(await screen.findByRole('button', { name: 'Șterge Mihai Ionescu' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Șterge' }));
    await waitFor(() => expect(screen.queryByText('Mihai Ionescu')).not.toBeInTheDocument());
    expect(db.users.some((u) => u.id === 'u-4')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Șterge Dan Rusu' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Șterge' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/jurnalul de audit/i);
    expect(db.users.some((u) => u.id === 'u-admin-2')).toBe(true);
  });
});

describe('Profil – fotografia proprie', () => {
  it('încarcă și șterge fotografia; sesiunea o vede imediat', async () => {
    await signInAs('student');
    const user = userEvent.setup();
    wrap(<ProfilePage />);
    await user.upload(await screen.findByLabelText('Adaugă fotografie'), photo());
    await waitFor(() => expect(useSession.getState().user?.avatar_url).toMatch(/^data:image\/png/));
    expect(await screen.findByRole('button', { name: 'Schimbă fotografia' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Șterge fotografia' }));
    await waitFor(() => expect(useSession.getState().user?.avatar_url).toBeNull());
  });
});

describe('Reguli din formular', () => {
  const base = { full_name: 'Ana Rusu', email: 'ana@example.com', phone: '', role: 'student' as const, password: '' };
  it('parola e obligatorie doar la creare; la editare se trimit doar câmpurile schimbate', () => {
    expect(validateUserDraft(base, true).password).toBeDefined();
    expect(validateUserDraft(base, false)).toEqual({});
    const existing = { id: 'u', full_name: 'Ana Rusu', email: 'ana@example.com', phone: null, role: 'student', status: 'active' } as const;
    expect(userChanges(existing, base)).toEqual({});
    expect(userChanges(existing, { ...base, phone: '+37360000001', password: 'parola-noua' })).toEqual({
      phone: '+37360000001',
      password: 'parola-noua',
    });
  });
});
