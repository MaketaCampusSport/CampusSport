import { EXAMPLE_BOOKING, EXAMPLE_USERS } from '../../database/seeds/example-data';
import { TEST_CONFIG } from '../../testing/test-app';
import { redisConnection } from '../jobs/queues';
import { OccupancyEventsService } from './occupancy-events.service';

const booking = {
  id: EXAMPLE_BOOKING.id,
  userId: EXAMPLE_USERS.student.id,
  resourceId: EXAMPLE_BOOKING.resource_id,
  start: new Date(EXAMPLE_BOOKING.start),
  end: new Date(EXAMPLE_BOOKING.end),
};

describe('OccupancyEventsService', () => {
  const realtime = { publish: jest.fn() };
  const jobs = { notify: jest.fn(), slotFreed: jest.fn(), noShowCheck: jest.fn() };
  const events = new OccupancyEventsService(realtime as never, jobs as never, TEST_CONFIG);
  const realNow = Date.now;
  afterEach(() => {
    Date.now = realNow;
    jest.clearAllMocks();
  });

  it('bookingCreated: SSE occupied, confirmation, reminders 24 h and 1 h before, no-show check', async () => {
    Date.now = () => new Date('2026-11-11T10:00:00+02:00').getTime();
    const closes = new Date('2026-11-12T18:15:00+02:00');
    await events.bookingCreated(booking, closes);
    expect(realtime.publish).toHaveBeenCalledWith({
      resource_id: booking.resourceId,
      start: '2026-11-12T18:00:00+02:00',
      end: '2026-11-12T19:00:00+02:00',
      status: 'occupied',
    });
    expect(jobs.notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'booking-confirmed', occupancyId: booking.id }));
    const reminders = jobs.notify.mock.calls.filter(([job]) => job.type === 'booking-reminder');
    expect(reminders.map(([job, opts]) => [job.data.hours_before, opts.jobId])).toEqual([
      [24, `reminder_${booking.id}_24`],
      [1, `reminder_${booking.id}_1`],
    ]);
    expect(jobs.noShowCheck).toHaveBeenCalledWith({ bookingId: booking.id }, closes);
  });

  it('skips reminders whose time has passed', async () => {
    Date.now = () => new Date('2026-11-12T17:30:00+02:00').getTime();
    await events.bookingCreated(booking, new Date());
    expect(jobs.notify.mock.calls.filter(([job]) => job.type === 'booking-reminder')).toHaveLength(0);
  });

  it('user cancellation frees the slot for the waitlist, without notifying the holder', async () => {
    await events.bookingsCancelled([booking], { source: 'user' }, true);
    expect(realtime.publish).toHaveBeenCalledWith(expect.objectContaining({ status: 'free' }));
    expect(jobs.slotFreed).toHaveBeenCalledWith({
      resourceId: booking.resourceId,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
    });
    expect(jobs.notify).not.toHaveBeenCalled();
  });

  it('cancellation by a block notifies holders (critical) and does not free the slot', async () => {
    await events.bookingsCancelled([booking], { source: 'emergency', reason: 'Avarie', blockId: 'b1' }, false);
    expect(jobs.slotFreed).not.toHaveBeenCalled();
    expect(jobs.notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'booking-cancelled', critical: true, blockId: 'b1', data: { cancel_source: 'emergency', reason: 'Avarie' } }),
    );
  });

  it('does nothing for an empty list', async () => {
    await events.bookingsCancelled([], { source: 'admin' }, true);
    expect(realtime.publish).not.toHaveBeenCalled();
  });
});

describe('redisConnection', () => {
  it('parses REDIS_URL for BullMQ', () => {
    expect(redisConnection('redis://localhost:6379')).toEqual({ host: 'localhost', port: 6379 });
    expect(redisConnection('rediss://:s%40cret@cache.example:6380/2')).toEqual({
      host: 'cache.example',
      port: 6380,
      password: 's@cret',
      db: 2,
      tls: {},
    });
  });
});
