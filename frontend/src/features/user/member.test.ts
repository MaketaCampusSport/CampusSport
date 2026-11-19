import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client } from '@/api/client';
import type { Slot } from '@/api/generated';
import { useSession } from '@/auth/sessionStore';
import { resetDb } from '@/mocks/db';
import { resetMemberMocks } from '@/mocks/memberHandlers';
import { server } from '@/mocks/node';
import { setCurrentUser } from '@/mocks/session';
import { signInAs } from '@/test/session';
import { slotView } from './booking/SearchPage';
import { checkInWindow, dayKey, fmtTime } from './lib';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  resetDb();
  resetMemberMocks();
  setCurrentUser(null);
  useSession.getState().clear();
});

const slot = (over: Partial<Slot>): Slot => ({
  start: '2026-11-05T16:00:00Z',
  end: '2026-11-05T17:00:00Z',
  status: 'free',
  bookable: true,
  ...over,
});

describe('grila de disponibilitate (FR-09)', () => {
  it('mapează stările slotului la ce poate face utilizatorul', () => {
    expect(slotView(slot({}))).toBe('free');
    expect(slotView(slot({ bookable: false }))).toBe('unavailable');
    expect(slotView(slot({ status: 'occupied', bookable: false, waitlist_available: true }))).toBe('waitlist');
    expect(slotView(slot({ status: 'occupied', bookable: false }))).toBe('unavailable');
    expect(slotView(slot({ status: 'mine', bookable: false }))).toBe('mine');
    expect(slotView(slot({ status: 'blocked', bookable: false, block_kind: 'pe_class' }))).toBe('pe_class');
    expect(slotView(slot({ status: 'blocked', bookable: false, block_kind: 'emergency' }))).toBe('unavailable');
  });
});

describe('orele bazei (Europe/Chisinau, DST)', () => {
  it('afișează ora locală a bazei, nu ora UTC din ISO', () => {
    expect(fmtTime('2026-07-01T15:00:00Z')).toBe('18:00'); // EEST, +03:00
    expect(fmtTime('2026-11-05T16:00:00Z')).toBe('18:00'); // EET, +02:00
    expect(checkInWindow('2026-11-05T16:00:00Z')).toBe('17:50 – 18:15');
  });

  it('cheia zilei folosește fusul bazei', () => {
    expect(dayKey('2026-11-05T22:30:00Z')).toBe('2026-11-06');
  });
});

describe('fluxul de rezervare pe serverul simulat', () => {
  it('cere autentificare pentru rutele utilizatorului', async () => {
    await expect(client.me.bookings()).rejects.toMatchObject({ status: 401 });
  });

  it('rezervă, listează, anulează și restituie intrarea', async () => {
    await signInAs('student');
    const before = await client.me.quota();
    // Un slot liber, rezervabil, de poimâine (după fereastra de anulare gratuită).
    const [sport] = await client.catalog.sports();
    const grid = await client.availability.get({ sport: sport!.id, date: dayKey(new Date(Date.now() + 2 * 86_400_000)) });
    const free = grid.resources.flatMap((r) => r.slots.map((s) => ({ r, s }))).find(({ s }) => s.bookable);
    expect(free).toBeDefined();
    const resource_id = free!.r.resource_id;
    const start = free!.s.start;

    const booking = await client.bookings.create({ resource_id, start });
    expect(booking.qr_token).toContain(booking.id);
    expect((await client.me.quota()).remaining).toBe(before.remaining - 1);
    expect((await client.me.bookings({ scope: 'upcoming' })).items.map((b) => b.id)).toContain(booking.id);

    await expect(client.bookings.create({ resource_id, start })).rejects.toMatchObject({
      status: 409,
      code: 'SLOT_TAKEN',
      body: { waitlist_offer: { resource_id } },
    });

    // Același slot apare acum ca „al meu” în grilă și cu titularul în panoul adminului.
    const after = await client.availability.get({ sport: sport!.id, date: dayKey(start) });
    expect(after.resources.find((r) => r.resource_id === resource_id)?.slots.find((s) => s.start === start)?.status).toBe('mine');

    const result = await client.bookings.cancel(booking.id);
    expect(result.quota_refunded).toBe(true);
    expect((await client.me.quota()).remaining).toBe(before.remaining);
    expect((await client.me.bookings({ scope: 'history' })).items.find((b) => b.id === booking.id)?.status).toBe('cancelled');
  });

  it('lista de așteptare refuză dublurile', async () => {
    await signInAs('student');
    const entry = { day: '2026-11-05', resource_id: 'r-1', start: '2026-11-05T16:00:00Z', end: '2026-11-05T17:00:00Z' };
    await client.waitlist.join(entry);
    await expect(client.waitlist.join(entry)).rejects.toMatchObject({ code: 'ALREADY_ON_WAITLIST' });
    expect(await client.me.waitlist()).toHaveLength(1);
  });
});
