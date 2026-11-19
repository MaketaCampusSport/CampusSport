import { addDays, addHours, startOfDay, subDays, subHours } from 'date-fns';
import { delay, http, HttpResponse } from 'msw';
import { API_BASE, MOCK_LATENCY } from '@/api/config';
import type {
  AnnouncementInput,
  AuditAction,
  AuditPeriod,
  BlockInput,
  DashboardData,
  DeliveryReport,
  EventInput,
  ManualClassInput,
  ReportData,
  Resource,
  ResourceInput,
  RuleSettings,
  SchedulePreview,
  ScheduleConflict,
  Sport,
  SportInput,
  SuspendInput,
  UserKind,
} from '@/api/types';
import { toCsv } from '@/lib/csv';
import { ADMIN, addAudit, db, HOURS, nextId, SPORTS, type EfClass } from './db';
import {
  blockStatus,
  cancelBookings,
  cellKey,
  cellsForDay,
  countAffected,
  currentBlock,
  dateKey,
  hash,
  isoWeekday,
  rng,
  toBlockDto,
} from './occupancy';

const url = (p: string) => `${API_BASE}${p}`;

/* Stochează în memorie sloturile rezervate de student în sesiunea demo curentă */
const userBookedCells = new Set<string>();

async function lag(): Promise<void> {
  if (MOCK_LATENCY > 0) await delay(MOCK_LATENCY * (0.6 + Math.random() * 0.8));
}

function err(status: number, code: string, ro: string, en: string) {
  return HttpResponse.json({ code, message: { ro, en } }, { status });
}

const unauthorized = () =>
  err(
    401,
    'UNAUTHENTICATED',
    'Sesiunea a expirat. Autentifică-te din nou.',
    'Your session has expired. Please sign in again.',
  );

function authed(): boolean {
  return db.session === 'ok';
}

function parseDay(key: string | null): Date {
  if (!key) return startOfDay(new Date());
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function resourceDto(r: Resource): Resource {
  const b = currentBlock(r.id);
  return { ...r, blocked: !!b, blockedLabel: b ? b.kind : null };
}

/* ───────────── PDF minimal (demo) ───────────── */
function simplePdf(lines: string[]): Uint8Array {
  const esc = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()\\]/g, '\\$&')
      .replace(/[^\x20-\x7e]/g, '?');
  const content = [
    'BT',
    '/F1 12 Tf',
    '50 780 Td',
    '16 TL',
    ...lines.map((l) => `(${esc(l)}) Tj T*`),
    'ET',
  ].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets
    .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

/* ───────────── Rapoarte ───────────── */
function buildReport(month: string): ReportData {
  const [y = 2026, m = 10] = month.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  const r = rng(hash(month));
  const hourlyBase = [22, 38, 33, 47, 57, 42, 52, 72, 88, 95, 92, 78, 52, 33];
  const factor = 0.85 + r() * 0.3;
  const hourly = HOURS.map((hour, i) => ({
    hour,
    pct: Math.min(99, Math.round((hourlyBase[i] ?? 40) * factor)),
  }));
  const perBase: Record<string, number> = {
    'r-football-1': 92,
    'r-fitness': 81,
    'r-court-2': 74,
    'r-football-2': 66,
    'r-multi': 55,
    'r-tennis': 48,
    'r-pool': 37,
  };
  const perResource = db.resources
    .filter((x) => x.active && perBase[x.id] !== undefined)
    .map((x) => ({
      resourceId: x.id,
      name: x.name,
      photoUrl: x.photoUrl,
      pct: Math.min(99, Math.round((perBase[x.id] ?? 40) * (0.9 + r() * 0.2))),
    }))
    .sort((a, b) => b.pct - a.pct);
  const avg = Math.round(hourly.reduce((s, h) => s + h.pct, 0) / hourly.length + 18);
  return {
    month,
    previousMonth: prev,
    kpis: {
      occupancy: { value: Math.min(95, avg), deltaPct: Math.round(r() * 12 - 3) },
      bookings: { value: Math.round(1100 + r() * 400), deltaPct: Math.round(r() * 14 - 2) },
      noShowRate: {
        value: Math.round((3 + r() * 3) * 10) / 10,
        deltaPct: -Math.round((0.4 + r() * 1.6) * 10) / 10,
      },
      members: 82,
      external: 18,
      studentsAtLimit: { value: Math.round(100 + r() * 70), deltaPct: Math.round(r() * 30) },
    },
    hourly,
    perResource,
  };
}

/* ───────────── Import orar EF ───────────── */
const COURSES = [
  'FEAA anul I · gr. 2',
  'FEAA anul I · gr. 3',
  'FIESC anul II',
  'FEFS anul I',
  'FEFS anul II',
  'FIESC anul I',
];

function previewFromClasses(
  source: SchedulePreview['source'],
  classes: EfClass[],
  validFrom: Date,
  validTo: Date,
  stats?: { recurringClasses: number; weeks: number; blocksGenerated: number },
): { preview: SchedulePreview; cancelKeys: string[] } {
  const conflicts: ScheduleConflict[] = [];
  const cancelKeys: string[] = [];
  const kinds: UserKind[] = ['student', 'student', 'student', 'teacher', 'external'];
  const until = validTo < addDays(validFrom, 60) ? validTo : addDays(validFrom, 60);
  for (let d = startOfDay(validFrom); d <= until; d = addDays(d, 1)) {
    for (const c of classes) {
      if (isoWeekday(d) !== c.weekday) continue;
      const resource = db.resources.find((r) => r.id === c.resourceId);
      if (!resource) continue;
      const cells = cellsForDay(resource, d);
      for (let h = c.from; h < c.to; h++) {
        const cell = cells.find((x) => x.hour === h);
        if (cell?.state !== 'booked') continue;
        const start = new Date(d);
        start.setHours(h, 0, 0, 0);
        const id = `bk-${cellKey(resource.id, d, h)}`;
        cancelKeys.push(cellKey(resource.id, d, h));
        conflicts.push({
          bookingId: id,
          userName: cell.label ?? '—',
          userKind: kinds[hash(id) % kinds.length] ?? 'student',
          resourceName: resource.name,
          startsAt: start.toISOString(),
          courseName: c.course,
        });
      }
    }
  }
  conflicts.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const weeks = Math.max(1, Math.round((validTo.getTime() - validFrom.getTime()) / (7 * 86400000)));
  const recurringClasses = stats?.recurringClasses ?? classes.length;
  const preview: SchedulePreview = {
    importId: nextId('imp'),
    source,
    recurringClasses,
    weeks: stats?.weeks ?? weeks,
    blocksGenerated: stats?.blocksGenerated ?? recurringClasses * weeks,
    conflictCount: conflicts.length,
    conflicts: conflicts.slice(0, 80),
  };
  return { preview, cancelKeys };
}

/* ───────────── Audit ───────────── */
const PERIOD_HOURS: Record<AuditPeriod, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '12m': 24 * 365,
};
const BR_LABELS: Record<keyof RuleSettings, [string, string]> = {
  quotaMonthly: ['BR-01: rezervări gratuite / lună', ''],
  maxActiveFuture: ['BR-02: rezervări viitoare active', ''],
  quotaPerSport: ['Cotă separată pe sport', ''],
  windowTeacherDays: ['BR-03: fereastră profesori', ' zile'],
  windowStudentDays: ['BR-03: fereastră studenți', ' zile'],
  windowExternalHours: ['BR-03: fereastră externi', ' h'],
  cancelBeforeHours: ['BR-04: anulare', ' h'],
  checkinBeforeMin: ['BR-05: check-in înainte', ' min'],
  checkinAfterMin: ['BR-05: check-in după', ' min'],
  noShowLimit: ['BR-06: no-show-uri / lună', ''],
  suspensionDays: ['BR-06: durata suspendării', ' zile'],
  waitlistOfferMinutes: ['BR-07: timp confirmare ofertă', ' min'],
};

function filteredAudit(params: URLSearchParams) {
  const period = (params.get('period') as AuditPeriod | null) ?? '7d';
  const since = subHours(new Date(), PERIOD_HOURS[period] ?? 168).getTime();
  const q = (params.get('q') ?? '').toLowerCase();
  const actorId = params.get('actorId');
  return db.audit.filter(
    (e) =>
      new Date(e.at).getTime() >= since &&
      (!actorId || e.actor.id === actorId) &&
      (!q || `${e.actor.name} ${e.object} ${e.action}`.toLowerCase().includes(q)),
  );
}

/* ───────────── Handlers ───────────── */
export const handlers = [
  /* Autentificare */
  http.get(url('/me'), async () => {
    await lag();
    if (db.session === 'none') return unauthorized();
    return HttpResponse.json({
      user: ADMIN,
      twoFactorVerified: db.session === 'ok',
      expiresAt: db.sessionExpiresAt,
    });
  }),
  http.post(url('/auth/sso/login'), async () => {
    await lag();
    db.session = 'pending';
    return HttpResponse.json({ ok: true });
  }),
  http.post(url('/auth/admin/totp'), async ({ request }) => {
    await lag();
    if (db.session === 'none') return unauthorized();
    const { code } = (await request.json()) as { code: string };
    if (code !== '123456') {
      return err(401, 'TOTP_INVALID', 'Cod invalid sau expirat.', 'Invalid or expired code.');
    }
    db.session = 'ok';
    db.sessionExpiresAt = addHours(new Date(), 8).toISOString();
    return HttpResponse.json({
      user: ADMIN,
      twoFactorVerified: true,
      expiresAt: db.sessionExpiresAt,
    });
  }),
  http.post(url('/auth/logout'), async () => {
    db.session = 'none';
    return new HttpResponse(null, { status: 204 });
  }),

  /* Catalog & Disponibilitate publică (5.2) */
  http.get(url('/sports'), async () => {
    await lag();
    return HttpResponse.json(SPORTS);
  }),

  http.get(url('/availability'), async ({ request }) => {
    await lag();
    const p = new URL(request.url).searchParams;
    const sportParam = (p.get('sport') ?? '').toLowerCase();
    const dateParam = p.get('date') ?? dateKey(new Date());
    const day = parseDay(dateParam);

    const sportAliases: Record<string, string[]> = {
      fotbal: ['fotbal', 'football'],
      football: ['fotbal', 'football'],
      baschet: ['baschet', 'basketball'],
      basketball: ['baschet', 'basketball'],
      tenis: ['tenis', 'tennis'],
      tennis: ['tenis', 'tennis'],
      volei: ['volei', 'volleyball'],
      volleyball: ['volei', 'volleyball'],
      fitness: ['fitness'],
      inot: ['inot', 'pool', 'swimming'],
      pool: ['inot', 'pool', 'swimming'],
    };
    const accepted = sportAliases[sportParam] ?? [sportParam];

    const matching = db.resources.filter(
      (r) =>
        r.active &&
        (!sportParam || r.sportIds.some((s) => accepted.includes(s.toLowerCase()))),
    );

    const pad = (n: number) => String(n).padStart(2, '0');
    const resources = matching.map((r) => {
      const cells = cellsForDay(r, day).filter((c) => c.state !== 'closed');
      const slots = cells.map((c, idx) => {
        const start = `${dateParam}T${pad(c.hour)}:00:00+02:00`;
        const end = `${dateParam}T${pad(c.hour + 1)}:00:00+02:00`;
        const key = cellKey(r.id, day, c.hour);

        if (userBookedCells.has(key)) {
          return {
            start,
            end,
            status: 'mine' as const,
            bookable: false,
          };
        }

        if (c.state === 'pe_class' || c.state === 'event' || c.state === 'blocked') {
          return {
            start,
            end,
            status: 'blocked' as const,
            bookable: false,
            block_kind:
              c.state === 'pe_class'
                ? ('pe_class' as const)
                : c.state === 'event'
                  ? ('event' as const)
                  : ('emergency' as const),
          };
        }

        if (c.state === 'booked') {
          const isDemoMine = idx === 4 && r.id === matching[0]?.id;
          return {
            start,
            end,
            status: isDemoMine ? ('mine' as const) : ('occupied' as const),
            bookable: false,
          };
        }

        return {
          start,
          end,
          status: 'free' as const,
          bookable: true,
        };
      });

      return {
        resource_id: r.id,
        resource_name: r.name,
        type: r.sportIds[0] ?? sportParam,
        slots,
      };
    });

    return HttpResponse.json({
      date: dateParam,
      resources,
    });
  }),

  /* Rezervări utilizator & Listă de așteptare (5.3) */
  http.post(url('/bookings'), async ({ request }) => {
    await lag();
    const body = (await request.json()) as {
      resource_id: string;
      start: string;
      participants_count: number;
    };

    const resource = db.resources.find((r) => r.id === body.resource_id);
    if (!resource) {
      return err(404, 'NOT_FOUND', 'Resursa nu există.', 'Resource not found.');
    }

    const day = parseDay(body.start.slice(0, 10));
    const hour = Number(body.start.slice(11, 13));
    const key = cellKey(resource.id, day, hour);

    if (userBookedCells.has(key)) {
      return err(
        409,
        'SLOT_TAKEN',
        'Acest interval a fost deja rezervat.',
        'This time slot has already been booked.',
      );
    }

    userBookedCells.add(key);

    const id = nextId('res');
    const numeric = String(Math.floor(1000 + Math.random() * 9000));
    const qrToken = `CS-${numeric}-${id.toUpperCase()}`;

    return HttpResponse.json(
      {
        id,
        qr_token: qrToken,
        message_ro: `Rezervare confirmată pe ${resource.name}.`,
        message_en: `Booking confirmed on ${resource.name}.`,
      },
      { status: 201 },
    );
  }),

  http.post(url('/waitlist'), async () => {
    await lag();
    return HttpResponse.json({ ok: true }, { status: 201 });
  }),

  /* Resurse (Admin) */
  http.get(url('/admin/resources'), async () => {
    await lag();
    if (!authed()) return unauthorized();
    return HttpResponse.json(db.resources.map(resourceDto));
  }),
  http.post(url('/admin/resources'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const input = (await request.json()) as ResourceInput;
    const created: Resource = {
      ...input,
      id: nextId('r'),
      location: 'Complexul sportiv',
      photoUrl: '/images/resources/multipurpose.jpg',
      blocked: false,
      blockedLabel: null,
    };
    db.resources.push(created);
    addAudit('resource_created', created.name);
    return HttpResponse.json(resourceDto(created), { status: 201 });
  }),
  http.patch(url('/admin/resources/:id'), async ({ request, params }) => {
    await lag();
    if (!authed()) return unauthorized();
    const r = db.resources.find((x) => x.id === params.id);
    if (!r) return err(404, 'NOT_FOUND', 'Resursa nu există.', 'Resource not found.');
    const patch = (await request.json()) as Partial<ResourceInput>;
    const toggled = patch.active !== undefined && patch.active !== r.active;
    Object.assign(r, patch);
    if (toggled) addAudit(r.active ? 'resource_activated' : 'resource_deactivated', r.name);
    else addAudit('resource_updated', r.name);
    return HttpResponse.json(resourceDto(r));
  }),

  /* Panoul zilei */
  http.get(url('/admin/dashboard'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const day = parseDay(new URL(request.url).searchParams.get('date'));
    const now = new Date();
    const active = db.resources.filter((r) => r.active);
    const rows = active.map((r) => {
      const b = currentBlock(r.id);
      return {
        resourceId: r.id,
        name: r.name,
        photoUrl: r.photoUrl,
        blocked: !!b,
        blockedLabel: b ? b.kind : null,
        cells: cellsForDay(r, day),
      };
    });
    const count = (d: Date, pred: (hour: number) => boolean) =>
      active.reduce(
        (s, r) => s + cellsForDay(r, d).filter((c) => c.state === 'booked' && pred(c.hour)).length,
        0,
      );
    const booked = count(day, () => true);
    const isPast = (hour: number) => {
      const end = new Date(day);
      end.setHours(hour + 1, 0, 0, 0);
      return end <= now;
    };
    const past = count(day, isPast);
    const checkIns = Math.round(past * 0.9);
    const yesterday = count(subDays(day, 1), () => true);
    const usable = rows
      .flatMap((r) => r.cells)
      .filter((c) => c.state !== 'closed' && c.state !== 'blocked');
    const used = usable.filter((c) => c.state !== 'free').length;
    const data: DashboardData = {
      date: dateKey(day),
      hours: HOURS,
      kpis: {
        bookings: {
          value: booked,
          deltaPct: yesterday ? Math.round(((booked - yesterday) / yesterday) * 100) : 0,
        },
        checkIns: { value: checkIns },
        noShows: { value: past - checkIns },
        occupancyPct: { value: usable.length ? Math.round((used / usable.length) * 100) : 0 },
      },
      rows,
      activeEmergencies: db.blocks
        .filter((b) => b.kind === 'emergency' && blockStatus(b) === 'active')
        .map((b) => ({
          blockId: b.id,
          resourceId: b.resourceId,
          resourceName: db.resources.find((r) => r.id === b.resourceId)?.name ?? '',
          reason: b.reason,
          startedAt: b.startsAt,
          affectedCount: b.affectedCount,
        })),
    };
    return HttpResponse.json(data);
  }),

  /* Blocări */
  http.get(url('/admin/blocks/preview'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const p = new URL(request.url).searchParams;
    const resource = db.resources.find((r) => r.id === p.get('resourceId'));
    if (!resource) return err(404, 'NOT_FOUND', 'Resursa nu există.', 'Resource not found.');
    const from = new Date(p.get('from') ?? Date.now());
    const to = p.get('to') ? new Date(p.get('to') as string) : null;
    return HttpResponse.json({
      affectedCount: countAffected(resource, from, to, p.get('excludeBlockId') ?? undefined),
    });
  }),
  http.get(url('/admin/blocks'), async () => {
    await lag();
    if (!authed()) return unauthorized();
    const items = db.blocks.map(toBlockDto).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const counts = { active: 0, planned: 0, history: 0 };
    items.forEach((b) => counts[b.status]++);
    return HttpResponse.json({ items, counts });
  }),
  http.post(url('/admin/blocks'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const input = (await request.json()) as BlockInput;
    const resource = db.resources.find((r) => r.id === input.resourceId);
    if (!resource) return err(404, 'NOT_FOUND', 'Resursa nu există.', 'Resource not found.');
    const start = new Date(input.startsAt);
    const end = input.endsAt ? new Date(input.endsAt) : null;
    if (end && end <= start) {
      return err(
        422,
        'INVALID_INTERVAL',
        'Sfârșitul trebuie să fie după început.',
        'End must be after start.',
      );
    }
    const affected = cancelBookings(resource, start, end);
    const id = nextId('b');
    db.blocks.push({
      id,
      resourceId: resource.id,
      kind: input.kind,
      reason: input.reason,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      recurrence: input.recurrence,
      affectedCount: affected,
      createdBy: ADMIN.fullName,
      releasedAt: null,
      hasDelivery: affected > 0,
    });
    if (affected > 0) db.deliveries.set(id, { blockId: id, startedAtMs: Date.now(), total: affected });
    if (input.kind === 'emergency') {
      addAudit('emergency_block', `${resource.name} · ${input.reason} · ${affected} rezervări anulate`);
    } else {
      addAudit('planned_block', `${resource.name} · ${input.reason}`);
    }
    const created = db.blocks.find((b) => b.id === id);
    return HttpResponse.json(created ? toBlockDto(created) : null, { status: 201 });
  }),
  http.patch(url('/admin/blocks/:id'), async ({ request, params }) => {
    await lag();
    if (!authed()) return unauthorized();
    const b = db.blocks.find((x) => x.id === params.id);
    if (!b) return err(404, 'NOT_FOUND', 'Blocarea nu există.', 'Block not found.');
    const input = (await request.json()) as BlockInput;
    const resource = db.resources.find((r) => r.id === input.resourceId);
    if (!resource) return err(404, 'NOT_FOUND', 'Resursa nu există.', 'Resource not found.');
    const start = new Date(input.startsAt);
    const end = input.endsAt ? new Date(input.endsAt) : null;
    if (end && end <= start) {
      return err(
        422,
        'INVALID_INTERVAL',
        'Sfârșitul trebuie să fie după început.',
        'End must be after start.',
      );
    }
    Object.assign(b, {
      resourceId: input.resourceId,
      kind: input.kind,
      reason: input.reason,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      recurrence: input.recurrence,
    });
    b.affectedCount += cancelBookings(resource, start, end, b.id);
    addAudit('block_updated', `${resource.name} · ${input.reason}`);
    return HttpResponse.json(toBlockDto(b));
  }),
  http.delete(url('/admin/blocks/:id'), async ({ params }) => {
    await lag();
    if (!authed()) return unauthorized();
    const b = db.blocks.find((x) => x.id === params.id);
    if (!b) return err(404, 'NOT_FOUND', 'Blocarea nu există.', 'Block not found.');
    b.releasedAt = new Date().toISOString();
    addAudit('unblock', `${db.resources.find((r) => r.id === b.resourceId)?.name ?? ''} · deblocat`);
    return HttpResponse.json(toBlockDto(b));
  }),
  http.get(url('/admin/blocks/:id/delivery'), async ({ params }) => {
    if (!authed()) return unauthorized();
    const b = db.blocks.find((x) => x.id === params.id);
    const d = db.deliveries.get(String(params.id));
    if (!b || !d) return err(404, 'NOT_FOUND', 'Nu există raport de livrare.', 'No delivery report.');
    const rate = 8; // mesaje / secundă (simulat)
    const elapsed = (Date.now() - d.startedAtMs) / 1000;
    const delivered = Math.min(d.total, Math.floor(elapsed * rate));
    const push = Math.round(d.total * 0.9);
    const report: DeliveryReport = {
      blockId: b.id,
      resourceName: db.resources.find((r) => r.id === b.resourceId)?.name ?? '',
      startedAt: new Date(d.startedAtMs).toISOString(),
      total: d.total,
      cancelled: b.affectedCount,
      quotasRefunded: b.affectedCount,
      delivered,
      push,
      email: d.total,
      sms: d.total - push,
      complete: delivered >= d.total,
      durationSeconds: Math.max(1, Math.ceil(d.total / rate)),
    };
    return HttpResponse.json(report);
  }),

  /* Orar EF */
  http.post(url('/admin/schedule/import/preview'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const form = await request.formData();
    const file = form.get('file');
    const name = file instanceof File ? file.name : 'orar.csv';
    if (!/\.(csv|ics)$/i.test(name)) {
      return err(
        422,
        'BAD_FORMAT',
        'Fișierul trebuie să fie CSV sau iCal (.ics).',
        'File must be CSV or iCal (.ics).',
      );
    }
    const r = rng(hash(name));
    const picks = ['r-football-1', 'r-fitness', 'r-court-2', 'r-tennis'];
    const classes: EfClass[] = Array.from({ length: 6 }, (_, i) => ({
      resourceId: picks[Math.floor(r() * picks.length)] ?? 'r-fitness',
      weekday: 1 + Math.floor(r() * 5),
      from: 15 + Math.floor(r() * 3),
      to: 17 + Math.floor(r() * 3),
      course: COURSES[i % COURSES.length] ?? 'EF',
    })).map((c) => ({ ...c, to: Math.max(c.to, c.from + 1) }));
    const from = startOfDay(new Date());
    const { preview, cancelKeys } = previewFromClasses(
      { kind: 'file', name },
      classes,
      from,
      addDays(from, 98),
      {
        recurringClasses: 38,
        weeks: 14,
        blocksGenerated: 532,
      },
    );
    db.imports.set(preview.importId, { preview, classes, cancelKeys });
    return HttpResponse.json(preview);
  }),
  http.post(url('/admin/schedule/classes/preview'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const input = (await request.json()) as ManualClassInput;
    const classes: EfClass[] = input.weekdays.map((w) => ({
      resourceId: input.resourceId,
      weekday: w,
      from: Number(input.from.split(':')[0]),
      to: Math.max(Number(input.to.split(':')[0]), Number(input.from.split(':')[0]) + 1),
      course: input.courseName,
    }));
    const { preview, cancelKeys } = previewFromClasses(
      { kind: 'manual', name: input.courseName },
      classes,
      parseDay(input.validFrom),
      parseDay(input.validTo),
    );
    db.imports.set(preview.importId, { preview, classes, cancelKeys });
    return HttpResponse.json(preview);
  }),
  http.post(url('/admin/schedule/import'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const { importId } = (await request.json()) as { importId: string };
    const entry = db.imports.get(importId);
    if (!entry) {
      return err(
        404,
        'NOT_FOUND',
        'Importul nu mai există. Reîncarcă fișierul.',
        'Import not found. Upload the file again.',
      );
    }
    db.efClasses.push(...entry.classes);
    entry.cancelKeys.forEach((k) => db.cancelled.add(k));
    db.imports.delete(importId);
    addAudit(
      'schedule_import',
      `${entry.preview.source.name} · ${entry.preview.blocksGenerated} blocări create`,
    );
    return HttpResponse.json({
      importId,
      blocksCreated: entry.preview.blocksGenerated,
      cancelledBookings: entry.preview.conflictCount,
      notifiedUsers: entry.preview.conflictCount,
    });
  }),

  /* Evenimente */
  http.get(url('/admin/events'), async () => {
    await lag();
    if (!authed()) return unauthorized();
    const now = Date.now();
    const items = db.events
      .filter((e) => new Date(e.endsAt).getTime() >= now)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map((e) => ({
        ...e,
        resourceNames: e.resourceIds.map(
          (id) => db.resources.find((r) => r.id === id)?.name ?? id,
        ),
        photoUrl: db.resources.find((r) => r.id === e.resourceIds[0])?.photoUrl ?? '',
      }));
    return HttpResponse.json(items);
  }),
  http.post(url('/admin/events/preview'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const input = (await request.json()) as EventInput;
    const { start, end } = eventWindow(input);
    const conflictCount = input.resourceIds.reduce((s, id) => {
      const r = db.resources.find((x) => x.id === id);
      return s + (r ? countAffected(r, start, end) : 0);
    }, 0);
    return HttpResponse.json({ conflictCount });
  }),
  http.post(url('/admin/events'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const input = (await request.json()) as EventInput;
    const { start, end } = eventWindow(input);
    if (end <= start) {
      return err(
        422,
        'INVALID_INTERVAL',
        'Sfârșitul trebuie să fie după început.',
        'End must be after start.',
      );
    }
    let cancelled = 0;
    for (const id of input.resourceIds) {
      const r = db.resources.find((x) => x.id === id);
      if (r) cancelled += cancelBookings(r, start, end);
    }
    const ev = {
      id: nextId('e'),
      name: input.name,
      resourceIds: input.resourceIds,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      recurrence: input.recurrence,
      cancelledCount: cancelled,
    };
    db.events.push(ev);
    addAudit('event_created', `${input.name} · ${cancelled} rezervări anulate`);
    return HttpResponse.json(ev, { status: 201 });
  }),

  /* Anunțuri */
  http.get(url('/admin/announcements'), async () => {
    await lag();
    if (!authed()) return unauthorized();
    return HttpResponse.json([...db.announcements].sort((a, b) => b.sentAt.localeCompare(a.sentAt)));
  }),
  http.get(url('/admin/announcements/audience'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    return HttpResponse.json({ count: audienceCount(new URL(request.url).searchParams) });
  }),
  http.post(url('/admin/announcements'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const input = (await request.json()) as AnnouncementInput;
    const params = new URLSearchParams({
      audience: input.audience,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.date ? { date: input.date } : {}),
    });
    const recipients = audienceCount(params);
    const a = {
      id: nextId('a'),
      category: input.category,
      title: input.title,
      message: input.message,
      recipients,
      deliveredPct: 100,
      sentAt: new Date().toISOString(),
    };
    db.announcements.push(a);
    addAudit('announcement_sent', `„${input.title}” · ${recipients} destinatari`);
    return HttpResponse.json(a, { status: 201 });
  }),

  /* Rapoarte */
  http.get(url('/admin/reports'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const p = new URL(request.url).searchParams;
    const month = p.get('month') ?? '2026-10';
    const report = buildReport(month);
    const format = p.get('format');
    if (format === 'csv') {
      const rows: (string | number)[][] = [
        ['Luna', month],
        ['Grad de ocupare (%)', report.kpis.occupancy.value],
        ['Rezervări', report.kpis.bookings.value],
        ['No-show (%)', report.kpis.noShowRate.value],
        ['Membri', report.kpis.members],
        ['Externi', report.kpis.external],
        [],
        ['Ora', 'Ocupare (%)'],
        ...report.hourly.map((h) => [h.hour, h.pct]),
        [],
        ['Resursă', 'Ocupare (%)'],
        ...report.perResource.map((x) => [x.name, x.pct]),
      ];
      return new HttpResponse(toCsv(rows), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }
    if (format === 'pdf') {
      const lines = [
        `CampusSport - Raport ${month}`,
        '',
        `Grad de ocupare: ${report.kpis.occupancy.value}%`,
        `Rezervari: ${report.kpis.bookings.value}`,
        `No-show: ${report.kpis.noShowRate.value}%`,
        `Membri / externi: ${report.kpis.members} / ${report.kpis.external}`,
        '',
        'Ocupare per resursa:',
        ...report.perResource.map((x) => `  ${x.name}: ${x.pct}%`),
      ];
      return new HttpResponse(simplePdf(lines), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    }
    return HttpResponse.json(report);
  }),

  /* Reguli */
  http.get(url('/admin/settings'), async () => {
    await lag();
    if (!authed()) return unauthorized();
    return HttpResponse.json(db.settings);
  }),
  http.put(url('/admin/settings'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const next = (await request.json()) as RuleSettings;
    for (const key of Object.keys(next) as (keyof RuleSettings)[]) {
      if (next[key] !== db.settings[key]) {
        const [label, unit] = BR_LABELS[key];
        const fmtVal = (v: number | boolean) =>
          typeof v === 'boolean' ? (v ? 'Da' : 'Nu') : `${v}${unit}`;
        addAudit('rule_changed', `${label}: ${fmtVal(db.settings[key])} → ${fmtVal(next[key])}`);
      }
    }
    db.settings = { ...next };
    return HttpResponse.json(db.settings);
  }),

  /* Jurnal audit */
  http.get(url('/admin/audit'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const p = new URL(request.url).searchParams;
    const all = filteredAudit(p);
    if (p.get('format') === 'csv') {
      const rows = [
        ['Data', 'Actor', 'Acțiune', 'Obiect'],
        ...all.map((e) => [e.at, e.actor.name, e.action as AuditAction, e.object]),
      ];
      return new HttpResponse(toCsv(rows), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      });
    }
    const page = Math.max(1, Number(p.get('page') ?? 1));
    const pageSize = Math.max(1, Number(p.get('pageSize') ?? 20));
    const actors = [...new Map(db.audit.map((e) => [e.actor.id, e.actor])).values()];
    return HttpResponse.json({
      items: all.slice((page - 1) * pageSize, page * pageSize),
      total: all.length,
      page,
      pageSize,
      actors,
    });
  }),
  /* Sporturi (Admin, NFR-14) */
  http.post(url('/admin/sports'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const input = (await request.json()) as SportInput;
    const created: Sport = { ...input, id: nextId('s') };
    SPORTS.push(created);
    addAudit('sport_created', created.nameRo);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.patch(url('/admin/sports/:id'), async ({ request, params }) => {
    await lag();
    if (!authed()) return unauthorized();
    const s = SPORTS.find((x) => x.id === params.id);
    if (!s) return err(404, 'NOT_FOUND', 'Sportul nu există.', 'Sport not found.');
    Object.assign(s, (await request.json()) as SportInput);
    addAudit('sport_updated', s.nameRo);
    return HttpResponse.json(s);
  }),
  http.delete(url('/admin/sports/:id'), async ({ params }) => {
    await lag();
    if (!authed()) return unauthorized();
    const i = SPORTS.findIndex((x) => x.id === params.id);
    if (i < 0) return err(404, 'NOT_FOUND', 'Sportul nu există.', 'Sport not found.');
    if (db.resources.some((r) => r.sportIds.includes(String(params.id)))) {
      return err(409, 'SPORT_IN_USE', 'Sportul este folosit de cel puțin o resursă.', 'The sport is used by at least one resource.');
    }
    const [removed] = SPORTS.splice(i, 1);
    addAudit('sport_deleted', removed ? removed.nameRo : String(params.id));
    return new HttpResponse(null, { status: 204 });
  }),

  /* Utilizatori (Admin, FR-05) */
  http.get(url('/admin/users'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const p = new URL(request.url).searchParams;
    const q = (p.get('q') ?? '').trim().toLowerCase();
    const role = p.get('role');
    const status = p.get('status');
    const list = db.users.filter(
      (u) =>
        (!q || u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!role || u.role === role) &&
        (!status || u.status === status),
    );
    return HttpResponse.json(list);
  }),
  http.post(url('/admin/users/:id/suspend'), async ({ request, params }) => {
    await lag();
    if (!authed()) return unauthorized();
    const u = db.users.find((x) => x.id === params.id);
    if (!u) return err(404, 'NOT_FOUND', 'Utilizatorul nu există.', 'User not found.');
    const { days, reason } = (await request.json()) as SuspendInput;
    if (!reason?.trim() || !(days >= 1 && days <= 365)) {
      return err(422, 'VALIDATION', 'Motivul și durata (1–365 zile) sunt obligatorii.', 'Reason and duration (1–365 days) are required.');
    }
    u.status = 'suspended';
    u.suspendedUntil = addDays(new Date(), days).toISOString();
    addAudit('account_suspended', `${u.fullName} – ${days} zile`);
    return HttpResponse.json(u);
  }),
  http.post(url('/admin/users/:id/reactivate'), async ({ params }) => {
    await lag();
    if (!authed()) return unauthorized();
    const u = db.users.find((x) => x.id === params.id);
    if (!u) return err(404, 'NOT_FOUND', 'Utilizatorul nu există.', 'User not found.');
    u.status = 'active';
    u.suspendedUntil = null;
    addAudit('account_reactivated', u.fullName);
    return HttpResponse.json(u);
  }),

  /* Check-in personal (FR-03 / FR-15). Coduri demo: DEMO-OK, DEMO-DUPLICAT, DEMO-EXPIRAT */
  http.post(url('/admin/check-in'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const { code } = (await request.json()) as { code: string };
    const c = (code ?? '').trim().toUpperCase();
    const now = new Date();
    const base = {
      bookingId: 'b-demo',
      userName: 'Andrei Popescu',
      userKind: 'student' as const,
      resourceName: 'Terenul 2',
      startsAt: now.toISOString(),
      endsAt: addHours(now, 1).toISOString(),
    };
    if (c === 'DEMO-OK') return HttpResponse.json({ ...base, outcome: 'ok' });
    if (c === 'DEMO-DUPLICAT') return HttpResponse.json({ ...base, outcome: 'already_checked_in' });
    if (c === 'DEMO-EXPIRAT') {
      return err(422, 'CHECKIN_WINDOW', 'Check-in-ul este permis între −10 și +15 minute față de început.', 'Check-in is allowed from −10 to +15 minutes around the start time.');
    }
    return err(422, 'QR_INVALID', 'Cod invalid sau expirat.', 'Invalid or expired code.');
  }),

  /* Cont administrator: configurare TOTP (NFR-08) */
  http.post(url('/admin/2fa/setup'), async () => {
    await lag();
    if (!authed()) return unauthorized();
    const secret = 'JBSWY3DPEHPK3PXP';
    return HttpResponse.json({
      secret,
      otpauthUrl: `otpauth://totp/CampusSport:${ADMIN.email}?secret=${secret}&issuer=CampusSport`,
    });
  }),
  http.post(url('/admin/2fa/confirm'), async ({ request }) => {
    await lag();
    if (!authed()) return unauthorized();
    const { code } = (await request.json()) as { code: string };
    if (code !== '123456') {
      return err(422, 'TOTP_INVALID', 'Cod invalid sau expirat.', 'Invalid or expired code.');
    }
    addAudit('twofa_enabled', ADMIN.fullName);
    return new HttpResponse(null, { status: 204 });
  }),
];

function eventWindow(input: EventInput): { start: Date; end: Date } {
  const day = parseDay(input.date);
  const start = new Date(day);
  const [fh = 0, fm = 0] = input.from.split(':').map(Number);
  start.setHours(fh, fm, 0, 0);
  const end = new Date(day);
  const [th = 0, tm = 0] = input.to.split(':').map(Number);
  end.setHours(th, tm, 0, 0);
  return { start, end };
}

function audienceCount(p: URLSearchParams): number {
  const audience = p.get('audience');
  if (audience === 'waitlist') return 17;
  const resources = db.resources.filter(
    (r) => r.active && (audience === 'all_with_bookings' || r.id === p.get('resourceId')),
  );
  const from = p.get('date') ? parseDay(p.get('date')) : startOfDay(new Date());
  const days = audience === 'all_with_bookings' || !p.get('date') ? 7 : 1;
  let n = 0;
  for (const r of resources) {
    for (let i = 0; i < days; i++) {
      n += cellsForDay(r, addDays(from, i)).filter((c) => c.state === 'booked').length;
    }
  }
  return n;
}