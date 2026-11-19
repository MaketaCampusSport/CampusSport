import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { KV_STORE, KvStore, MemoryKvStore } from './kv-store';
import { RedisKvStore } from './redis-kv.store';

export const REDIS = Symbol('REDIS');

const PING_TIMEOUT_MS = 1500;

/**
 * Redis in production. Outside production, when Redis does not answer at startup, short-lived state
 * (sessions, OTP codes, 2FA challenges) falls back to process memory so the API runs without Redis.
 * That state is lost on restart and is not shared between processes; the worker still needs Redis.
 */
export async function createKvStore(redis: Pick<Redis, 'ping'>, config: AppConfig): Promise<KvStore> {
  if (config.env === 'production') return new RedisKvStore(redis as Redis);
  let timer: NodeJS.Timeout | undefined;
  const reachable = await Promise.race([
    redis.ping().then(
      () => true,
      () => false,
    ),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
  if (reachable) return new RedisKvStore(redis as Redis);
  new Logger('Redis').warn(
    'Redis is not reachable: using an in-memory KvStore (development only). Sessions are lost on restart.',
  );
  return new MemoryKvStore();
}

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
    {
      provide: KV_STORE,
      inject: [REDIS, APP_CONFIG],
      useFactory: (redis: Redis, config: AppConfig) => createKvStore(redis, config),
    },
  ],
  exports: [REDIS, KV_STORE],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
