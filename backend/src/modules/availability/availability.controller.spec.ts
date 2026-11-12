import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { AppException } from '../../common/errors/app.exception';
import { EXAMPLE_RESOURCES, EXAMPLE_SPORTS } from '../../database/seeds/example-data';
import { createTestApp, TEST_USERS, TestApp } from '../../testing/test-app';
import { RealtimeService } from '../realtime/realtime.service';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

const COURT = EXAMPLE_RESOURCES.basketballCourt;
/** `Availability` example: one resource, the spec slot 18:00–19:00. */
const AVAILABILITY = {
  date: '2026-11-12',
  resources: [
    {
      resource_id: COURT.id,
      resource_name: 'Teren baschet 2',
      slots: [
        {
          start: '2026-11-12T18:00:00+02:00',
          end: '2026-11-12T19:00:00+02:00',
          status: 'free',
          bookable: true,
        },
      ],
    },
  ],
};

function readSse(port: number, path: string, onData: (chunk: string, req: http.ClientRequest) => void) {
  return new Promise<number>((resolve, reject) => {
    const req = http.get({ port, path }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => onData(chunk, req));
      res.on('end', () => resolve(res.statusCode ?? 0));
      res.on('error', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', (err) =>
      (err as NodeJS.ErrnoException).code === 'ECONNRESET' ? resolve(200) : reject(err),
    );
  });
}

describe('AvailabilityController', () => {
  let t: TestApp;
  let port: number;
  const availability = { getAvailability: jest.fn(), assertResource: jest.fn() };
  const realtime = new RealtimeService();

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [AvailabilityController],
      providers: [
        { provide: AvailabilityService, useValue: availability },
        { provide: RealtimeService, useValue: realtime },
      ],
    });
    await t.app.listen(0);
    port = (t.app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(() => t.close());
  beforeEach(() => jest.clearAllMocks());

  describe('GET /availability', () => {
    it('200 by resource, anonymously', async () => {
      availability.getAvailability.mockResolvedValue(AVAILABILITY);
      const res = await t.http().get(`/api/v1/availability?resource=${COURT.id}&date=2026-11-12`).expect(200);
      expect(res.body).toEqual(AVAILABILITY);
      expect(availability.getAvailability).toHaveBeenCalledWith(
        { resource: COURT.id, date: '2026-11-12' },
        undefined,
      );
    });

    it('200 by sport, with the caller passed for role-specific fields', async () => {
      availability.getAvailability.mockResolvedValue(AVAILABILITY);
      await t
        .http()
        .get(`/api/v1/availability?sport=${EXAMPLE_SPORTS.basketball.id}&date=2026-11-12`)
        .set('Authorization', await t.bearer('student'))
        .expect(200);
      expect(availability.getAvailability).toHaveBeenCalledWith(
        { sport: EXAMPLE_SPORTS.basketball.id, date: '2026-11-12' },
        TEST_USERS.student,
      );
    });

    it('400 without resource and sport', async () => {
      availability.getAvailability.mockRejectedValue(new AppException('BAD_REQUEST'));
      const res = await t.http().get('/api/v1/availability?date=2026-11-12').expect(400);
      expect(res.body.code).toBe('BAD_REQUEST');
    });

    it('422 when date is missing or not a date', async () => {
      await t.http().get(`/api/v1/availability?resource=${COURT.id}`).expect(422);
      await t.http().get(`/api/v1/availability?resource=${COURT.id}&date=12.11.2026`).expect(422);
      await t.http().get(`/api/v1/availability?resource=${COURT.id}&date=2026-11-12T10:00:00Z`).expect(422);
    });

    it('404 for an unknown resource', async () => {
      availability.getAvailability.mockRejectedValue(new AppException('NOT_FOUND'));
      await t.http().get(`/api/v1/availability?resource=${COURT.id}&date=2026-11-12`).expect(404);
    });
  });

  describe('GET /stream/availability (SSE)', () => {
    it('streams slot-changed events for the resource and day only', async () => {
      availability.assertResource.mockResolvedValue(undefined);
      const event = {
        resource_id: COURT.id,
        start: '2026-11-12T18:00:00+02:00',
        end: '2026-11-12T19:00:00+02:00',
        status: 'occupied' as const,
      };
      let received = '';
      const status = await readSse(
        port,
        `/api/v1/stream/availability?resource=${COURT.id}&date=2026-11-12`,
        (chunk, req) => {
          received += chunk;
          if (chunk.startsWith(': connected')) {
            void realtime.publish({ ...event, resource_id: EXAMPLE_RESOURCES.tennisCourt.id }); // other resource
            void realtime.publish({ ...event, start: '2026-11-13T18:00:00+02:00' }); // other day
            void realtime.publish(event);
          }
          if (received.includes('event: slot-changed')) req.destroy();
        },
      );
      expect(status).toBe(200);
      expect(received).toContain(`event: slot-changed\ndata: ${JSON.stringify(event)}\n\n`);
      expect(received.match(/event: slot-changed/g)).toHaveLength(1);
    });

    it('404 for an unknown resource', async () => {
      availability.assertResource.mockRejectedValue(new AppException('NOT_FOUND'));
      await t.http().get(`/api/v1/stream/availability?resource=${COURT.id}&date=2026-11-12`).expect(404);
    });

    it('422 without date', async () => {
      await t.http().get(`/api/v1/stream/availability?resource=${COURT.id}`).expect(422);
    });
  });
});
