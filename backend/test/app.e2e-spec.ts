import { DateTime } from 'luxon';
import {
  EXAMPLE_PASSWORD,
  EXAMPLE_RESOURCES,
  EXAMPLE_SPORTS,
  EXAMPLE_USERS,
} from '../src/database/seeds/example-data';
import { DEFAULT_RULES } from '../src/modules/settings/settings.service';
import { WaitlistService } from '../src/modules/waitlist/waitlist.service';
import { createE2eApp, E2eContext } from './e2e-setup';

const TZ = 'Europe/Chisinau';
const COURT = EXAMPLE_RESOURCES.basketballCourt.id;
const HALL = EXAMPLE_RESOURCES.sportsHall.id;
const U = EXAMPLE_USERS;

/** A Monday–Friday day `offset` days or more ahead (all example resources are open 07–22). */
function weekday(offset: number): DateTime {
  let d = DateTime.now().setZone(TZ).plus({ days: offset }).startOf('day');
  while (d.weekday > 5) d = d.plus({ days: 1 });
  return d;
}
const at = (day: DateTime, hour: number) => day.set({ hour }).toISO({ suppressMilliseconds: true })!;

describe('CampusSport API (e2e, real PostgreSQL)', () => {
  let t: E2eContext;
  let student: string;
  let teacher: string;
  let admin: string;
  let external: string;

  beforeAll(async () => {
    t = await createE2eApp();
    student = t.bearer(U.student.id, 'student');
    teacher = t.bearer(U.teacher.id, 'teacher');
    admin = t.bearer(U.admin.id, 'admin');
    external = t.bearer(U.external.id, 'external');
  });
  afterAll(() => t?.close());

  async function teachers(n: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const { rows } = await t.db.query(
        `INSERT INTO users (full_name, email, role, sso_subject) VALUES ($1, $2, 'teacher', $3) RETURNING id`,
        [`Profesor ${i}`, `prof${i}.${Date.now()}@example.edu`, `e2e:${i}:${Date.now()}`],
      );
      ids.push(rows[0].id);
    }
    return ids;
  }

  it('applies the livrabil05 schema (no_overlap, audit trigger, default settings)', async () => {
    const { rows } = await t.db.query(`SELECT conname FROM pg_constraint WHERE conname = 'no_overlap'`);
    expect(rows).toHaveLength(1);
    await expect(t.db.query(`UPDATE audit_log SET action = 'x'`)).resolves.toBeDefined(); // empty table: no row fires the trigger
    await t.db.query(`INSERT INTO audit_log (action, entity) VALUES ('e2e', 'test')`);
    await expect(t.db.query(`DELETE FROM audit_log`)).rejects.toThrow(/doar inserari/);
    const settings = await t.http().get('/api/v1/admin/settings').set('Authorization', admin).expect(200);
    expect(settings.body).toMatchObject({ monthly_quota: 4, max_active_bookings: 2, cancel_free_hours: 2 });
  });

  it('catalog: sports and the equipment filter', async () => {
    const sports = await t.http().get('/api/v1/sports').expect(200);
    expect(sports.body).toHaveLength(4);
    const tennis = await t.http().get(`/api/v1/resources?sport=${EXAMPLE_SPORTS.tennis.id}`).expect(200);
    expect(tennis.body.map((r: { name: string }) => r.name)).toEqual(['Teren tenis 1']);
  });

  it('email + password: register, duplicate email, login, wrong password, seeded admin', async () => {
    const email = `e2e.register.${Date.now()}@example.edu`;
    const registered = await t
      .http()
      .post('/api/v1/auth/register')
      .send({
        full_name: 'Elena Test',
        email: email.toUpperCase(),
        password: 'parola-e2e-1',
        role: 'teacher',
      })
      .expect(201);
    expect(registered.body.user).toMatchObject({ email, role: 'teacher', status: 'active' });
    const stored = await t.db.query(`SELECT password_hash, sso_subject FROM users WHERE email = $1`, [email]);
    expect(stored.rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(stored.rows[0].sso_subject).toBeNull();

    const again = await t
      .http()
      .post('/api/v1/auth/register')
      .send({ full_name: 'Elena Test', email, password: 'parola-e2e-1', role: 'student' })
      .expect(409);
    expect(again.body.code).toBe('EMAIL_ALREADY_USED');

    const login = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: 'parola-e2e-1' })
      .expect(200);
    const me = await t
      .http()
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${login.body.access_token}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, role: 'teacher' });

    const wrong = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email, password: 'nope-nope' })
      .expect(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');

    const seeded = await t
      .http()
      .post('/api/v1/auth/login')
      .send({ email: U.admin.email, password: EXAMPLE_PASSWORD })
      .expect(200);
    expect(seeded.body.user.role).toBe('admin');
  });

  it('booking lifecycle: create, conflict, grid, quota, cancel with refund', async () => {
    const day = weekday(2);
    const created = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', student)
      .send({ resource_id: COURT, start: at(day, 18), participants_count: 8 })
      .expect(201);
    expect(created.body).toMatchObject({
      status: 'active',
      start: at(day, 18),
      end: at(day, 19),
      participants_count: 8,
    });
    expect(created.body.qr_token.startsWith(created.body.id)).toBe(true);
    expect(t.jobs.map((j) => j.name)).toEqual(expect.arrayContaining(['booking-confirmed', 'no-show-check']));

    const conflict = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', teacher)
      .send({ resource_id: COURT, start: at(day, 18) })
      .expect(409);
    expect(conflict.body).toMatchObject({
      code: 'SLOT_TAKEN',
      waitlist_offer: { resource_id: COURT, start: at(day, 18), end: at(day, 19) },
    });

    const grid = await t
      .http()
      .get(`/api/v1/availability?resource=${COURT}&date=${day.toISODate()}`)
      .set('Authorization', teacher)
      .expect(200);
    expect(
      grid.body.resources[0].slots.find((s: { start: string }) => s.start === at(day, 18)),
    ).toMatchObject({ status: 'occupied', waitlist_available: true });

    const quota = await t.http().get('/api/v1/me/quota').set('Authorization', student).expect(200);
    expect(quota.body.used).toBeGreaterThanOrEqual(1);

    const cancelled = await t
      .http()
      .delete(`/api/v1/bookings/${created.body.id}`)
      .set('Authorization', student)
      .expect(200);
    expect(cancelled.body).toMatchObject({
      quota_refunded: true,
      booking: { status: 'cancelled', cancel_source: 'user' },
    });
    expect(t.jobs.some((j) => j.name === 'slot-freed')).toBe(true);
    await t.http().delete(`/api/v1/bookings/${created.body.id}`).set('Authorization', student).expect(409);
  });

  it('NFR-04: 50 concurrent requests for one slot -> exactly one booking', async () => {
    const ids = await teachers(50);
    const day = weekday(3);
    const results = await Promise.all(
      ids.map((id) =>
        t
          .http()
          .post('/api/v1/bookings')
          .set('Authorization', t.bearer(id, 'teacher'))
          .send({ resource_id: COURT, start: at(day, 10) }),
      ),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(49);
    const { rows } = await t.db.query(
      `SELECT count(*)::int AS n FROM occupancy WHERE resource_id = $1 AND status = 'active' AND lower(period) = $2`,
      [COURT, at(day, 10)],
    );
    expect(rows[0].n).toBe(1);
  });

  it('rules: active limit and monthly quota (changed live through settings)', async () => {
    const [prof] = await teachers(1);
    const auth = t.bearer(prof, 'teacher');
    const day = weekday(4);
    await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', auth)
      .send({ resource_id: HALL, start: day.set({ hour: 7 }).toISO() })
      .expect(201);
    await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', auth)
      .send({ resource_id: HALL, start: day.set({ hour: 8, minute: 30 }).toISO() })
      .expect(201);
    const third = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', auth)
      .send({ resource_id: HALL, start: day.set({ hour: 10 }).toISO() })
      .expect(422);
    expect(third.body.code).toBe('ACTIVE_LIMIT_REACHED');

    await t
      .http()
      .put('/api/v1/admin/settings')
      .set('Authorization', admin)
      .send({ ...DEFAULT_RULES, monthly_quota: 0 })
      .expect(200);
    const blocked = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', student)
      .send({ resource_id: COURT, start: at(weekday(3), 12) })
      .expect(422);
    expect(blocked.body.code).toBe('QUOTA_EXHAUSTED');
    await t.http().put('/api/v1/admin/settings').set('Authorization', admin).send(DEFAULT_RULES).expect(200);
    const audit = await t
      .http()
      .get('/api/v1/admin/audit-log?entity=settings')
      .set('Authorization', admin)
      .expect(200);
    expect(audit.body.items[0]).toMatchObject({ action: 'settings.update', actor_id: U.admin.id });
  });

  it('externals: 24 h window only', async () => {
    const res = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', external)
      .send({ resource_id: COURT, start: at(weekday(3), 9) })
      .expect(422);
    expect(res.body.code).toBe('WINDOW_EXCEEDED');
  });

  it('SDD 7.3: emergency block cancels bookings, refunds, then 409 on top; unblock frees the slot', async () => {
    const day = weekday(5);
    const booking = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', student)
      .send({ resource_id: COURT, start: at(day, 16) })
      .expect(201);
    const block = await t
      .http()
      .post('/api/v1/admin/blocks')
      .set('Authorization', admin)
      .send({ resource_id: COURT, kind: 'emergency', reason: 'Avarie', start: at(day, 15), end: at(day, 18) })
      .expect(201);
    expect(block.body).toMatchObject({
      cancelled_bookings_count: 1,
      notified_users_count: 1,
      block: { kind: 'emergency', reason: 'Avarie' },
    });
    const notice = t.jobs.find(
      (j) => j.name === 'booking-cancelled' && j.data.occupancyId === booking.body.id,
    );
    expect(notice?.data).toMatchObject({ critical: true, blockId: block.body.block.id });

    const after = await t
      .http()
      .get(`/api/v1/bookings/${booking.body.id}`)
      .set('Authorization', student)
      .expect(200);
    expect(after.body).toMatchObject({
      status: 'cancelled',
      cancel_source: 'emergency',
      cancel_reason: 'Avarie',
    });

    await t
      .http()
      .post('/api/v1/admin/blocks')
      .set('Authorization', admin)
      .send({ resource_id: COURT, kind: 'maintenance', reason: 'x', start: at(day, 16), end: at(day, 17) })
      .expect(409);
    const slotBlocked = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', teacher)
      .send({ resource_id: COURT, start: at(day, 16) })
      .expect(409);
    expect(slotBlocked.body.code).toBe('SLOT_BLOCKED');

    await t
      .http()
      .delete(`/api/v1/admin/blocks/${block.body.block.id}`)
      .set('Authorization', admin)
      .expect(204);
    await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', teacher)
      .send({ resource_id: COURT, start: at(day, 16) })
      .expect(201);
  });

  it('waitlist: join, offer after cancellation, accept books the slot', async () => {
    const day = weekday(2);
    const [holderId] = await teachers(1);
    const holder = t.bearer(holderId, 'teacher');
    const booked = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', holder)
      .send({ resource_id: COURT, start: at(day, 20) })
      .expect(201);

    const join = { day: day.toISODate(), resource_id: COURT, start: at(day, 20), end: at(day, 21) };
    const entry = await t
      .http()
      .post('/api/v1/waitlist')
      .set('Authorization', student)
      .send(join)
      .expect(201);
    expect(entry.body).toMatchObject({ priority: 2, status: 'waiting' });
    await t.http().post('/api/v1/waitlist').set('Authorization', student).send(join).expect(409);

    await t.http().delete(`/api/v1/bookings/${booked.body.id}`).set('Authorization', holder).expect(200);
    // The worker would run this from the slot-freed job.
    const [offer] = await t.app
      .get(WaitlistService)
      .offerFreedPeriod(COURT, { start: new Date(at(day, 20)), end: new Date(at(day, 21)) });
    expect(offer.offeredTo).toEqual([entry.body.id]);

    const mine = await t.http().get('/api/v1/me/waitlist').set('Authorization', student).expect(200);
    expect(mine.body[0]).toMatchObject({
      status: 'offered',
      offered_slot: { resource_id: COURT, start: at(day, 20) },
    });

    const accepted = await t
      .http()
      .post(`/api/v1/waitlist/${entry.body.id}/accept`)
      .set('Authorization', student)
      .expect(201);
    expect(accepted.body).toMatchObject({ resource_id: COURT, start: at(day, 20), status: 'active' });
    await t.http().post(`/api/v1/waitlist/${entry.body.id}/accept`).set('Authorization', student).expect(409);
  });

  it('check-in by button inside the window, then 409', async () => {
    // A resource open around the clock with 15-minute slots: the next slot starts within 15 minutes.
    const allDay = Object.fromEntries(
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [{ open: '00:00', close: '23:45' }]]),
    );
    const resource = await t
      .http()
      .post('/api/v1/admin/resources')
      .set('Authorization', admin)
      .send({
        name: 'Sala E2E',
        type: 'sală',
        location: 'e2e',
        capacity: 4,
        sport_ids: [EXAMPLE_SPORTS.volleyball.id],
        opening_hours: allDay,
        slot_minutes: 15,
      })
      .expect(201);
    const now = DateTime.now().setZone(TZ);
    const next = now.startOf('hour').plus({ minutes: Math.floor(now.minute / 15) * 15 + 15 });
    if (next.hour === 23 && next.minute === 45) return; // the last quarter of the day is closed
    const [prof] = await teachers(1);
    const auth = t.bearer(prof, 'teacher');
    const booking = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', auth)
      .send({ resource_id: resource.body.id, start: next.toISO() })
      .expect(201);
    await t
      .http()
      .put('/api/v1/admin/settings')
      .set('Authorization', admin)
      .send({ ...DEFAULT_RULES, checkin_minutes_before: 20 })
      .expect(200);
    const checkIn = await t
      .http()
      .post(`/api/v1/bookings/${booking.body.id}/check-in`)
      .set('Authorization', auth)
      .send({ method: 'button' })
      .expect(200);
    expect(checkIn.body).toMatchObject({
      booking_id: booking.body.id,
      category: 'member',
      holder_name: 'Profesor 0',
    });
    await t
      .http()
      .post(`/api/v1/bookings/${booking.body.id}/check-in`)
      .set('Authorization', auth)
      .send({ method: 'button' })
      .expect(409);
    await t.http().put('/api/v1/admin/settings').set('Authorization', admin).send(DEFAULT_RULES).expect(200);
  });

  it('admin cancel: always refunds, notifies with the reason, audits; then 409; listed by the filters', async () => {
    const day = weekday(1);
    const booking = await t
      .http()
      .post('/api/v1/bookings')
      .set('Authorization', student)
      .send({ resource_id: COURT, start: at(day, 13) })
      .expect(201);
    const month = `${day.toFormat('yyyy-MM')}-01`;
    const quota = async () =>
      (
        await t.db.query(`SELECT refunded FROM monthly_quota WHERE user_id = $1 AND month = $2`, [
          U.student.id,
          month,
        ])
      ).rows[0].refunded as number;
    const refundedBefore = await quota();
    const url = `/api/v1/admin/bookings/${booking.body.id}/cancel`;
    await t.http().post(url).set('Authorization', student).send({ reason: 'x' }).expect(403);

    const res = await t
      .http()
      .post(url)
      .set('Authorization', admin)
      .send({ reason: 'Teren indisponibil' })
      .expect(200);
    expect(res.body).toEqual({
      quota_refunded: true,
      booking: expect.objectContaining({
        id: booking.body.id,
        status: 'cancelled',
        cancel_source: 'admin',
        cancel_reason: 'Teren indisponibil',
      }),
    });
    expect(await quota()).toBe(refundedBefore + 1);
    const notice = t.jobs.find(
      (j) => j.name === 'booking-cancelled' && j.data.occupancyId === booking.body.id,
    );
    expect(notice?.data).toMatchObject({
      userId: U.student.id,
      critical: true,
      data: { cancel_source: 'admin', reason: 'Teren indisponibil' },
    });
    expect(
      t.jobs.some((j) => j.name === 'slot-freed' && j.data.start === new Date(at(day, 13)).toISOString()),
    ).toBe(true);
    const audit = await t.db.query(`SELECT actor_id, action, after FROM audit_log WHERE entity_id = $1`, [
      booking.body.id,
    ]);
    expect(audit.rows).toEqual([
      expect.objectContaining({
        actor_id: U.admin.id,
        action: 'booking.cancel',
        after: expect.objectContaining({ reason: 'Teren indisponibil', quota_refunded: true }),
      }),
    ]);

    const again = await t.http().post(url).set('Authorization', admin).send({ reason: 'x' }).expect(409);
    expect(again.body.code).toBe('BOOKING_NOT_ACTIVE');
    await t
      .http()
      .post('/api/v1/admin/bookings/00000000-0000-4000-8000-000000000000/cancel')
      .set('Authorization', admin)
      .send({ reason: 'x' })
      .expect(404);

    const list = await t
      .http()
      .get(`/api/v1/admin/bookings?resource=${COURT}&date=${day.toISODate()}&status=cancelled`)
      .set('Authorization', admin)
      .expect(200);
    expect(list.body.items.map((b: { id: string }) => b.id)).toContain(booking.body.id);
    expect(list.body.items.every((b: { status: string }) => b.status === 'cancelled')).toBe(true);
    expect(list.body.total).toBe(list.body.items.length);
  });

  describe('dashboard and monthly report (March 2025, rows inserted directly)', () => {
    const DAY = '2025-03-10'; // a Monday
    const ts = (hhmm: string) => `${DAY}T${hhmm}:00+02:00`;
    let profId: string;

    beforeAll(async () => {
      [profId] = await teachers(1);
      // created_by stays NULL: DELETE /me (last test) anonymizes user_id but not created_by.
      const insert = (resource: string, from: string, to: string, user: string, status: string, extra = '') =>
        t.db.query(
          `INSERT INTO occupancy (resource_id, period, kind, user_id, qr_nonce, status, cancel_source, checked_in_at)
           VALUES ($1, tstzrange($2, $3, '[)'), 'booking', $4, gen_random_uuid(), $5,
                   ${status === 'cancelled' ? `'user'` : 'NULL'}, ${extra || 'NULL'})`,
          [resource, ts(from), ts(to), user, status],
        );
      await insert(COURT, '18:00', '19:00', profId, 'completed', `'${ts('17:55')}'`);
      await insert(COURT, '19:00', '20:00', U.student.id, 'no_show');
      await insert(HALL, '10:00', '11:30', U.student.id, 'active');
      await insert(HALL, '13:00', '14:30', U.external.id, 'completed');
      await insert(HALL, '07:00', '08:30', U.student.id, 'cancelled');
      await t.db.query(
        `INSERT INTO monthly_quota (user_id, month, used, refunded) VALUES ($1, '2025-03-01', 4, 0), ($2, '2025-03-01', 5, 2)`,
        [U.student.id, profId],
      );
    });

    it('GET /admin/dashboard: every active resource, check-ins and no-shows of the day', async () => {
      const res = await t
        .http()
        .get(`/api/v1/admin/dashboard?date=${DAY}`)
        .set('Authorization', admin)
        .expect(200);
      const { rows } = await t.db.query(`SELECT count(*)::int AS n FROM resources WHERE active`);
      expect(res.body).toMatchObject({ date: DAY, check_ins_count: 1, no_shows_count: 1 });
      expect(res.body.resources).toHaveLength(rows[0].n);
      const court = res.body.resources.find((r: { resource_id: string }) => r.resource_id === COURT);
      expect(court.slots).toHaveLength(15);
      const hall = res.body.resources.find((r: { resource_id: string }) => r.resource_id === HALL);
      expect(hall.slots.find((s: { start: string }) => s.start === ts('10:00'))).toMatchObject({
        status: 'occupied',
        holder_name: U.student.full_name,
      });

      const today = await t.http().get('/api/v1/admin/dashboard').set('Authorization', admin).expect(200);
      expect(today.body.date).toBe(DateTime.now().setZone(TZ).toISODate());
      await t.http().get('/api/v1/admin/dashboard').set('Authorization', student).expect(403);
    });

    it('GET /admin/reports: occupancy rates, no-shows, categories, users at the limit; CSV export', async () => {
      const res = await t
        .http()
        .get('/api/v1/admin/reports?month=2025-03')
        .set('Authorization', admin)
        .expect(200);
      expect(res.body).toMatchObject({
        month: '2025-03',
        no_shows_count: 1,
        bookings_by_category: { members: 3, externals: 1 },
        users_reaching_limit_count: 1,
      });
      const rate = (id: string) =>
        res.body.occupancy.find((r: { resource_id: string }) => r.resource_id === id);
      // March 2025: 21 weekdays (07–22) and 5 Saturdays (09–18).
      expect(rate(COURT)).toMatchObject({ rate: 0.0056 }); // 2 of 21 × 15 + 5 × 9 = 360 slots
      expect(rate(COURT).by_hour).toEqual(expect.arrayContaining([{ hour: 18, rate: 0.0476 }]));
      expect(rate(HALL)).toMatchObject({ rate: 0.0083 }); // 2 of 21 × 10 + 5 × 6 = 240 slots

      const csv = await t
        .http()
        .get('/api/v1/admin/reports?month=2025-03&format=csv')
        .set('Authorization', admin)
        .expect(200)
        .expect('Content-Type', /^text\/csv/);
      expect(csv.text).toContain(`\r\n2025-03,occupancy_rate,${COURT},Teren baschet 2,,0.0056\r\n`);
      expect(csv.text).toContain('\r\n2025-03,bookings_externals,,,,1\r\n');

      await t
        .http()
        .get('/api/v1/admin/reports?month=2025-03&format=pdf')
        .set('Authorization', admin)
        .expect(501);
      await t.http().get('/api/v1/admin/reports?month=2025-3').set('Authorization', admin).expect(422);
    });
  });

  it('DELETE /me: future bookings cancelled, history anonymized, account gone', async () => {
    const extAuth = t.bearer(U.external.id, 'external');
    const soon = DateTime.now().setZone(TZ).plus({ hours: 3 }).startOf('hour');
    let bookingId: string | undefined;
    if (soon.weekday <= 5 && soon.hour >= 7 && soon.hour <= 21) {
      const b = await t
        .http()
        .post('/api/v1/bookings')
        .set('Authorization', extAuth)
        .send({ resource_id: COURT, start: soon.toISO() });
      if (b.status === 201) bookingId = b.body.id;
    }
    await t.http().delete('/api/v1/me').set('Authorization', extAuth).expect(204);
    const { rows } = await t.db.query(`SELECT 1 FROM users WHERE id = $1`, [U.external.id]);
    expect(rows).toHaveLength(0);
    if (bookingId) {
      const occ = await t.db.query(`SELECT status, user_id, anonymized_at FROM occupancy WHERE id = $1`, [
        bookingId,
      ]);
      expect(occ.rows[0]).toMatchObject({ status: 'cancelled', user_id: null });
      expect(occ.rows[0].anonymized_at).not.toBeNull();
    }
    await t.http().get('/api/v1/me').set('Authorization', extAuth).expect(401);
  });
});
