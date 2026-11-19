import { EXAMPLE_RESOURCES, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { TEST_USERS } from '../../testing/test-app';
import { AnnouncementsService } from './announcements.service';

const HALL = EXAMPLE_RESOURCES.sportsHall.id;
const NOW = new Date('2026-11-12T07:00:00+02:00');
const MESSAGE = {
  message_ro: 'Vestiarele sunt închise astăzi până la ora 12:00.',
  message_en: 'The changing rooms are closed today until 12:00.',
};

/** Scripted database: the recipients query returns `holders`. */
function setup(holders = [EXAMPLE_USERS.student.id, EXAMPLE_USERS.teacher.id]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return /SELECT DISTINCT user_id/.test(sql) ? holders.map((user_id) => ({ user_id })) : [];
  });
  const em = { query };
  const dataSource = { transaction: jest.fn(async (cb: (e: typeof em) => unknown) => cb(em)) };
  const jobs = { notify: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new AnnouncementsService(dataSource as never, jobs as never, audit as never);
  return { service, jobs, audit, em, calls };
}

describe('AnnouncementsService.create', () => {
  it('resource + interval: distinct holders of active bookings that overlap, one job each', async () => {
    const { service, jobs, audit, em, calls } = setup();
    const dto = {
      resource_id: HALL,
      start: '2026-11-12T08:00:00+02:00',
      end: '2026-11-12T12:00:00+02:00',
      ...MESSAGE,
    };

    await expect(service.create(TEST_USERS.admin, dto, NOW)).resolves.toEqual({ recipients_count: 2 });

    const [select] = calls;
    expect(select.sql).toMatch(/SELECT DISTINCT user_id FROM occupancy/);
    expect(select.sql).toMatch(
      /kind = 'booking' AND status = 'active' AND user_id IS NOT NULL AND upper\(period\) > \$1/,
    );
    expect(select.sql).toMatch(/resource_id = \$2 AND period && tstzrange\(\$3, \$4, '\[\)'\)/);
    expect(select.params).toEqual([
      NOW,
      HALL,
      new Date('2026-11-12T06:00:00Z'),
      new Date('2026-11-12T10:00:00Z'),
    ]);
    expect(jobs.notify).toHaveBeenCalledTimes(2);
    expect(jobs.notify).toHaveBeenCalledWith({
      type: 'announcement',
      userId: EXAMPLE_USERS.student.id,
      data: MESSAGE,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: TEST_USERS.admin.id,
        action: 'announcement.create',
        entity: 'announcement',
        after: expect.objectContaining({
          resource_id: HALL,
          recipients_count: 2,
          recipient_ids: [EXAMPLE_USERS.student.id, EXAMPLE_USERS.teacher.id],
          message_ro: MESSAGE.message_ro,
        }),
      }),
      em,
    );
  });

  it('resource only: every upcoming active booking on it; message_en is optional', async () => {
    const { service, jobs, calls } = setup([EXAMPLE_USERS.external.id]);
    await service.create(TEST_USERS.admin, { resource_id: HALL, message_ro: MESSAGE.message_ro }, NOW);
    expect(calls[0].sql).not.toMatch(/tstzrange/);
    expect(calls[0].params).toEqual([NOW, HALL]);
    expect(jobs.notify).toHaveBeenCalledWith({
      type: 'announcement',
      userId: EXAMPLE_USERS.external.id,
      data: { message_ro: MESSAGE.message_ro, message_en: null },
    });
  });

  it('interval only: all resources', async () => {
    const { service, calls } = setup([]);
    const result = await service.create(
      TEST_USERS.admin,
      { start: '2026-11-12T08:00:00+02:00', end: '2026-11-12T12:00:00+02:00', ...MESSAGE },
      NOW,
    );
    expect(result).toEqual({ recipients_count: 0 });
    expect(calls[0].sql).not.toMatch(/resource_id =/);
    expect(calls[0].params).toHaveLength(3);
  });

  it.each([
    ['neither a resource nor an interval', { ...MESSAGE }, 'resource_id'],
    ['start without end', { start: '2026-11-12T08:00:00+02:00', ...MESSAGE }, 'end'],
    ['end without start', { resource_id: HALL, end: '2026-11-12T08:00:00+02:00', ...MESSAGE }, 'start'],
    [
      'end before start',
      { start: '2026-11-12T12:00:00+02:00', end: '2026-11-12T08:00:00+02:00', ...MESSAGE },
      'end',
    ],
  ])('422 VALIDATION_FAILED for %s', async (_name, dto, field) => {
    const { service, jobs, audit, calls } = setup();
    const err = await service.create(TEST_USERS.admin, dto, NOW).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect((err as { body: { details: { fields: object } } }).body.details.fields).toHaveProperty(field);
    expect(calls).toHaveLength(0);
    expect(jobs.notify).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
