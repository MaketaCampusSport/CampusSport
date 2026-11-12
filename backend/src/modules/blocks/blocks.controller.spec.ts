import { AppException } from '../../common/errors/app.exception';
import { EXAMPLE_BLOCK_CREATE, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

const BLOCK_ID = 'bb1d2e3f-4a5b-4c6d-9e7f-8091a2b3c4d5';
const BLOCK = {
  id: BLOCK_ID,
  resource_id: EXAMPLE_BLOCK_CREATE.resource_id,
  kind: 'emergency',
  start: '2026-11-12T16:05:00+02:00',
  end: null,
  reason: 'Avarie',
  recurrence_id: null,
  created_by: EXAMPLE_USERS.admin.id,
};
/** `BlockResult` example. */
const RESULT = {
  block: BLOCK,
  cancelled_bookings_count: 23,
  superseded_blocks_count: 0,
  notified_users_count: 23,
};

describe('BlocksController', () => {
  let t: TestApp;
  const blocks = { list: jest.fn(), create: jest.fn(), remove: jest.fn(), delivery: jest.fn() };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [BlocksController],
      providers: [{ provide: BlocksService, useValue: blocks }],
    });
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /admin/blocks', () => {
    it('200 page with filters', async () => {
      blocks.list.mockResolvedValue({ page: 1, page_size: 20, total: 1, items: [BLOCK] });
      const res = await t
        .http()
        .get(`/api/v1/admin/blocks?resource=${BLOCK.resource_id}&kind=emergency&from=2026-11-01T00:00:00Z`)
        .set('Authorization', await t.bearer('admin'))
        .expect(200);
      expect(res.body.items).toEqual([BLOCK]);
      expect(blocks.list).toHaveBeenCalledWith(
        expect.objectContaining({ resource: BLOCK.resource_id, kind: 'emergency' }),
      );
    });

    it('422 for an unknown kind, 403 for students', async () => {
      await t
        .http()
        .get('/api/v1/admin/blocks?kind=booking')
        .set('Authorization', await t.bearer('admin'))
        .expect(422);
      await t
        .http()
        .get('/api/v1/admin/blocks')
        .set('Authorization', await t.bearer('student'))
        .expect(403);
    });
  });

  describe('POST /admin/blocks', () => {
    it('201 BlockResult for the emergency example (end: null)', async () => {
      blocks.create.mockResolvedValue(RESULT);
      const res = await t
        .http()
        .post('/api/v1/admin/blocks')
        .set('Authorization', await t.bearer('admin'))
        .send(EXAMPLE_BLOCK_CREATE)
        .expect(201);
      expect(res.body).toEqual(RESULT);
      expect(blocks.create).toHaveBeenCalledWith(TEST_USERS.admin, EXAMPLE_BLOCK_CREATE);
    });

    it('409 BLOCK_CONFLICT', async () => {
      blocks.create.mockRejectedValue(new AppException('BLOCK_CONFLICT'));
      const res = await t
        .http()
        .post('/api/v1/admin/blocks')
        .set('Authorization', await t.bearer('admin'))
        .send(EXAMPLE_BLOCK_CREATE)
        .expect(409);
      expect(res.body.code).toBe('BLOCK_CONFLICT');
    });

    it('422 for pe_class/event kinds or a missing reason', async () => {
      const auth = await t.bearer('admin');
      await t
        .http()
        .post('/api/v1/admin/blocks')
        .set('Authorization', auth)
        .send({ ...EXAMPLE_BLOCK_CREATE, kind: 'event' })
        .expect(422);
      const { reason: _r, ...noReason } = EXAMPLE_BLOCK_CREATE;
      await t.http().post('/api/v1/admin/blocks').set('Authorization', auth).send(noReason).expect(422);
    });

    it('403 for teachers', async () => {
      await t
        .http()
        .post('/api/v1/admin/blocks')
        .set('Authorization', await t.bearer('teacher'))
        .send(EXAMPLE_BLOCK_CREATE)
        .expect(403);
    });
  });

  describe('DELETE /admin/blocks/{id}', () => {
    it('204 and 404', async () => {
      const auth = await t.bearer('admin');
      blocks.remove.mockResolvedValueOnce(undefined);
      await t.http().delete(`/api/v1/admin/blocks/${BLOCK_ID}`).set('Authorization', auth).expect(204);
      expect(blocks.remove).toHaveBeenCalledWith(TEST_USERS.admin, BLOCK_ID);
      blocks.remove.mockRejectedValueOnce(new AppException('NOT_FOUND'));
      await t.http().delete(`/api/v1/admin/blocks/${BLOCK_ID}`).set('Authorization', auth).expect(404);
    });
  });

  describe('GET /admin/blocks/{id}/delivery', () => {
    it('200 DeliveryStatus example', async () => {
      const status = { notified: 23, delivered: 21, failed: 0, by_channel: { push: 19, email: 23, sms: 4 } };
      blocks.delivery.mockResolvedValue(status);
      await t
        .http()
        .get(`/api/v1/admin/blocks/${BLOCK_ID}/delivery`)
        .set('Authorization', await t.bearer('admin'))
        .expect(200, status);
    });

    it('404 unknown block', async () => {
      blocks.delivery.mockRejectedValue(new AppException('NOT_FOUND'));
      await t
        .http()
        .get(`/api/v1/admin/blocks/${BLOCK_ID}/delivery`)
        .set('Authorization', await t.bearer('admin'))
        .expect(404);
    });
  });

  describe('stubbed PE schedule and event routes (501)', () => {
    it.each([
      ['post', '/api/v1/admin/schedule/import'],
      ['post', `/api/v1/admin/schedule/import/${BLOCK_ID}/confirm`],
      ['post', '/api/v1/admin/schedule/classes'],
      ['delete', `/api/v1/admin/schedule/recurrences/${BLOCK_ID}`],
      ['post', '/api/v1/admin/events'],
    ] as const)('%s %s', async (method, path) => {
      const send = (auth: string) => t.http()[method](path).set('Authorization', auth);
      const res = await send(await t.bearer('admin')).expect(501);
      expect(res.body.code).toBe('NOT_IMPLEMENTED');
      await send(await t.bearer('student')).expect(403);
    });
  });
});
