import { getDataSourceToken } from '@nestjs/typeorm';
import { REDIS } from '../../common/kv/redis.module';
import { createTestApp, TestApp } from '../../testing/test-app';
import { HttpMetricsInterceptor, MetricsController } from '../metrics/metrics.module';
import { HealthController } from './health.controller';
import { APP_INTERCEPTOR } from '@nestjs/core';
import '../metrics/metrics';

describe('HealthController and /metrics', () => {
  let t: TestApp;
  const dataSource = { query: jest.fn() };
  const redis = { status: 'ready' };

  beforeAll(async () => {
    t = await createTestApp({
      controllers: [HealthController, MetricsController],
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: REDIS, useValue: redis },
        { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
      ],
    });
  });
  afterAll(() => t.close());

  it('GET /health -> 200 ok when database and Redis are up (no prefix, no auth)', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    redis.status = 'ready';
    await t.http().get('/health').expect(200, { status: 'ok', database: 'up', redis: 'up' });
  });

  it('GET /health -> 200 degraded without Redis', async () => {
    dataSource.query.mockResolvedValue([]);
    redis.status = 'reconnecting';
    await t.http().get('/health').expect(200, { status: 'degraded', database: 'up', redis: 'down' });
  });

  it('GET /health -> 503 down without the database', async () => {
    dataSource.query.mockRejectedValue(new Error('ECONNREFUSED'));
    await t.http().get('/health').expect(503, { status: 'down', database: 'down', redis: 'down' });
  });

  it('GET /metrics exposes the HTTP histogram in Prometheus format', async () => {
    const res = await t.http().get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# TYPE campussport_http_request_duration_seconds histogram');
    expect(res.text).toContain('campussport_bookings_created_total');
    expect(res.text).not.toContain('route="/health"');
  });
});
