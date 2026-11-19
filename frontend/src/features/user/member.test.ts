import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client } from '@/api/client';
import type { Slot } from '@/api/generated';
import { useSession } from '@/auth/sessionStore';
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
    const start = new Date(Date.now() + 26 * 3600_000).toISOString();

    const booking = await client.bookings.create({ resource_id: 'r-1', start });
    expect(booking.qr_token).toContain(booking.id);
    expect((await client.me.quota()).remaining).toBe(before.remaining - 1);
    expect((await client.me.bookings({ scope: 'upcoming' })).items.map((b) => b.id)).toEqual([booking.id]);

    await expect(client.bookings.create({ resource_id: 'r-1', start })).rejects.toMatchObject({
      status: 409,
      code: 'SLOT_TAKEN',
      body: { waitlist_offer: { resource_id: 'r-1' } },
    });

    const result = await client.bookings.cancel(booking.id);
    expect(result.quota_refunded).toBe(true);
    expect((await client.me.quota()).remaining).toBe(before.remaining);
    expect((await client.me.bookings({ scope: 'history' })).items[0]?.status).toBe('cancelled');
  });

  it('lista de așteptare refuză dublurile', async () => {
    await signInAs('student');
    const entry = { day: '2026-11-05', resource_id: 'r-1', start: '2026-11-05T16:00:00Z', end: '2026-11-05T17:00:00Z' };
    await client.waitlist.join(entry);
    await expect(client.waitlist.join(entry)).rejects.toMatchObject({ code: 'ALREADY_ON_WAITLIST' });
    expect(await client.me.waitlist()).toHaveLength(1);
  });
});
