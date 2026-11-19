import { AppException } from '../../common/errors/app.exception';
import { EXAMPLE_RESOURCES, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { DEFAULT_RULES } from '../settings/settings.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

const SETTINGS = {
  ...DEFAULT_RULES,
  updated_by: EXAMPLE_USERS.admin.id,
  updated_at: '2026-11-05T10:00:00+02:00',
};

describe('AdminController', () => {
  let t: TestApp;
  const admin = { getSettings: jest.fn(), updateSettings: jest.fn(), auditLog: jest.fn() };
  const dashboards = { dashboard: jest.fn() };
  const reports = { monthlyReport: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [AdminController],
      providers: [
        { provide: AdminService, useValue: admin },
        { provide: DashboardService, useValue: dashboards },
        { provide: ReportsService, useValue: reports },
      ],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /admin/settings', () => {
    it('200 Settings with the SRS 9.2 defaults', async () => {
      admin.getSettings.mockResolvedValue(SETTINGS);
      const res = await t
        .http()
        .get('/api/v1/admin/settings')
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(res.body).toMatchObject({
        monthly_quota: 4,
        max_active_bookings: 2,
        booking_window_days_student: 7,
        member_replaces_external: false,
      });
    });

    it('403 for non-admins', async () => {
      await t
        .http()
        .get('/api/v1/admin/settings')
        .set('Authorization', await t.bearer('teacher'))
        .expect(403);
    });
  });

  describe('PUT /admin/settings', () => {
    const body = { ...DEFAULT_RULES, monthly_quota: 5 };

    it('200 saved rules', async () => {
      admin.updateSettings.mockResolvedValue({ ...SETTINGS, monthly_quota: 5 });
      const res = await t
        .http()
        .put('/api/v1/admin/settings')
        .set('Authorization', await t.bearer('admin'))
        .send(body)
        .expect(200);
      expect(res.body.monthly_quota).toBe(5);
      expect(admin.updateSettings).toHaveBeenCalledWith(TEST_USERS.admin, body);
    });

    it('422 for missing or out-of-range values', async () => {
      const auth = await t.bearer('admin');
      const { monthly_quota: _q, ...missing } = DEFAULT_RULES;
      await t.http().put('/api/v1/admin/settings').set('Authorization', auth).send(missing).expect(422);
      await t
        .http()
        .put('/api/v1/admin/settings')
        .set('Authorization', auth)
        .send({ ...DEFAULT_RULES, default_slot_minutes: 10 })
        .expect(422);
      await t
        .http()
        .put('/api/v1/admin/settings')
        .set('Authorization', auth)
        .send({ ...DEFAULT_RULES, member_replaces_external: 'yes' })
        .expect(422);
    });

    it('422 when a per-sport quota is sent (not supported yet)', async () => {
      admin.updateSettings.mockRejectedValue(new AppException('VALIDATION_FAILED'));
      await t
        .http()
        .put('/api/v1/admin/settings')
        .set('Authorization', await t.bearer('admin'))
        .send({ ...DEFAULT_RULES, monthly_quota_per_sport: { x: 2 } })
        .expect(422);
    });
  });

  describe('GET /admin/audit-log', () => {
    it('200 page of AuditEntry', async () => {
      const entry = {
        id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
        actor_id: EXAMPLE_USERS.admin.id,
        action: 'block.create',
        entity: 'occupancy',
        entity_id: 'bb1d2e3f-4a5b-4c6d-9e7f-8091a2b3c4d5',
        before: null,
        after: { kind: 'emergency', reason: 'Avarie' },
        at: '2026-11-12T16:05:00+02:00',
      };
      admin.auditLog.mockResolvedValue({ page: 1, page_size: 20, total: 1, items: [entry] });
      const res = await t
        .http()
        .get(`/api/v1/admin/audit-log?entity=occupancy&actor=${EXAMPLE_USERS.admin.id}`)
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(res.body.items).toEqual([entry]);
      expect(admin.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'occupancy', actor: EXAMPLE_USERS.admin.id }),
      );
    });

    it('422 for a malformed date, 403 for students', async () => {
      await t
        .http()
        .get('/api/v1/admin/audit-log?from=ieri')
        .set('Authorization', await t.bearer('admin'))
        .expect(422);
      await t
        .http()
        .get('/api/v1/admin/audit-log')
        .set('Authorization', await t.bearer('student'))
        .expect(403);
    });
  });

  describe('GET /admin/dashboard', () => {
    /** `Dashboard` example. */
    const DASHBOARD = {
      date: '2026-11-05',
      resources: [
        {
          resource_id: EXAMPLE_RESOURCES.basketballCourt.id,
          resource_name: 'Teren baschet 2',
          slots: [
            {
              start: '2026-11-05T18:00:00+02:00',
              end: '2026-11-05T19:00:00+02:00',
              status: 'occupied',
              bookable: false,
              booking_id: 'e3a94f60-1b2c-4d7e-8f05-6c2b9a0d4e11',
              holder_name: 'Ion Popescu',
            },
          ],
        },
      ],
      check_ins_count: 41,
      no_shows_count: 3,
    };

    it('200 Dashboard for the requested day', async () => {
      dashboards.dashboard.mockResolvedValue(DASHBOARD);
      const res = await t
        .http()
        .get('/api/v1/admin/dashboard?date=2026-11-05')
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(res.body).toEqual(DASHBOARD);
      expect(dashboards.dashboard).toHaveBeenCalledWith(TEST_USERS.admin, '2026-11-05');
    });

    it('defaults to today (no date passed on)', async () => {
      dashboards.dashboard.mockResolvedValue(DASHBOARD);
      await t
        .http()
        .get('/api/v1/admin/dashboard')
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(dashboards.dashboard).toHaveBeenCalledWith(TEST_USERS.admin, undefined);
    });

    it('422 for a malformed date', async () => {
      const auth = await t.bearer('admin');
      await t.http().get('/api/v1/admin/dashboard?date=2026-13-40').set('Authorization', auth).expect(422);
      await t.http().get('/api/v1/admin/dashboard?date=azi').set('Authorization', auth).expect(422);
      expect(dashboards.dashboard).not.toHaveBeenCalled();
    });

    it('403 for students, 401 anonymously', async () => {
      await t
        .http()
        .get('/api/v1/admin/dashboard')
        .set('Authorization', await t.bearer('student'))
        .expect(403);
      await t.http().get('/api/v1/admin/dashboard').expect(401);
    });
  });

  describe('GET /admin/reports', () => {
    /** `MonthlyReport` example. */
    const REPORT = {
      month: '2026-10',
      occupancy: [
        {
          resource_id: EXAMPLE_RESOURCES.basketballCourt.id,
          resource_name: 'Teren baschet 2',
          rate: 0.72,
          by_hour: [{ hour: 18, rate: 0.95 }],
        },
      ],
      no_shows_count: 37,
      bookings_by_category: { members: 812, externals: 64 },
      users_reaching_limit_count: 58,
    };

    it('200 MonthlyReport as JSON by default', async () => {
      reports.monthlyReport.mockResolvedValue(REPORT);
      const res = await t
        .http()
        .get('/api/v1/admin/reports?month=2026-10')
        .set('Authorization', await t.bearer('admin'))
        .expect(200)
        .expect('Content-Type', /application\/json/);
      expect(res.body).toEqual(REPORT);
      expect(reports.monthlyReport).toHaveBeenCalledWith('2026-10');
    });

    it('format=csv downloads a flat text/csv table', async () => {
      reports.monthlyReport.mockResolvedValue(REPORT);
      const res = await t
        .http()
        .get('/api/v1/admin/reports?month=2026-10&format=csv')
        .set('Authorization', await t.bearer('admin'))
        .expect(200)
        .expect('Content-Type', /^text\/csv; charset=utf-8/)
        .expect('Content-Disposition', 'attachment; filename="campussport-raport-2026-10.csv"');
      expect(res.text.startsWith('﻿')).toBe(true);
      const lines = res.text.slice(1).trimEnd().split('\r\n');
      expect(lines[0]).toBe('month,metric,resource_id,resource_name,hour,value');
      expect(lines).toContain(
        `2026-10,occupancy_rate_by_hour,${EXAMPLE_RESOURCES.basketballCourt.id},Teren baschet 2,18,0.95`,
      );
      expect(lines).toContain('2026-10,users_reaching_limit_count,,,,58');
    });

    it('format=pdf is not implemented yet (501)', async () => {
      await t
        .http()
        .get('/api/v1/admin/reports?month=2026-10&format=pdf')
        .set('Authorization', await t.bearer('admin'))
        .expect(501);
      expect(reports.monthlyReport).not.toHaveBeenCalled();
    });

    it('422 for a missing or malformed month or an unknown format', async () => {
      const auth = await t.bearer('admin');
      await t.http().get('/api/v1/admin/reports').set('Authorization', auth).expect(422);
      const res = await t
        .http()
        .get('/api/v1/admin/reports?month=2026-13')
        .set('Authorization', auth)
        .expect(422);
      expect(res.body).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { fields: { month: expect.any(Array) } },
      });
      await t.http().get('/api/v1/admin/reports?month=2026-1').set('Authorization', auth).expect(422);
      await t
        .http()
        .get('/api/v1/admin/reports?month=2026-10&format=xlsx')
        .set('Authorization', auth)
        .expect(422);
      expect(reports.monthlyReport).not.toHaveBeenCalled();
    });

    it('403 for teachers, 401 anonymously', async () => {
      await t
        .http()
        .get('/api/v1/admin/reports?month=2026-10')
        .set('Authorization', await t.bearer('teacher'))
        .expect(403);
      await t.http().get('/api/v1/admin/reports?month=2026-10').expect(401);
    });
  });
});
