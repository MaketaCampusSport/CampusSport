import { Controller, Get, Inject, Optional, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { Public } from '../../common/auth/decorators';
import { REDIS } from '../../common/kv/redis.module';

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  database: 'up' | 'down';
  redis: 'up' | 'down';
}

/**
 * Liveness/readiness: 200 while PostgreSQL answers (Redis down means queues and SSE fan-out are degraded,
 * bookings still work); 503 when the database is unreachable.
 */
@ApiExcludeController()
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(REDIS) private readonly redis?: Redis,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const database = await this.dataSource
      .query('SELECT 1')
      .then(() => 'up' as const)
      .catch(() => 'down' as const);
    const redis = this.redis?.status === 'ready' ? 'up' : 'down';
    const status = database === 'down' ? 'down' : redis === 'down' ? 'degraded' : 'ok';
    if (status === 'down') res.status(503);
    return { status, database, redis };
  }
}
