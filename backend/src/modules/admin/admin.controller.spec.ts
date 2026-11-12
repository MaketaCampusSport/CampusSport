import { AppException } from '../../common/errors/app.exception';
import { EXAMPLE_USERS } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { DEFAULT_RULES } from '../settings/settings.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

const SETTINGS = {
  ...DEFAULT_RULES,
  updated_by: EXAMPLE_USERS.admin.id,
  updated_at: '2026-11-05T10:00:00+02:00',
};

describe('AdminController', () => {
  let t: TestApp;
  const admin = { getSettings: jest.fn(), updateSettings: jest.fn(), auditLog: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [AdminController],
      providers: [{ provide: AdminService, useValue: admin }],
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

  describe('stubs', () => {
    it('GET /admin/dashboard and /admin/reports -> 501', async () => {
      const auth = await t.bearer('admin');
      await t.http().get('/api/v1/admin/dashboard?date=2026-11-05').set('Authorization', auth).expect(501);
      await t
        .http()
        .get('/api/v1/admin/reports?month=2026-10&format=csv')
        .set('Authorization', auth)
        .expect(501);
    });
  });
});
