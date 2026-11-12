import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { KV_STORE } from './kv-store';
import { RedisKvStore } from './redis-kv.store';

export const REDIS = Symbol('REDIS');

/** Shared ioredis connection and the KvStore on top of it. */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const logger = new Logger('Redis');
        const client = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 });
        let warned = false;
        client.on('error', (err) => {
          if (!warned) logger.warn(`Redis unavailable at ${config.redisUrl}: ${err.message}`);
          warned = true;
        });
        client.on('ready', () => {
          warned = false;
          logger.log('Connected');
        });
        return client;
      },
    },
    { provide: KV_STORE, inject: [REDIS], useFactory: (redis: Redis) => new RedisKvStore(redis) },
  ],
  exports: [REDIS, KV_STORE],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
