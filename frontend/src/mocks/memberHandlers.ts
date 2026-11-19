import { delay, http, HttpResponse } from 'msw';
import { API_BASE, MOCK_LATENCY } from '@/api/config';
import type { Booking, NotificationPreferences, User, WaitlistEntry } from '@/api/generated';
import { apiError, unauthenticated } from './authHandlers';
import { db, iso, parseDay, slotsForDay, type MockBooking } from './db';
import { blocksOverlapping, bookingsOverlapping, staffCheckIn } from './occupancy';
import { currentUser } from './session';

/**
 * Rutele utilizatorului din contract (rezervări, cotă, listă de așteptare, preferințe, check-in) pentru demo-ul MSW.
 * Rezervările stau în `db.bookings`, aceleași pe care le văd panoul zilei și lista de rezervări a adminului.
 */
const url = (p: string) => `${API_BASE}${p}`;

async function lag(): Promise<void> {
  if (MOCK_LATENCY > 0) await delay(MOCK_LATENCY * (0.6 + Math.random() * 0.8));
}

interface MemberState {
  waitlist: WaitlistEntry[];
  prefs: NotificationPreferences;
}

const state: Record<string, MemberState> = {};
/** Rezervările anulate la timp, a căror intrare s-a restituit. */
const refunded = new Set<string>();

function stateOf(userId: string): MemberState {
  return (state[userId] ??= { waitlist: [], prefs: { push: true, email: true, sms: false, language: 'ro' } });
}

export function resetMemberMocks(): void {
  for (const k of Object.keys(state)) delete state[k];
  refunded.clear();
}

type Info = { request: Request; params: Record<string, unknown> };

function withUser(fn: (user: User, s: MemberState, info: Info) => Promise<Response> | Response) {
  return async (info: Info) => {
    await lag();
    const user = currentUser();
    if (!user) return unauthenticated();
    return fn(user, stateOf(user.id), info);
  };
}

const notFound = () => apiError(404, 'NOT_FOUND', 'Resursa nu există.', 'Not found.');
const own = (user: User, id: unknown) => db.bookings.find((b) => b.id === String(id) && b.user_id === user.id);
/** Răspunsul public: fără câmpurile interne ale demo-ului. */
const toBooking = ({ holder_name: _h, category: _c, ...b }: MockBooking): Booking => b;

function quotaOf(user: User) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const mine = db.bookings.filter((b) => b.user_id === user.id && b.start.slice(0, 7) === month);
  const used = mine.length;
  const back = mine.filter((b) => refunded.has(b.id)).length;
  const limit = db.settings.monthly_quota;
  return { month: `${month}-01`, limit, used, refunded: back, remaining: Math.max(0, limit - (used - back)) };
}

export const memberHandlers = [
  http.get(
    url('/me/quota'),
    withUser((user) => HttpResponse.json(quotaOf(user))),
  ),

  http.get(
    url('/me/bookings'),
    withUser((user, _s, { request }) => {
      const scope = new URL(request.url).searchParams.get('scope') ?? 'upcoming';
      const now = Date.now();
      const items = db.bookings
        .filter((b) => b.user_id === user.id)
        .filter((b) =>
          scope === 'history'
            ? b.status !== 'active' || Date.parse(b.end) <= now
            : b.status === 'active' && Date.parse(b.end) > now,
        )
        .map(toBooking);
      return HttpResponse.json({ page: 1, page_size: 50, total: items.length, items });
    }),
  ),

  http.post(
    url('/bookings'),
    withUser(async (user, _s, { request }) => {
      const body = (await request.json()) as { resource_id: string; start: string; participants_count?: number };
      const resource = db.resources.find((r) => r.id === body.resource_id);
      if (!resource) return notFound();
      const start = new Date(body.start);
      const slot = slotsForDay(resource, parseDay(body.start.slice(0, 10))).find(
        (s) => s.start.getTime() === start.getTime(),
      );
      if (!slot) return apiError(422, 'INVALID_SLOT', 'Ora nu corespunde unui slot.', 'This time is not a slot start.');
      if (user.role === 'student' && quotaOf(user).remaining === 0) {
        return apiError(422, 'QUOTA_EXHAUSTED', 'Ai folosit toate intrările din această lună.', 'You have used all entries this month.');
      }
      const offer = { resource_id: resource.id, start: iso(slot.start), end: iso(slot.end) };
      const blocked = blocksOverlapping(resource.id, slot.start, slot.end).length > 0;
      if (blocked || bookingsOverlapping(resource.id, slot.start, slot.end, true).length > 0) {
        const code = blocked ? 'SLOT_BLOCKED' : 'SLOT_TAKEN';
        return HttpResponse.json(
          {
            code,
            message_ro: blocked ? 'Intervalul este blocat.' : 'Intervalul tocmai a fost ocupat.',
            message_en: blocked ? 'This slot is blocked.' : 'This slot was just taken.',
            waitlist_offer: offer,
          },
          { status: 409 },
        );
      }
      const id = crypto.randomUUID();
      const booking: MockBooking = {
        id,
        resource_id: resource.id,
        resource_name: resource.name,
        user_id: user.id,
        holder_name: user.full_name,
        category: user.role === 'external' ? 'external' : 'member',
        start: offer.start,
        end: offer.end,
        status: 'active',
        checked_in_at: null,
        participants_count: body.participants_count ?? 1,
        qr_token: `${id}.${Math.random().toString(36).slice(2, 10)}.demo`,
      };
      db.bookings.push(booking);
      return HttpResponse.json(
        { ...toBooking(booking), message_ro: 'Rezervare confirmată. Te așteptăm!', message_en: 'Booking confirmed. See you there!' },
        { status: 201 },
      );
    }),
  ),

  http.get(
    url('/bookings/:id'),
    withUser((user, _s, { params }) => {
      const b = own(user, params.id);
      return b ? HttpResponse.json(toBooking(b)) : notFound();
    }),
  ),

  http.delete(
    url('/bookings/:id'),
    withUser((user, _s, { params }) => {
      const b = own(user, params.id);
      if (!b) return notFound();
      if (b.status !== 'active') {
        return apiError(409, 'BOOKING_NOT_ACTIVE', 'Rezervarea nu mai este activă.', 'The booking is no longer active.');
      }
      b.status = 'cancelled';
      b.cancel_source = 'user';
      const quotaRefunded = Date.parse(b.start) - Date.now() >= 2 * 3600_000;
      if (quotaRefunded) refunded.add(b.id);
      return HttpResponse.json({ booking: toBooking(b), quota_refunded: quotaRefunded });
    }),
  ),

  /** Titularul confirmă cu butonul; personalul (admin) scanează QR-ul. */
  http.post(
    url('/bookings/:id/check-in'),
    withUser(async (user, _s, { request, params }) => {
      const body = (await request.json()) as { method: 'qr' | 'button'; qr_token?: string };
      if (body.method === 'qr') {
        if (user.role !== 'admin') return apiError(403, 'FORBIDDEN', 'Doar personalul scanează coduri QR.', 'Only staff scan QR codes.');
        const outcome = staffCheckIn(String(params.id), body.qr_token);
        if (!outcome.ok) return apiError(outcome.status, outcome.code, outcome.message_ro, outcome.message_en);
        return HttpResponse.json(outcome.result);
      }
      const b = own(user, params.id);
      if (!b) return notFound();
      const outcome = staffCheckIn(b.id, b.qr_token);
      if (!outcome.ok) return apiError(outcome.status, outcome.code, outcome.message_ro, outcome.message_en);
      return HttpResponse.json(outcome.result);
    }),
  ),

  http.get(
    url('/bookings/:id/calendar.ics'),
    withUser((user, _s, { params }) => {
      const b = own(user, params.id);
      if (!b) return notFound();
      const z = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
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
    withUser((_u, s) => HttpResponse.json(s.waitlist)),
  ),

  http.post(
    url('/waitlist'),
    withUser(async (user, s, { request }) => {
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
        priority: user.role === 'teacher' ? 1 : user.role === 'student' ? 2 : 3,
        status: 'waiting',
      };
      s.waitlist.push(entry);
      return HttpResponse.json(entry, { status: 201 });
    }),
  ),

  http.delete(
    url('/waitlist/:id'),
    withUser((_u, s, { params }) => {
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
    withUser((_u, s) => HttpResponse.json(s.prefs)),
  ),

  http.put(
    url('/me/notification-preferences'),
    withUser(async (_u, s, { request }) => {
      s.prefs = (await request.json()) as NotificationPreferences;
      return HttpResponse.json(s.prefs);
    }),
  ),

  http.delete(
    url('/me'),
    withUser(() => new HttpResponse(null, { status: 204 })),
  ),
];
