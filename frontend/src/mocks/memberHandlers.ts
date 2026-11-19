import { delay, http, HttpResponse } from 'msw';
import { API_BASE, MOCK_LATENCY } from '@/api/config';
import type { Booking, NotificationPreferences, WaitlistEntry } from '@/api/generated';
import { apiError, unauthenticated } from './authHandlers';
import { db } from './db';
import { currentUser } from './session';

/**
 * Rutele utilizatorului din contract (rezervări, cotă, listă de așteptare, preferințe) pentru demo-ul MSW.
 * Starea e în memorie și se resetează la reîncărcarea paginii, ca restul serverului simulat.
 */
const url = (p: string) => `${API_BASE}${p}`;
const QUOTA_LIMIT = 4;

async function lag(): Promise<void> {
  if (MOCK_LATENCY > 0) await delay(MOCK_LATENCY * (0.6 + Math.random() * 0.8));
}

interface MemberState {
  bookings: Booking[];
  waitlist: WaitlistEntry[];
  used: number;
  refunded: number;
  prefs: NotificationPreferences;
}

const state: Record<string, MemberState> = {};

function stateOf(userId: string): MemberState {
  return (state[userId] ??= {
    bookings: [],
    waitlist: [],
    used: 1,
    refunded: 0,
    prefs: { push: true, email: true, sms: false, language: 'ro' },
  });
}

export function resetMemberMocks(): void {
  for (const k of Object.keys(state)) delete state[k];
}

/** Numele resursei din datele demo ale panoului de admin (dacă există). */
function resourceName(id: string): string {
  const resources = (db as unknown as { resources?: { id: string; name: string }[] }).resources ?? [];
  return resources.find((r) => r.id === id)?.name ?? 'Teren';
}

const qrFor = (b: Booking) => `${b.id}.demo-nonce.demo-signature`;

function withUser<T extends unknown[]>(fn: (userId: string, s: MemberState, ...args: T) => Promise<Response> | Response) {
  return async (...args: T) => {
    await lag();
    const user = currentUser();
    if (!user) return unauthenticated();
    return fn(user.id, stateOf(user.id), ...args);
  };
}

const notFound = () => apiError(404, 'NOT_FOUND', 'Resursa nu există.', 'Not found.');
const remaining = (s: MemberState) => Math.max(0, QUOTA_LIMIT - (s.used - s.refunded));

export const memberHandlers = [
  http.get(
    url('/me/quota'),
    withUser((_id, s) => {
      const now = new Date();
      return HttpResponse.json({
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        limit: QUOTA_LIMIT,
        used: s.used,
        refunded: s.refunded,
        remaining: remaining(s),
      });
    }),
  ),

  http.get(
    url('/me/bookings'),
    withUser((_id, s, { request }: { request: Request }) => {
      const scope = new URL(request.url).searchParams.get('scope') ?? 'upcoming';
      const now = Date.now();
      const items = s.bookings.filter((b) =>
        scope === 'history' ? b.status !== 'active' || Date.parse(b.end) <= now : b.status === 'active' && Date.parse(b.end) > now,
      );
      return HttpResponse.json({ page: 1, page_size: 50, total: items.length, items });
    }),
  ),

  http.post(
    url('/bookings'),
    withUser(async (userId, s, { request }: { request: Request }) => {
      const body = (await request.json()) as { resource_id: string; start: string; participants_count?: number };
      const user = currentUser()!;
      if (user.role === 'student' && remaining(s) === 0) {
        return apiError(422, 'QUOTA_EXHAUSTED', 'Ai folosit toate intrările din această lună.', 'You have used all entries this month.');
      }
      const start = new Date(body.start);
      const end = new Date(start.getTime() + 60 * 60_000);
      const clash = Object.values(state)
        .flatMap((m) => m.bookings)
        .some((b) => b.status === 'active' && b.resource_id === body.resource_id && b.start === start.toISOString());
      if (clash) {
        return HttpResponse.json(
          {
            code: 'SLOT_TAKEN',
            message_ro: 'Intervalul tocmai a fost ocupat.',
            message_en: 'This slot was just taken.',
            waitlist_offer: { resource_id: body.resource_id, start: start.toISOString(), end: end.toISOString() },
          },
          { status: 409 },
        );
      }
      const booking: Booking = {
        id: crypto.randomUUID(),
        resource_id: body.resource_id,
        resource_name: resourceName(body.resource_id),
        user_id: userId,
        start: start.toISOString(),
        end: end.toISOString(),
        status: 'active',
        participants_count: body.participants_count ?? 1,
        message_ro: 'Rezervare confirmată. Te așteptăm!',
        message_en: 'Booking confirmed. See you there!',
      };
      booking.qr_token = qrFor(booking);
      s.bookings.push(booking);
      if (user.role === 'student') s.used += 1;
      return HttpResponse.json(booking, { status: 201 });
    }),
  ),

  http.get(
    url('/bookings/:id'),
    withUser((_id, s, { params }: { params: Record<string, unknown> }) => {
      const b = s.bookings.find((x) => x.id === String(params.id));
      return b ? HttpResponse.json({ ...b, qr_token: qrFor(b) }) : notFound();
    }),
  ),

  http.delete(
    url('/bookings/:id'),
    withUser((_id, s, { params }: { params: Record<string, unknown> }) => {
      const b = s.bookings.find((x) => x.id === String(params.id));
      if (!b) return notFound();
      if (b.status !== 'active') return apiError(409, 'BOOKING_NOT_ACTIVE', 'Rezervarea nu mai este activă.', 'The booking is no longer active.');
      b.status = 'cancelled';
      b.cancel_source = 'user';
      const refunded = Date.parse(b.start) - Date.now() >= 2 * 3600_000;
      if (refunded && currentUser()?.role === 'student') s.refunded += 1;
      return HttpResponse.json({ booking: b, quota_refunded: refunded });
    }),
  ),

  http.get(
    url('/bookings/:id/calendar.ics'),
    withUser((_id, s, { params }: { params: Record<string, unknown> }) => {
      const b = s.bookings.find((x) => x.id === String(params.id));
      if (!b) return notFound();
      const z = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//CampusSport//Demo//RO',
        'BEGIN:VEVENT',
        `UID:booking-${b.id}@campussport`,
        `DTSTAMP:${z(new Date().toISOString())}`,
        `DTSTART:${z(b.start)}`,
        `DTEND:${z(b.end)}`,
        `SUMMARY:CampusSport – ${b.resource_name}`,
        'END:VEVENT',
        'END:VCALENDAR',
        '',
      ].join('\r\n');
      return new HttpResponse(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
    }),
  ),

  http.get(
    url('/me/waitlist'),
    withUser((_id, s) => HttpResponse.json(s.waitlist)),
  ),

  http.post(
    url('/waitlist'),
    withUser(async (_id, s, { request }: { request: Request }) => {
      const body = (await request.json()) as { day: string; resource_id?: string; start?: string; end?: string };
      if (s.waitlist.some((w) => w.status === 'waiting' && w.resource_id === body.resource_id && w.start === body.start)) {
        return apiError(409, 'ALREADY_ON_WAITLIST', 'Ești deja pe lista de așteptare.', 'You are already on the waitlist.');
      }
      const entry: WaitlistEntry = {
        id: crypto.randomUUID(),
        day: body.day,
        resource_id: body.resource_id ?? null,
        start: body.start ?? null,
        end: body.end ?? null,
        priority: 2,
        status: 'waiting',
      };
      s.waitlist.push(entry);
      return HttpResponse.json(entry, { status: 201 });
    }),
  ),

  http.delete(
    url('/waitlist/:id'),
    withUser((_id, s, { params }: { params: Record<string, unknown> }) => {
      const i = s.waitlist.findIndex((w) => w.id === String(params.id));
      if (i < 0) return notFound();
      s.waitlist.splice(i, 1);
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  http.post(
    url('/waitlist/:id/accept'),
    withUser(() => apiError(409, 'OFFER_EXPIRED', 'Oferta a expirat.', 'The offer has expired.')),
  ),

  http.get(
    url('/me/notification-preferences'),
    withUser((_id, s) => HttpResponse.json(s.prefs)),
  ),

  http.put(
    url('/me/notification-preferences'),
    withUser(async (_id, s, { request }: { request: Request }) => {
      s.prefs = (await request.json()) as NotificationPreferences;
      return HttpResponse.json(s.prefs);
    }),
  ),

  http.delete(
    url('/me'),
    withUser(() => new HttpResponse(null, { status: 204 })),
  ),
];
