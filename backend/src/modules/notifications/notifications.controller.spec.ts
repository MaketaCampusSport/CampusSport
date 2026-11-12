import { AppException } from '../../common/errors/app.exception';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/** `PushSubscriptionInput` example. */
const SUBSCRIPTION = {
  endpoint: 'https://push.example.com/send/abc123',
  keys: {
    p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
};
const SUB_ID = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9';
/** `NotificationPreferences` example. */
const PREFS = { push: true, email: true, sms: false, language: 'ro' };

describe('NotificationsController', () => {
  let t: TestApp;
  const notifications = { registerPush: jest.fn(), deletePush: jest.fn(), getPreferences: jest.fn(), updatePreferences: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({ controllers: [NotificationsController], providers: [{ provide: NotificationsService, useValue: notifications }] });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('POST /me/push-subscriptions', () => {
    it('201 PushSubscription', async () => {
      const saved = { id: SUB_ID, created_at: '2026-11-12T10:00:00+02:00', ...SUBSCRIPTION };
      notifications.registerPush.mockResolvedValue(saved);
      const res = await t.http().post('/api/v1/me/push-subscriptions').set('Authorization', await t.bearer('student')).send(SUBSCRIPTION).expect(201);
      expect(res.body).toEqual(saved);
      expect(notifications.registerPush).toHaveBeenCalledWith(TEST_USERS.student, SUBSCRIPTION);
    });

    it('422 for a non-https endpoint or missing keys; 401 anonymously', async () => {
      const auth = await t.bearer('student');
      await t.http().post('/api/v1/me/push-subscriptions').set('Authorization', auth).send({ ...SUBSCRIPTION, endpoint: 'http://push.example.com/x' }).expect(422);
      await t.http().post('/api/v1/me/push-subscriptions').set('Authorization', auth).send({ endpoint: SUBSCRIPTION.endpoint }).expect(422);
      await t.http().post('/api/v1/me/push-subscriptions').send(SUBSCRIPTION).expect(401);
    });
  });

  describe('DELETE /me/push-subscriptions/{id}', () => {
    it('204, or 404 when the device is not the caller’s', async () => {
      const auth = await t.bearer('student');
      notifications.deletePush.mockResolvedValueOnce(undefined);
      await t.http().delete(`/api/v1/me/push-subscriptions/${SUB_ID}`).set('Authorization', auth).expect(204);
      notifications.deletePush.mockRejectedValueOnce(new AppException('NOT_FOUND'));
      await t.http().delete(`/api/v1/me/push-subscriptions/${SUB_ID}`).set('Authorization', auth).expect(404);
    });
  });

  describe('GET/PUT /me/notification-preferences', () => {
    it('GET 200 preferences', async () => {
      notifications.getPreferences.mockResolvedValue(PREFS);
      await t.http().get('/api/v1/me/notification-preferences').set('Authorization', await t.bearer('external')).expect(200, PREFS);
    });

    it('PUT 200 saved preferences', async () => {
      const next = { push: false, email: true, sms: true, language: 'en' };
      notifications.updatePreferences.mockResolvedValue(next);
      await t.http().put('/api/v1/me/notification-preferences').set('Authorization', await t.bearer('external')).send(next).expect(200, next);
      expect(notifications.updatePreferences).toHaveBeenCalledWith(TEST_USERS.external, next);
    });

    it('PUT 422 for missing channels or an unknown language', async () => {
      const auth = await t.bearer('student');
      await t.http().put('/api/v1/me/notification-preferences').set('Authorization', auth).send({ push: true }).expect(422);
      await t.http().put('/api/v1/me/notification-preferences').set('Authorization', auth).send({ ...PREFS, language: 'fr' }).expect(422);
    });

    it('401 anonymously', async () => {
      await t.http().get('/api/v1/me/notification-preferences').expect(401);
    });
  });

  describe('POST /admin/announcements', () => {
    it('501 for admins (stub), 403 for others', async () => {
      const body = { message_ro: 'Vestiarele sunt închise astăzi până la ora 12:00.' };
      await t.http().post('/api/v1/admin/announcements').set('Authorization', await t.bearer('admin')).send(body).expect(501);
      await t.http().post('/api/v1/admin/announcements').set('Authorization', await t.bearer('student')).send(body).expect(403);
    });
  });
});
