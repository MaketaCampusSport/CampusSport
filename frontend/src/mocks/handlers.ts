import { addDays, addMinutes } from 'date-fns';
import { delay, http, HttpResponse } from 'msw';
import { API_BASE, MOCK_LATENCY } from '@/api/config';
import type {
  AnnouncementCreate,
  Block,
  BlockCreate,
  Booking,
  Dashboard,
  DeliveryStatus,
  MonthlyReport,
  ResourceInput,
  Settings,
  SettingsWritable,
  Sport,
  SportInput,
  User,
} from '@/api/client';
import { toCsv } from '@/lib/csv';
import { addAudit, ADMIN, blockOverlaps, dateKey, db, hash, iso, nextId, parseDay, rng, type MockBooking, type MockResource } from './db';
import { availabilityFor, BLOCK_LEVEL, blocksOverlapping, bookingsOverlapping, cancelOverlapping } from './occupancy';
import { currentUser } from './session';

/**
 * Serverul simulat pentru catalog, disponibilitate și administrare, pe rutele și formele din
 * assets/livrabil05/openapi.yaml. Rutele membrilor (/bookings, /waitlist, /me*) sunt în memberHandlers.ts.
 */

const url = (p: string) => `${API_BASE}${p}`;

async function lag(): Promise<void> {
  if (MOCK_LATENCY > 0) await delay(MOCK_LATENCY * (0.6 + Math.random() * 0.8));
}

function err(status: number, code: string, ro: string, en: string, details?: Record<string, unknown>) {
  return HttpResponse.json({ code, message_ro: ro, message_en: en, ...(details ? { details } : {}) }, { status });
}

const notFound = () => err(404, 'NOT_FOUND', 'Resursa cerută nu există.', 'The requested item does not exist.');
const notImplemented = () =>
  err(501, 'NOT_IMPLEMENTED', 'Funcția nu este încă disponibilă pe server.', 'This feature is not available on the server yet.');

function invalid(fields: Record<string, string[]>) {
  return err(422, 'VALIDATION_FAILED', 'Datele trimise nu sunt valide.', 'The submitted data is not valid.', { fields });
}

/** Rutele cu `x-min-role: admin`: 401 fără sesiune, 403 pentru ceilalți utilizatori. */
function guard(): Response | null {
  if (db.session === 'ok') return null;
  return currentUser()
    ? err(403, 'FORBIDDEN', 'Nu ai drepturi pentru această operație.', 'You are not allowed to do this.')
    : err(401, 'UNAUTHENTICATED', 'Autentifică-te pentru a continua.', 'Sign in to continue.');
}

function adminViewer(): User {
  return db.users.find((u) => u.id === ADMIN.id) as User;
}

function paginate<T>(list: T[], p: URLSearchParams) {
  const page = Math.max(1, Number(p.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(p.get('page_size') ?? 20) || 20));
  return { page, page_size: pageSize, total: list.length, items: list.slice((page - 1) * pageSize, page * pageSize) };
}

/** Rezervarea așa cum o vede API-ul de administrare (fără câmpurile interne ale mock-ului și fără QR). */
function bookingDto(b: MockBooking): Booking {
  const { holder_name: _h, category: _c, qr_token: _q, ...rest } = b;
  return rest;
}

const icon = /^[a-z0-9-]{1,40}$/;

function sportErrors(input: Partial<SportInput>): Record<string, string[]> | null {
  const f: Record<string, string[]> = {};
  if (!input.name_ro?.trim()) f.name_ro = ['required'];
  if (!input.name_en?.trim()) f.name_en = ['required'];
  if (!input.icon || !icon.test(input.icon)) f.icon = ['must match ^[a-z0-9-]{1,40}$'];
  if (!Array.isArray(input.required_equipment)) f.required_equipment = ['must be an array'];
  return Object.keys(f).length ? f : null;
}

function resourceErrors(input: ResourceInput, partial: boolean): Record<string, string[]> | null {
  const f: Record<string, string[]> = {};
  const need = <K extends keyof ResourceInput>(k: K, ok: (v: NonNullable<ResourceInput[K]>) => boolean) => {
    const v = input[k];
    if (v === undefined) {
      if (!partial) f[k] = ['required'];
    } else if (v === null || !ok(v as NonNullable<ResourceInput[K]>)) f[k] = ['invalid'];
  };
  need('name', (v) => v.trim().length > 0);
  need('type', (v) => v.trim().length > 0);
  need('location', (v) => v.trim().length > 0);
  need('capacity', (v) => Number.isInteger(v) && v >= 1);
  need('sport_ids', (v) => Array.isArray(v) && v.every((id) => db.sports.some((s) => s.id === id)));
  need('opening_hours', (v) => typeof v === 'object');
  if (input.slot_minutes !== undefined && !(Number.isInteger(input.slot_minutes) && input.slot_minutes >= 15)) f.slot_minutes = ['min 15'];
  return Object.keys(f).length ? f : null;
}

/* ───────────── Rapoarte (date sintetice, deterministe pe lună) ───────────── */
const HOURLY_BASE = [22, 38, 33, 47, 57, 42, 52, 72, 88, 95, 92, 78, 52, 33];
const PER_RESOURCE: Record<string, number> = {
  'r-football-1': 0.92, 'r-fitness': 0.81, 'r-court-2': 0.74, 'r-football-2': 0.66, 'r-multi': 0.55, 'r-tennis': 0.48, 'r-pool': 0.37,
};

function buildReport(month: string): MonthlyReport {
  const r = rng(hash(month));
  const round = (v: number) => Math.round(v * 10000) / 10000;
  const occupancy = db.resources
    .filter((x) => x.active)
    .map((x) => {
      const rate = Math.min(0.99, (PER_RESOURCE[x.id] ?? 0.4) * (0.9 + r() * 0.2));
      const avg = HOURLY_BASE.reduce((s, v) => s + v, 0) / HOURLY_BASE.length;
      return {
        resource_id: x.id,
        resource_name: x.name,
        rate: round(rate),
        by_hour: HOURLY_BASE.map((base, i) => ({ hour: 8 + i, rate: round(Math.min(1, (base / avg) * rate * (0.9 + r() * 0.2))) })),
      };
    });
  const members = Math.round(800 + r() * 300);
  return {
    month,
    occupancy,
    no_shows_count: Math.round(25 + r() * 25),
    bookings_by_category: { members, externals: Math.round(members * (0.15 + r() * 0.1)) },
    users_reaching_limit_count: Math.round(100 + r() * 70),
  };
}

/** Același format ca serverul: un tabel CSV plat, o metrică pe rând. */
function reportCsv(report: MonthlyReport): string {
  const rows: (string | number | null)[][] = [['month', 'metric', 'resource_id', 'resource_name', 'hour', 'value']];
  for (const o of report.occupancy) {
    rows.push([report.month, 'occupancy_rate', o.resource_id, o.resource_name, null, o.rate]);
    for (const h of o.by_hour) rows.push([report.month, 'occupancy_rate_by_hour', o.resource_id, o.resource_name, h.hour, h.rate]);
  }
  rows.push([report.month, 'no_shows_count', null, null, null, report.no_shows_count]);
  rows.push([report.month, 'bookings_members', null, null, null, report.bookings_by_category.members]);
  rows.push([report.month, 'bookings_externals', null, null, null, report.bookings_by_category.externals]);
  rows.push([report.month, 'users_reaching_limit_count', null, null, null, report.users_reaching_limit_count]);
  return toCsv(rows);
}

const SETTINGS_LIMITS: Record<Exclude<keyof SettingsWritable, 'monthly_quota_per_sport' | 'member_replaces_external'>, [number, number]> = {
  monthly_quota: [0, 100],
  max_active_bookings: [1, 50],
  booking_window_days_student: [1, 365],
  booking_window_days_teacher: [1, 365],
  booking_window_hours_external: [1, 720],
  cancel_free_hours: [0, 72],
  checkin_minutes_before: [0, 120],
  checkin_minutes_after: [0, 120],
  no_show_threshold: [1, 100],
  no_show_suspension_days: [0, 365],
  waitlist_offer_minutes: [1, 1440],
  waitlist_simultaneous_under_hours: [0, 72],
  default_slot_minutes: [15, 480],
};

/** Resursele care se potrivesc filtrului `sport` (identificator; acceptă și numele/pictograma, ca alias). */
function resourcesForSport(sport: string | null): MockResource[] {
  if (!sport) return db.resources;
  const key = sport.toLowerCase();
  const ids = db.sports
    .filter((s) => [s.id, s.icon, s.name_ro, s.name_en].some((v) => v.toLowerCase() === key))
    .map((s) => s.id);
  return db.resources.filter((r) => r.sport_ids.some((id) => ids.includes(id)));
}

/* ───────────── Handlers ───────────── */
export const handlers = [
  /* Catalog public */
  http.get(url('/sports'), async () => {
    await lag();
    return HttpResponse.json(db.sports);
  }),
  http.get(url('/resources'), async ({ request }) => {
    await lag();
    const p = new URL(request.url).searchParams;
    const includeInactive = p.get('include_inactive') === 'true' && db.session === 'ok';
    return HttpResponse.json(resourcesForSport(p.get('sport')).filter((r) => includeInactive || r.active));
  }),
  http.get(url('/resources/:id'), async ({ params }) => {
    await lag();
    const r = db.resources.find((x) => x.id === params.id);
    if (!r || (!r.active && db.session !== 'ok')) return notFound();
    return HttpResponse.json(r);
  }),

  /* Disponibilitate (FR-09): după resursă sau după sport */
  http.get(url('/availability'), async ({ request }) => {
    await lag();
    const p = new URL(request.url).searchParams;
    const date = p.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid({ date: ['required, YYYY-MM-DD'] });
    const resource = p.get('resource');
    const list = resource ? db.resources.filter((r) => r.id === resource) : resourcesForSport(p.get('sport'));
    if (resource && list.length === 0) return notFound();
    const viewer = currentUser();
    const day = parseDay(date);
    return HttpResponse.json({ date, resources: list.filter((r) => r.active).map((r) => availabilityFor(r, day, viewer)) });
  }),

  /* Sporturi (NFR-14) – nu există ștergere în contract */
  http.post(url('/admin/sports'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const input = (await request.json()) as SportInput;
    const fields = sportErrors(input);
    if (fields) return invalid(fields);
    const created: Sport = { ...input, id: nextId('s') };
    db.sports.push(created);
    addAudit('sport.create', 'sport', created.id, { ...created });
    return HttpResponse.json(created, { status: 201 });
  }),
  http.put(url('/admin/sports/:id'), async ({ request, params }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const s = db.sports.find((x) => x.id === params.id);
    if (!s) return notFound();
    const input = (await request.json()) as SportInput;
    const fields = sportErrors(input);
    if (fields) return invalid(fields);
    const before = { ...s };
    Object.assign(s, { name_ro: input.name_ro, name_en: input.name_en, icon: input.icon, required_equipment: input.required_equipment });
    addAudit('sport.update', 'sport', s.id, { ...s }, before);
    return HttpResponse.json(s);
  }),

  /* Resurse (FR-39) */
  http.post(url('/admin/resources'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const input = (await request.json()) as ResourceInput;
    const fields = resourceErrors(input, false);
    if (fields) return invalid(fields);
    const created: MockResource = {
      id: nextId('r'),
      name: input.name!.trim(),
      type: input.type!.trim(),
      location: input.location!.trim(),
      photo_url: input.photo_url ?? null,
      capacity: input.capacity!,
      equipment: input.equipment ?? [],
      sport_ids: input.sport_ids!,
      opening_hours: input.opening_hours!,
      slot_minutes: input.slot_minutes ?? db.settings.default_slot_minutes,
      external_access: input.external_access ?? 'never',
      external_access_windows: input.external_access_windows,
      active: input.active ?? true,
    };
    db.resources.push(created);
    addAudit('resource.create', 'resource', created.id, { ...created });
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch(url('/admin/resources/:id'), async ({ request, params }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const r = db.resources.find((x) => x.id === params.id);
    if (!r) return notFound();
    const patch = (await request.json()) as ResourceInput;
    const fields = resourceErrors(patch, true);
    if (fields) return invalid(fields);
    const before = { ...r };
    Object.assign(r, patch);
    addAudit('resource.update', 'resource', r.id, { ...patch }, before);
    return HttpResponse.json(r);
  }),

  /* Panoul zilei (FR-43) */
  http.get(url('/admin/dashboard'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const date = new URL(request.url).searchParams.get('date') ?? dateKey(new Date());
    const day = parseDay(date);
    const next = addDays(day, 1);
    const ofDay = db.bookings.filter((b) => new Date(b.start) >= day && new Date(b.start) < next);
    const data: Dashboard = {
      date,
      resources: db.resources.filter((r) => r.active).map((r) => availabilityFor(r, day, adminViewer())),
      check_ins_count: ofDay.filter((b) => b.checked_in_at && b.status !== 'cancelled').length,
      no_shows_count: ofDay.filter((b) => b.status === 'no_show').length,
    };
    return HttpResponse.json(data);
  }),

  /* Rezervări (admin) */
  http.get(url('/admin/bookings'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const resource = p.get('resource');
    const status = p.get('status');
    const date = p.get('date');
    const day = date ? parseDay(date) : null;
    const list = db.bookings
      .filter(
        (b) =>
          (!resource || b.resource_id === resource) &&
          (!status || b.status === status) &&
          (!day || (new Date(b.start) >= day && new Date(b.start) < addDays(day, 1))),
      )
      .sort((a, b) => (day ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)))
      .map(bookingDto);
    return HttpResponse.json(paginate(list, p));
  }),
  http.post(url('/admin/bookings/:id/cancel'), async ({ request, params }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const b = db.bookings.find((x) => x.id === params.id);
    if (!b) return notFound();
    const { reason } = (await request.json()) as { reason?: string };
    if (!reason?.trim()) return invalid({ reason: ['required'] });
    if (b.status !== 'active') return err(409, 'BOOKING_NOT_ACTIVE', 'Rezervarea nu mai este activă.', 'The booking is no longer active.');
    b.status = 'cancelled';
    b.cancel_source = 'admin';
    b.cancel_reason = reason.trim();
    addAudit('booking.cancel', 'occupancy', b.id, { status: 'cancelled', reason: b.cancel_reason }, { status: 'active' });
    return HttpResponse.json({ booking: bookingDto(b), quota_refunded: true });
  }),
  http.patch(url('/admin/bookings/:id'), async ({ request, params }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const b = db.bookings.find((x) => x.id === params.id);
    if (!b) return notFound();
    const { start, reason } = (await request.json()) as { start?: string; reason?: string };
    const s = start ? new Date(start) : null;
    if (!s || Number.isNaN(s.getTime()) || !reason?.trim()) return invalid({ ...(s ? {} : { start: ['required'] }), ...(reason?.trim() ? {} : { reason: ['required'] }) });
    const e = addMinutes(s, (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000);
    if (blocksOverlapping(b.resource_id, s, e).length) return err(409, 'SLOT_BLOCKED', 'Intervalul este blocat.', 'The slot is blocked.');
    if (bookingsOverlapping(b.resource_id, s, e).some((x) => x.id !== b.id)) return err(409, 'SLOT_TAKEN', 'Intervalul este ocupat.', 'The slot is taken.');
    const before = { start: b.start, end: b.end };
    b.start = iso(s);
    b.end = iso(e);
    addAudit('booking.reschedule', 'occupancy', b.id, { start: b.start, end: b.end, reason }, before);
    return HttpResponse.json(bookingDto(b));
  }),

  /* Blocări (FR-40…42, SDD 7.3) */
  http.get(url('/admin/blocks'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const resource = p.get('resource');
    const kind = p.get('kind');
    const from = p.get('from') ? new Date(p.get('from') as string) : null;
    const to = p.get('to') ? new Date(p.get('to') as string) : null;
    const list = db.blocks
      .filter(
        (b) =>
          (!resource || b.resource_id === resource) &&
          (!kind || b.kind === kind) &&
          (!(from || to) || blockOverlaps(b, from ?? new Date(-8.64e15), to)),
      )
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
    return HttpResponse.json(paginate(list, p));
  }),
  http.post(url('/admin/blocks'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const input = (await request.json()) as BlockCreate;
    if (input.recurrence) return notImplemented();
    const fields: Record<string, string[]> = {};
    if (input.kind !== 'emergency' && input.kind !== 'maintenance') fields.kind = ['must be emergency or maintenance'];
    if (!input.reason?.trim()) fields.reason = ['required'];
    const start = input.start ? new Date(input.start) : new Date();
    const end = input.end ? new Date(input.end) : null;
    if (end && end <= start) fields.end = ['must be after start'];
    if (Object.keys(fields).length) return invalid(fields);
    const resource = db.resources.find((r) => r.id === input.resource_id);
    if (!resource) return notFound();

    const overlapping = blocksOverlapping(resource.id, start, end);
    if (overlapping.some((b) => BLOCK_LEVEL[b.kind] >= BLOCK_LEVEL[input.kind])) {
      return err(409, 'BLOCK_CONFLICT', 'Există deja o blocare pe acest interval.', 'There is already a block in this interval.');
    }
    // SRS 9.1: urgența și mentenanța înlătură orele EF și evenimentele suprapuse.
    db.blocks = db.blocks.filter((b) => !overlapping.includes(b));
    const cancelled = cancelOverlapping(resource.id, start, end, input.kind, input.reason.trim());
    const block: Block = {
      id: nextId('b'),
      resource_id: resource.id,
      kind: input.kind,
      start: iso(start),
      end: end ? iso(end) : null,
      reason: input.reason.trim(),
      recurrence_id: null,
      created_by: ADMIN.id,
    };
    db.blocks.push(block);
    const notified = new Set(cancelled.map((b) => b.user_id)).size;
    db.deliveries.set(block.id, { startedAtMs: Date.now(), notified });
    addAudit('block.create', 'occupancy', block.id, { kind: block.kind, reason: block.reason, cancelled_bookings_count: cancelled.length });
    return HttpResponse.json(
      { block, cancelled_bookings_count: cancelled.length, superseded_blocks_count: overlapping.length, notified_users_count: notified },
      { status: 201 },
    );
  }),
  http.delete(url('/admin/blocks/:id'), async ({ params }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const b = db.blocks.find((x) => x.id === params.id);
    if (!b) return notFound();
    db.blocks = db.blocks.filter((x) => x !== b);
    addAudit('block.delete', 'occupancy', b.id, null, { kind: b.kind, reason: b.reason });
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(url('/admin/blocks/:id/delivery'), async ({ params }) => {
    const denied = guard();
    if (denied) return denied;
    if (!db.blocks.some((x) => x.id === params.id)) return notFound();
    const d = db.deliveries.get(String(params.id)) ?? { startedAtMs: Date.now(), notified: 0 };
    const delivered = Math.min(d.notified, Math.floor(((Date.now() - d.startedAtMs) / 1000) * 8));
    const push = Math.round(delivered * 0.9);
    const report: DeliveryStatus = { notified: d.notified, delivered, failed: 0, by_channel: { push, email: delivered, sms: delivered - push } };
    return HttpResponse.json(report);
  }),

  /* Orar EF și evenimente: serverul răspunde încă 501 (backend/README.md) */
  http.post(url('/admin/schedule/import'), () => guard() ?? notImplemented()),
  http.post(url('/admin/schedule/import/:id/confirm'), () => guard() ?? notImplemented()),
  http.post(url('/admin/schedule/classes'), () => guard() ?? notImplemented()),
  http.delete(url('/admin/schedule/recurrences/:id'), () => guard() ?? notImplemented()),
  http.post(url('/admin/events'), () => guard() ?? notImplemented()),

  /* Anunțuri */
  http.post(url('/admin/announcements'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const input = (await request.json()) as AnnouncementCreate;
    const fields: Record<string, string[]> = {};
    if (!input.message_ro?.trim()) fields.message_ro = ['required'];
    if (!input.resource_id && !(input.start && input.end)) fields.resource_id = ['resource_id or start+end required'];
    if (input.start && input.end && new Date(input.end) <= new Date(input.start)) fields.end = ['must be after start'];
    if (Object.keys(fields).length) return invalid(fields);
    const from = input.start ? new Date(input.start) : new Date();
    const to = input.end ? new Date(input.end) : null;
    const recipients = new Set(
      db.bookings
        .filter((b) => b.status === 'active' && (!input.resource_id || b.resource_id === input.resource_id))
        .filter((b) => new Date(b.end) > from && (to === null || new Date(b.start) < to))
        .map((b) => b.user_id),
    ).size;
    addAudit('announcement.create', 'announcement', nextId('an'), { ...input, recipients_count: recipients });
    return HttpResponse.json({ recipients_count: recipients }, { status: 202 });
  }),

  /* Rapoarte (FR-44) */
  http.get(url('/admin/reports'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const month = p.get('month');
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return invalid({ month: ['required, YYYY-MM'] });
    const format = p.get('format') ?? 'json';
    if (format === 'pdf') return notImplemented();
    const report = buildReport(month);
    if (format === 'csv') {
      return new HttpResponse(reportCsv(report), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="raport-${month}.csv"` },
      });
    }
    return HttpResponse.json(report);
  }),

  /* Reguli (FR-46) */
  http.get(url('/admin/settings'), async () => {
    await lag();
    return guard() ?? HttpResponse.json(db.settings);
  }),
  http.put(url('/admin/settings'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const next = (await request.json()) as SettingsWritable;
    const fields: Record<string, string[]> = {};
    for (const [k, [min, max]] of Object.entries(SETTINGS_LIMITS)) {
      const v = next[k as keyof typeof SETTINGS_LIMITS];
      if (!Number.isInteger(v) || v < min || v > max) fields[k] = [`integer ${min}–${max}`];
    }
    if (typeof next.member_replaces_external !== 'boolean') fields.member_replaces_external = ['boolean'];
    if (Object.keys(fields).length) return invalid(fields);
    const before = { ...db.settings };
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => JSON.stringify(before[k as keyof Settings]) !== JSON.stringify(v)));
    db.settings = { ...next, monthly_quota_per_sport: next.monthly_quota_per_sport ?? {}, updated_by: ADMIN.id, updated_at: iso(new Date()) };
    if (Object.keys(changed).length) addAudit('settings.update', 'settings', null, changed, before);
    return HttpResponse.json(db.settings);
  }),

  /* Jurnal audit (FR-45) */
  http.get(url('/admin/audit-log'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const actor = p.get('actor');
    const entity = p.get('entity');
    const from = p.get('from') ? new Date(p.get('from') as string).getTime() : null;
    const to = p.get('to') ? new Date(p.get('to') as string).getTime() : null;
    const list = db.audit
      .filter((e) => {
        const t = new Date(e.at).getTime();
        return (!actor || e.actor_id === actor) && (!entity || e.entity === entity) && (from === null || t >= from) && (to === null || t < to);
      })
      .sort((a, b) => b.at.localeCompare(a.at));
    return HttpResponse.json(paginate(list, p));
  }),

  /* Utilizatori (FR-05) */
  http.get(url('/admin/users'), async ({ request }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const p = new URL(request.url).searchParams;
    const q = (p.get('q') ?? '').trim().toLowerCase();
    const role = p.get('role');
    const status = p.get('status');
    const list = db.users.filter(
      (u) =>
        (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!role || u.role === role) &&
        (!status || u.status === status),
    );
    return HttpResponse.json(paginate(list, p));
  }),
  http.post(url('/admin/users/:id/suspend'), async ({ request, params }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const u = db.users.find((x) => x.id === params.id);
    if (!u) return notFound();
    const { until, reason } = (await request.json()) as { until?: string; reason?: string };
    const untilDate = until ? new Date(until) : null;
    const fields: Record<string, string[]> = {};
    if (!untilDate || Number.isNaN(untilDate.getTime()) || untilDate <= new Date()) fields.until = ['must be a future date-time'];
    if (!reason?.trim()) fields.reason = ['required'];
    if (Object.keys(fields).length) return invalid(fields);
    u.status = 'suspended';
    u.suspended_until = iso(untilDate as Date);
    addAudit('user.suspend', 'user', u.id, { status: 'suspended', suspended_until: u.suspended_until, reason }, { status: 'active' });
    return HttpResponse.json(u);
  }),
  http.post(url('/admin/users/:id/reactivate'), async ({ params }) => {
    await lag();
    const denied = guard();
    if (denied) return denied;
    const u = db.users.find((x) => x.id === params.id);
    if (!u) return notFound();
    u.status = 'active';
    u.suspended_until = null;
    addAudit('user.reactivate', 'user', u.id, { status: 'active' }, { status: 'suspended' });
    return HttpResponse.json(u);
  }),
];
