import { addDays, addHours, addWeeks, startOfDay, subDays, subHours, subMinutes } from 'date-fns';
import type {
  Announcement,
  AuditAction,
  AuditEntry,
  BlockKind,
  BlockRecurrence,
  EventRecurrence,
  ManagedUser,
  Resource,
  RuleSettings,
  SchedulePreview,
  Sport,
  UserKind,
} from '@/api/types';

export const ADMIN = { id: 'u-admin-1', fullName: 'Maria Ionescu', email: 'maria.ionescu@univ.example', role: 'admin' as const };
export const OTHER_ADMIN = { id: 'u-admin-2', fullName: 'Dan Rusu', email: 'dan.rusu@univ.example' };

export const HOURS = Array.from({ length: 14 }, (_, i) => 8 + i);

export interface DbBlock {
  id: string;
  resourceId: string;
  kind: BlockKind;
  reason: string;
  startsAt: string;
  endsAt: string | null;
  recurrence: BlockRecurrence;
  affectedCount: number;
  createdBy: string;
  releasedAt: string | null;
  hasDelivery: boolean;
}

export interface DbEvent {
  id: string;
  name: string;
  resourceIds: string[];
  startsAt: string;
  endsAt: string;
  recurrence: EventRecurrence;
  cancelledCount: number;
}

export interface EfClass {
  resourceId: string;
  weekday: number; // 1..7
  from: number; // ora de început
  to: number;
  course: string;
}

export interface Delivery {
  blockId: string;
  startedAtMs: number;
  total: number;
}

export const SPORTS: Sport[] = [
  { id: 's-fotbal', nameRo: 'Fotbal', nameEn: 'Football', requiredEquipment: ['porti'] },
  { id: 's-baschet', nameRo: 'Baschet', nameEn: 'Basketball', requiredEquipment: ['panouri'] },
  { id: 's-tenis', nameRo: 'Tenis', nameEn: 'Tennis', requiredEquipment: ['fileu'] },
  { id: 's-volei', nameRo: 'Volei', nameEn: 'Volleyball', requiredEquipment: ['fileu'] },
  { id: 's-fitness', nameRo: 'Fitness', nameEn: 'Fitness', requiredEquipment: [] },
  { id: 's-inot', nameRo: 'Înot', nameEn: 'Swimming', requiredEquipment: [] },
];

const img = (n: string) => `/images/resources/${n}.jpg`;

function res(p: Partial<Resource> & Pick<Resource, 'id' | 'name' | 'photoUrl' | 'capacity' | 'sportIds'>): Resource {
  return {
    location: 'Complexul sportiv',
    equipment: [],
    opensAt: '08:00',
    closesAt: '22:00',
    slotMinutes: 60,
    externalAccess: 'leftover',
    externalWindow: null,
    active: true,
    blocked: false,
    blockedLabel: null,
    ...p,
  };
}

export const POPULARITY: Record<string, number> = {
  'r-football-1': 0.8,
  'r-football-2': 0.6,
  'r-court-2': 0.55,
  'r-tennis': 0.42,
  'r-fitness': 0.7,
  'r-pool': 0.35,
  'r-multi': 0.4,
  'r-court-4': 0.3,
};

export interface Db {
  session: 'none' | 'pending' | 'ok';
  sessionExpiresAt: string;
  resources: Resource[];
  blocks: DbBlock[];
  events: DbEvent[];
  efClasses: EfClass[];
  cancelled: Set<string>;
  deliveries: Map<string, Delivery>;
  imports: Map<string, { preview: SchedulePreview; classes: EfClass[]; cancelKeys: string[] }>;
  announcements: Announcement[];
  audit: AuditEntry[];
  users: ManagedUser[];
  settings: RuleSettings;
  seq: number;
}

function seedResources(): Resource[] {
  return [
    res({ id: 'r-football-1', name: 'Teren fotbal 1', photoUrl: img('football'), capacity: 22, sportIds: ['s-fotbal'], equipment: ['porti', 'vestiar'], externalAccess: 'leftover' }),
    res({ id: 'r-football-2', name: 'Teren fotbal 2', photoUrl: img('football'), capacity: 22, sportIds: ['s-fotbal'], equipment: ['porti', 'vestiar'], externalAccess: 'never' }),
    res({ id: 'r-court-2', name: 'Terenul 2', photoUrl: img('basketball'), capacity: 10, sportIds: ['s-baschet', 's-volei'], equipment: ['panouri', 'fileu', 'mingi', 'vestiar'], externalAccess: 'leftover' }),
    res({ id: 'r-tennis', name: 'Teren tenis', photoUrl: img('tennis'), capacity: 4, sportIds: ['s-tenis'], equipment: ['fileu', 'rachete'], externalAccess: 'window', externalWindow: { days: [1, 2, 3, 4, 5], from: '16:00', to: '20:00' } }),
    res({ id: 'r-fitness', name: 'Sala fitness', photoUrl: img('fitness'), capacity: 30, sportIds: ['s-fitness'], equipment: ['vestiar'], externalAccess: 'leftover' }),
    res({ id: 'r-pool', name: 'Bazin', photoUrl: img('pool'), capacity: 24, sportIds: ['s-inot'], equipment: ['vestiar'], externalAccess: 'never' }),
    res({ id: 'r-multi', name: 'Sala polivalentă', photoUrl: img('multipurpose'), capacity: 120, sportIds: ['s-baschet', 's-volei'], equipment: ['panouri', 'fileu', 'tribuna', 'vestiar'], externalAccess: 'never' }),
    res({ id: 'r-court-4', name: 'Teren 4 (exterior)', photoUrl: img('outdoor'), capacity: 10, sportIds: ['s-baschet'], equipment: ['panouri', 'mingi'], opensAt: '08:00', closesAt: '20:00', active: false }),
  ];
}

function nextWeekday(from: Date, isoDay: number): Date {
  const d = startOfDay(from);
  const diff = (isoDay - (d.getDay() === 0 ? 7 : d.getDay()) + 7) % 7 || 7;
  return addDays(d, diff);
}

function seedUsers(): ManagedUser[] {
  const rows: [string, string, string, UserKind, number, string | null][] = [
    ['u-1', 'Andrei Popescu', 'andrei.popescu@univ.example', 'student', 0, null],
    ['u-2', 'Ioana Marin', 'ioana.marin@univ.example', 'student', 2, null],
    ['u-3', 'Vlad Dumitru', 'vlad.dumitru@univ.example', 'student', 3, addDays(new Date(), 9).toISOString()],
    ['u-4', 'Elena Stan', 'elena.stan@univ.example', 'teacher', 0, null],
    ['u-5', 'Radu Georgescu', 'radu.georgescu@mail.example', 'external', 1, null],
    ['u-6', 'Cristina Neagu', 'cristina.neagu@mail.example', 'external', 0, null],
  ];
  return rows.map(
    ([id, fullName, email, role, noShowsThisMonth, suspendedUntil]): ManagedUser => ({
      id,
      fullName,
      email,
      phone: '+40 700 000 000',
      role,
      status: suspendedUntil ? 'suspended' : 'active',
      suspendedUntil,
      noShowsThisMonth,
    }),
  );
}


export function createDb(now = new Date()): Db {
  const today = startOfDay(now);
  const at = (d: Date, h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x;
  };
  const iso = (d: Date) => d.toISOString();

  const monday = nextWeekday(now, 1);
  const wednesday = nextWeekday(now, 3);
  const saturday = nextWeekday(now, 6);

  const blocks: DbBlock[] = [
    // Activă acum: curățenie în sala de fitness.
    { id: 'b-1', resourceId: 'r-fitness', kind: 'cleaning', reason: 'Curățenie generală', startsAt: iso(subMinutes(now, 30)), endsAt: iso(addHours(now, 1)), recurrence: 'none', affectedCount: 0, createdBy: ADMIN.fullName, releasedAt: null, hasDelivery: false },
    // Planificate
    { id: 'b-2', resourceId: 'r-fitness', kind: 'cleaning', reason: 'Curățenie generală', startsAt: iso(at(today, 22)), endsAt: iso(at(today, 23)), recurrence: 'none', affectedCount: 0, createdBy: ADMIN.fullName, releasedAt: null, hasDelivery: false },
    { id: 'b-3', resourceId: 'r-tennis', kind: 'maintenance', reason: 'Înlocuire fileu', startsAt: iso(at(monday, 8)), endsAt: iso(at(monday, 12)), recurrence: 'none', affectedCount: 4, createdBy: OTHER_ADMIN.fullName, releasedAt: null, hasDelivery: true },
    { id: 'b-4', resourceId: 'r-football-2', kind: 'maintenance', reason: 'Marcaj teren', startsAt: iso(at(wednesday, 7)), endsAt: iso(at(wednesday, 10)), recurrence: 'none', affectedCount: 0, createdBy: OTHER_ADMIN.fullName, releasedAt: null, hasDelivery: false },
    { id: 'b-5', resourceId: 'r-fitness', kind: 'cleaning', reason: 'Recurent săptămânal', startsAt: iso(at(nextWeekday(now, 7), 7)), endsAt: iso(at(nextWeekday(now, 7), 8)), recurrence: 'weekly', affectedCount: 0, createdBy: ADMIN.fullName, releasedAt: null, hasDelivery: false },
    // Istoric: o urgență încheiată
    { id: 'b-6', resourceId: 'r-football-2', kind: 'emergency', reason: 'Avarie – iluminat nocturn', startsAt: iso(at(subDays(today, 9), 17)), endsAt: iso(at(subDays(today, 9), 21)), recurrence: 'none', affectedCount: 12, createdBy: ADMIN.fullName, releasedAt: iso(at(subDays(today, 9), 20)), hasDelivery: true },
  ];

  const resourcesSeed = seedResources();
  const eventsSeed: DbEvent[] = [
    { id: 'e-1', name: 'Cupa Rectorului – fotbal', resourceIds: ['r-football-1', 'r-football-2'], startsAt: iso(at(saturday, 9)), endsAt: iso(at(saturday, 18)), recurrence: 'none', cancelledCount: 14 },
    { id: 'e-2', name: 'Ziua porților deschise', resourceIds: ['r-multi'], startsAt: iso(at(addDays(today, 9), 10)), endsAt: iso(at(addDays(today, 9), 14)), recurrence: 'none', cancelledCount: 0 },
    { id: 'e-3', name: 'Gala sportului', resourceIds: ['r-multi'], startsAt: iso(at(addWeeks(today, 6), 17)), endsAt: iso(at(addWeeks(today, 6), 22)), recurrence: 'none', cancelledCount: 0 },
  ];

  const efClasses: EfClass[] = [
    { resourceId: 'r-football-1', weekday: 1, from: 10, to: 12, course: 'FEAA anul I · gr. 2' },
    { resourceId: 'r-football-1', weekday: 3, from: 9, to: 11, course: 'FEAA anul II · gr. 1' },
    { resourceId: 'r-fitness', weekday: 2, from: 8, to: 10, course: 'FIESC anul II' },
    { resourceId: 'r-court-2', weekday: 3, from: 12, to: 14, course: 'FEFS anul I' },
    { resourceId: 'r-court-2', weekday: 4, from: 10, to: 12, course: 'FEFS anul II' },
    { resourceId: 'r-tennis', weekday: 5, from: 12, to: 14, course: 'FIESC anul I' },
    { resourceId: 'r-pool', weekday: 1, from: 9, to: 11, course: 'FEFS anul III' },
  ];

  const announcements: Announcement[] = [
    { id: 'a-1', category: 'urgent', title: 'Bazin închis – avarie', message: 'Bazinul este închis temporar. Rezervările au fost anulate.', recipients: 23, deliveredPct: 100, sentAt: iso(subHours(now, 3)) },
    { id: 'a-2', category: 'general', title: 'Program redus de 1 Decembrie', message: 'Pe 1 Decembrie baza sportivă funcționează între 10:00 și 16:00.', recipients: 412, deliveredPct: 100, sentAt: iso(subDays(now, 4)) },
    { id: 'a-3', category: 'maintenance', title: 'Teren tenis – fileu nou', message: 'Se înlocuiește fileul; terenul e indisponibil luni dimineața.', recipients: 4, deliveredPct: 100, sentAt: iso(subDays(now, 6)) },
  ];

  const db: Db = {
    session: 'none',
    sessionExpiresAt: iso(addHours(now, 8)),
    resources: resourcesSeed,
    blocks,
    events: eventsSeed,
    efClasses,
    cancelled: new Set(),
    deliveries: new Map([['b-6', { blockId: 'b-6', startedAtMs: subDays(now, 9).getTime(), total: 12 }], ['b-3', { blockId: 'b-3', startedAtMs: subDays(now, 2).getTime(), total: 4 }]]),
    imports: new Map(),
    announcements,
    audit: [],
    users: seedUsers(),
    settings: {
      quotaMonthly: 4,
      maxActiveFuture: 2,
      quotaPerSport: false,
      windowTeacherDays: 14,
      windowStudentDays: 7,
      windowExternalHours: 24,
      cancelBeforeHours: 2,
      checkinBeforeMin: 10,
      checkinAfterMin: 15,
      noShowLimit: 3,
      suspensionDays: 14,
      waitlistOfferMinutes: 10,
    },
    seq: 100,
  };

  // Jurnal audit inițial (ultimele ~3 săptămâni).
  const seedAudit: [number, typeof ADMIN | typeof OTHER_ADMIN, AuditAction, string][] = [
    [0.1, ADMIN, 'announcement_sent', '„Bazin închis – avarie” · 23 destinatari'],
    [1, OTHER_ADMIN, 'schedule_import', 'orar_EF_sem1_2026.csv · 532 blocări create'],
    [1.2, OTHER_ADMIN, 'rule_changed', 'BR-04: anulare 3 h → 2 h'],
    [2, ADMIN, 'account_suspended', 'Student #20481 · 3 no-show-uri în octombrie'],
    [2.5, OTHER_ADMIN, 'resource_updated', 'Terenul 2 · sporturi permise: + Volei'],
    [3, ADMIN, 'event_created', 'Cupa Rectorului · 14 rezervări anulate'],
    [4, ADMIN, 'planned_block', 'Teren tenis · Înlocuire fileu'],
    [6, OTHER_ADMIN, 'announcement_sent', '„Teren tenis – fileu nou” · 4 destinatari'],
    [9, ADMIN, 'emergency_block', 'Teren fotbal 2 · avarie iluminat · 12 rezervări anulate'],
    [9, ADMIN, 'unblock', 'Teren fotbal 2 · deblocat'],
    [12, OTHER_ADMIN, 'resource_created', 'Sala polivalentă'],
    [15, OTHER_ADMIN, 'rule_changed', 'BR-03: fereastră studenți 5 → 7 zile'],
    [18, ADMIN, 'resource_deactivated', 'Teren 4 (exterior)'],
  ];
  db.audit = seedAudit.map(([daysAgo, actor, action, object], i) => ({
    id: `au-${i + 1}`,
    at: iso(subHours(now, daysAgo * 24)),
    actor: { id: actor.id, name: actor.fullName },
    action,
    object,
  }));

  return db;
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

export function addAudit(action: AuditAction, object: string): void {
  db.audit.unshift({
    id: nextId('au'),
    at: new Date().toISOString(),
    actor: { id: ADMIN.id, name: ADMIN.fullName },
    action,
    object,
  });
}
