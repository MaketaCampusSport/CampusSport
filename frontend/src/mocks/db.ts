import { addDays, addMinutes, formatISO, startOfDay, subDays, subHours, subMinutes } from 'date-fns';
import type { AuditEntry, Block, Booking, ResourceInput, Settings, Sport, User, WeeklyHours } from '@/api/client';

/**
 * Datele serverului simulat (MSW), în forma contractului (assets/livrabil05/openapi.yaml): snake_case.
 * `db.bookings` este partajat cu handler-ele pentru membri (mocks/memberHandlers.ts).
 */

export const ADMIN = { id: 'u-admin-1', fullName: 'Maria Ionescu', email: 'maria.ionescu@univ.example', role: 'admin' as const };
export const OTHER_ADMIN = { id: 'u-admin-2', fullName: 'Dan Rusu', email: 'dan.rusu@univ.example' };

/** Data-oră ISO 8601 cu decalajul local (ex. `2026-11-19T18:00:00+02:00`), ca serverul. */
export const iso = (d: Date): string => formatISO(d);

/** Resursă completă (în contract toate câmpurile `ResourceInput` sunt opționale). */
export type MockResource = Required<Omit<ResourceInput, 'photo_url' | 'external_access_windows'>> & {
  id: string;
  photo_url: string | null;
  external_access_windows?: WeeklyHours;
};

/** Rezervare cu datele pe care serverul le are în plus (titular, categorie, token QR). */
export interface MockBooking extends Booking {
  user_id: string;
  holder_name: string;
  category: 'member' | 'external';
  qr_token: string;
}

export interface MockDelivery {
  startedAtMs: number;
  notified: number;
}

export interface Db {
  session: 'none' | 'pending' | 'ok';
  sports: Sport[];
  resources: MockResource[];
  /** Rândurile din `occupancy` care nu sunt rezervări (blocări, ore EF, evenimente). */
  blocks: Block[];
  bookings: MockBooking[];
  deliveries: Map<string, MockDelivery>;
  audit: AuditEntry[];
  users: User[];
  settings: Settings;
  seq: number;
}

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function weekly(open: string, close: string, days: readonly (keyof WeeklyHours)[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']): WeeklyHours {
  return Object.fromEntries(days.map((d) => [d, [{ open, close }]])) as WeeklyHours;
}

const img = (n: string) => `/images/resources/${n}.jpg`;

function seedSports(): Sport[] {
  return [
    { id: 's-fotbal', name_ro: 'Fotbal', name_en: 'Football', icon: 'football', required_equipment: ['porti'] },
    { id: 's-baschet', name_ro: 'Baschet', name_en: 'Basketball', icon: 'basketball', required_equipment: ['panouri'] },
    { id: 's-tenis', name_ro: 'Tenis', name_en: 'Tennis', icon: 'tennis', required_equipment: ['fileu'] },
    { id: 's-volei', name_ro: 'Volei', name_en: 'Volleyball', icon: 'volleyball', required_equipment: ['fileu'] },
    { id: 's-fitness', name_ro: 'Fitness', name_en: 'Fitness', icon: 'fitness', required_equipment: [] },
    { id: 's-inot', name_ro: 'Înot', name_en: 'Swimming', icon: 'pool', required_equipment: [] },
  ];
}

function res(p: Partial<MockResource> & Pick<MockResource, 'id' | 'name' | 'capacity' | 'sport_ids'>): MockResource {
  return {
    type: 'teren',
    location: 'Complexul sportiv, str. Universității 1',
    photo_url: null,
    equipment: [],
    opening_hours: weekly('08:00', '22:00'),
    slot_minutes: 60,
    external_access: 'leftover',
    active: true,
    ...p,
  };
}

function seedResources(): MockResource[] {
  return [
    res({ id: 'r-football-1', name: 'Teren fotbal 1', photo_url: img('football'), capacity: 22, sport_ids: ['s-fotbal'], equipment: ['porti', 'vestiar'] }),
    res({ id: 'r-football-2', name: 'Teren fotbal 2', photo_url: img('football'), capacity: 22, sport_ids: ['s-fotbal'], equipment: ['porti', 'vestiar'], external_access: 'never' }),
    res({ id: 'r-court-2', name: 'Terenul 2', photo_url: img('basketball'), capacity: 10, sport_ids: ['s-baschet', 's-volei'], equipment: ['panouri', 'fileu', 'mingi', 'vestiar'] }),
    res({
      id: 'r-tennis', name: 'Teren tenis', photo_url: img('tennis'), capacity: 4, sport_ids: ['s-tenis'], equipment: ['fileu', 'rachete'],
      external_access: 'window', external_access_windows: weekly('16:00', '20:00', ['mon', 'tue', 'wed', 'thu', 'fri']),
    }),
    res({ id: 'r-fitness', name: 'Sala fitness', type: 'sală', photo_url: img('fitness'), capacity: 30, sport_ids: ['s-fitness'], equipment: ['vestiar'] }),
    res({ id: 'r-pool', name: 'Bazin', type: 'bazin', photo_url: img('pool'), capacity: 24, sport_ids: ['s-inot'], equipment: ['vestiar'], external_access: 'never' }),
    res({ id: 'r-multi', name: 'Sala polivalentă', type: 'sală', photo_url: img('multipurpose'), capacity: 120, sport_ids: ['s-baschet', 's-volei'], equipment: ['panouri', 'fileu', 'tribuna', 'vestiar'], external_access: 'never' }),
    res({ id: 'r-court-4', name: 'Teren 4 (exterior)', photo_url: img('outdoor'), capacity: 10, sport_ids: ['s-baschet'], equipment: ['panouri', 'mingi'], opening_hours: weekly('08:00', '20:00'), active: false }),
  ];
}

function seedUsers(now: Date): User[] {
  const u = (id: string, full_name: string, email: string, role: User['role'], extra: Partial<User> = {}): User => ({
    id, full_name, email, role, status: 'active', phone: role === 'external' ? '+37360000000' : null, suspended_until: null,
    created_at: iso(subDays(now, 120)), ...extra,
  });
  return [
    u(ADMIN.id, ADMIN.fullName, ADMIN.email, 'admin'),
    u(OTHER_ADMIN.id, OTHER_ADMIN.fullName, OTHER_ADMIN.email, 'admin'),
    u('u-student-1', 'Andrei Popescu', 'andrei.popescu@student.univ.example', 'student'),
    u('u-teacher-1', 'Elena Munteanu', 'elena.munteanu@univ.example', 'teacher'),
    u('u-external-1', 'Ana Rusu', 'ana.rusu@example.com', 'external', { phone: '+37360000001' }),
    u('u-2', 'Ioana Marin', 'ioana.marin@student.univ.example', 'student'),
    u('u-3', 'Vlad Dumitru', 'vlad.dumitru@student.univ.example', 'student', { status: 'suspended', suspended_until: iso(addDays(now, 9)) }),
    u('u-4', 'Mihai Ionescu', 'mihai.ionescu@student.univ.example', 'student'),
    u('u-5', 'Radu Georgescu', 'radu.georgescu@mail.example', 'external', { phone: '+37360000005' }),
    u('u-6', 'Cristina Neagu', 'cristina.neagu@mail.example', 'external', { phone: '+37360000006' }),
    u('u-7', 'Diana Rusu', 'diana.rusu@student.univ.example', 'student'),
    u('u-8', 'Bogdan Lazăr', 'bogdan.lazar@univ.example', 'teacher'),
  ];
}

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `2026-11-19` în ora locală. */
export function dateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDay(key: string | null | undefined): Date {
  if (!key) return startOfDay(new Date());
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function at(day: Date, h: number, m = 0): Date {
  const x = new Date(day);
  x.setHours(h, m, 0, 0);
  return x;
}

function nextWeekday(from: Date, isoDay: number): Date {
  const d = startOfDay(from);
  const diff = (isoDay - (d.getDay() === 0 ? 7 : d.getDay()) + 7) % 7 || 7;
  return addDays(d, diff);
}

/** Intervalele unei resurse într-o zi, după program și durata slotului. */
export function slotsForDay(r: MockResource, day: Date): { start: Date; end: Date }[] {
  const ranges = r.opening_hours[DAY_KEYS[day.getDay()] as keyof WeeklyHours] ?? [];
  const out: { start: Date; end: Date }[] = [];
  for (const range of ranges) {
    const [oh = 0, om = 0] = range.open.split(':').map(Number);
    const [ch = 0, cm = 0] = range.close.split(':').map(Number);
    const close = at(day, ch, cm);
    for (let s = at(day, oh, om); addMinutes(s, r.slot_minutes) <= close; s = addMinutes(s, r.slot_minutes)) {
      out.push({ start: s, end: addMinutes(s, r.slot_minutes) });
    }
  }
  return out;
}

export function overlaps(aStart: Date, aEnd: Date | null, bStart: Date, bEnd: Date | null): boolean {
  return (bEnd === null || aStart < bEnd) && (aEnd === null || bStart < aEnd);
}

export function blockOverlaps(b: Block, start: Date, end: Date | null): boolean {
  return overlaps(new Date(b.start), b.end ? new Date(b.end) : null, start, end);
}

const POPULARITY: Record<string, number> = {
  'r-football-1': 0.8, 'r-football-2': 0.6, 'r-court-2': 0.55, 'r-tennis': 0.42,
  'r-fitness': 0.7, 'r-pool': 0.35, 'r-multi': 0.4, 'r-court-4': 0.3,
};
const CURVE = [0.25, 0.4, 0.35, 0.5, 0.6, 0.45, 0.55, 0.75, 0.9, 1, 0.95, 0.8, 0.55, 0.35];

export function createDb(now = new Date()): Db {
  const today = startOfDay(now);
  const monday = nextWeekday(now, 1);
  const wednesday = nextWeekday(now, 3);
  const saturday = nextWeekday(now, 6);
  const users = seedUsers(now);
  const resources = seedResources();

  const block = (id: string, resource_id: string, kind: Block['kind'], start: Date, end: Date | null, reason: string, created_by = ADMIN.id, recurrence_id: string | null = null): Block => ({
    id, resource_id, kind, start: iso(start), end: end ? iso(end) : null, reason, recurrence_id, created_by,
  });

  const blocks: Block[] = [
    // Activă acum: mentenanță în sala de fitness.
    block('b-1', 'r-fitness', 'maintenance', subMinutes(now, 30), addMinutes(now, 60), 'Curățenie generală'),
    block('b-2', 'r-tennis', 'maintenance', at(monday, 8), at(monday, 12), 'Înlocuire fileu', OTHER_ADMIN.id),
    block('b-3', 'r-football-2', 'maintenance', at(wednesday, 7), at(wednesday, 10), 'Marcaj teren', OTHER_ADMIN.id),
    // O urgență încheiată.
    block('b-4', 'r-football-2', 'emergency', at(subDays(today, 9), 17), at(subDays(today, 9), 20), 'Avarie – iluminat nocturn'),
    // Evenimente.
    block('b-5', 'r-football-1', 'event', at(saturday, 9), at(saturday, 18), 'Cupa Rectorului – fotbal'),
    block('b-6', 'r-football-2', 'event', at(saturday, 9), at(saturday, 18), 'Cupa Rectorului – fotbal'),
    block('b-7', 'r-multi', 'event', at(addDays(today, 9), 10), at(addDays(today, 9), 14), 'Ziua porților deschise'),
  ];

  // Ore EF recurente, ca apariții concrete (cum le ține serverul în `occupancy`).
  const efClasses: [string, number, number, number, string][] = [
    ['r-football-1', 1, 10, 12, 'FEAA anul I · gr. 2'],
    ['r-football-1', 3, 9, 11, 'FEAA anul II · gr. 1'],
    ['r-fitness', 2, 8, 10, 'FIESC anul II'],
    ['r-court-2', 3, 12, 14, 'FEFS anul I'],
    ['r-court-2', 4, 10, 12, 'FEFS anul II'],
    ['r-tennis', 5, 12, 14, 'FIESC anul I'],
    ['r-pool', 1, 9, 11, 'FEFS anul III'],
  ];
  let seq = 100;
  efClasses.forEach(([rid, weekday, from, to, course], i) => {
    for (let w = -2; w <= 6; w++) {
      const day = addDays(nextWeekday(subDays(today, 1), weekday), w * 7);
      seq++;
      blocks.push(block(`b-${seq}`, rid, 'pe_class', at(day, from), at(day, to), course, OTHER_ADMIN.id, `rec-${i + 1}`));
    }
  });

  // Rezervări pe [-7, +10] zile, deterministe, fără suprapuneri peste blocări.
  // Conturile cu care te poți autentifica în demo (mocks/session.ts) nu primesc rezervări aleatorii,
  // altfel studentul demo ar începe cu cota epuizată; primesc mai jos câte o rezervare viitoare și una trecută.
  const demoIds = new Set(['u-student-1', 'u-teacher-1', 'u-external-1']);
  const holders = users.filter((u) => u.role !== 'admin' && !demoIds.has(u.id));
  const bookings: MockBooking[] = [];
  for (let offset = -7; offset <= 10; offset++) {
    const day = addDays(today, offset);
    for (const r of resources) {
      if (!r.active && offset >= 0) continue;
      for (const slot of slotsForDay(r, day)) {
        if (blocks.some((b) => b.resource_id === r.id && blockOverlaps(b, slot.start, slot.end))) continue;
        const rand = rng(hash(`${r.id}|${dateKey(day)}|${slot.start.getHours()}`));
        const weekendBoost = day.getDay() === 0 || day.getDay() === 6 ? 1.1 : 1;
        const p = (POPULARITY[r.id] ?? 0.4) * (CURVE[slot.start.getHours() - 8] ?? 0.4) * weekendBoost;
        if (rand() >= p) continue;
        const holder = holders[Math.floor(rand() * holders.length)] ?? holders[0]!;
        seq++;
        const id = `bk-${seq}`;
        const past = slot.end <= now;
        const started = slot.start <= now;
        const noShow = past && rand() < 0.08;
        bookings.push({
          id,
          resource_id: r.id,
          resource_name: r.name,
          user_id: holder.id,
          holder_name: holder.full_name,
          category: holder.role === 'external' ? 'external' : 'member',
          start: iso(slot.start),
          end: iso(slot.end),
          status: past ? (noShow ? 'no_show' : 'completed') : 'active',
          checked_in_at: started && !noShow && rand() < 0.9 ? iso(addMinutes(slot.start, -3)) : null,
          participants_count: Math.max(1, Math.round(rand() * Math.min(r.capacity, 10))),
          qr_token: `${id}.${hash(id).toString(16)}.demo`,
        });
      }
    }
  }
  const soon = now.getTime() + 20 * 3600_000;
  for (const demo of users.filter((u) => demoIds.has(u.id))) {
    const upcoming = bookings.find((b) => b.status === 'active' && Date.parse(b.start) > soon && !demoIds.has(b.user_id));
    const past = bookings.find((b) => b.status === 'completed' && !demoIds.has(b.user_id));
    for (const b of [upcoming, past]) {
      if (b) Object.assign(b, { user_id: demo.id, holder_name: demo.full_name, category: demo.role === 'external' ? 'external' : 'member' });
    }
  }

  const settings: Settings = {
    monthly_quota: 4,
    monthly_quota_per_sport: {},
    max_active_bookings: 2,
    booking_window_days_student: 7,
    booking_window_days_teacher: 14,
    booking_window_hours_external: 24,
    cancel_free_hours: 2,
    checkin_minutes_before: 10,
    checkin_minutes_after: 15,
    no_show_threshold: 3,
    no_show_suspension_days: 14,
    waitlist_offer_minutes: 10,
    waitlist_simultaneous_under_hours: 2,
    default_slot_minutes: 60,
    member_replaces_external: false,
    updated_by: OTHER_ADMIN.id,
    updated_at: iso(subDays(now, 15)),
  };

  // Jurnal audit inițial (ultimele ~3 săptămâni).
  const seedAudit: [number, string, string, string, string | null, AuditEntry['after']][] = [
    [0.1, ADMIN.id, 'announcement.create', 'announcement', null, { message_ro: 'Bazinul este închis temporar.', recipients_count: 23 }],
    [1.2, OTHER_ADMIN.id, 'settings.update', 'settings', null, { cancel_free_hours: 2 }],
    [2, ADMIN.id, 'user.suspend', 'user', 'u-3', { status: 'suspended', reason: '3 no-show-uri în octombrie' }],
    [2.5, OTHER_ADMIN.id, 'resource.update', 'resource', 'r-court-2', { name: 'Terenul 2', sport_ids: ['s-baschet', 's-volei'] }],
    [4, ADMIN.id, 'block.create', 'occupancy', 'b-2', { kind: 'maintenance', reason: 'Înlocuire fileu' }],
    [9, ADMIN.id, 'block.create', 'occupancy', 'b-4', { kind: 'emergency', reason: 'Avarie – iluminat nocturn' }],
    [12, OTHER_ADMIN.id, 'resource.create', 'resource', 'r-multi', { name: 'Sala polivalentă' }],
    [15, OTHER_ADMIN.id, 'settings.update', 'settings', null, { booking_window_days_student: 7 }],
    [18, ADMIN.id, 'resource.update', 'resource', 'r-court-4', { name: 'Teren 4 (exterior)', active: false }],
  ];
  const audit: AuditEntry[] = seedAudit.map(([daysAgo, actor_id, action, entity, entity_id, after], i) => ({
    id: `au-${i + 1}`, actor_id, action, entity, entity_id, before: null, after, at: iso(subHours(now, daysAgo * 24)),
  }));

  return {
    session: 'none',
    sports: seedSports(),
    resources,
    blocks,
    bookings,
    deliveries: new Map([
      ['b-4', { startedAtMs: subDays(now, 9).getTime(), notified: 12 }],
      ['b-2', { startedAtMs: subDays(now, 2).getTime(), notified: 4 }],
    ]),
    audit,
    users,
    settings,
    seq,
  };
}

export let db: Db = createDb();

/** Readuce datele demo la starea inițială (folosit în teste). */
export function resetDb(now = new Date()): void {
  db = createDb(now);
}

export function nextId(prefix: string): string {
  db.seq += 1;
  return `${prefix}-${db.seq}`;
}

/** Ca `AuditService.record`: o intrare per mutație de administrator (FR-45). */
export function addAudit(
  action: string,
  entity: string,
  entityId: string | null,
  after: AuditEntry['after'] = null,
  before: AuditEntry['before'] = null,
): void {
  db.audit.unshift({
    id: nextId('au'),
    actor_id: ADMIN.id,
    action,
    entity,
    entity_id: entityId,
    before,
    after,
    at: iso(new Date()),
  });
}
