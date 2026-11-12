import type Redis from 'ioredis';
import type { KvStore } from './kv-store';

/** Redis implementation; values are JSON, keys are namespaced with `cs:`. */
export class RedisKvStore implements KvStore {
  constructor(private readonly redis: Redis) {}

  private k(key: string): string {
    return `cs:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.k(key));
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.k(key), JSON.stringify(value), 'EX', ttlSeconds);
  }

  async take<T>(key: string): Promise<T | null> {
    const raw = await this.redis.getdel(this.k(key));
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys.map((k) => this.k(k)));
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const [[, value]] = (await this.redis
      .multi()
      .incr(this.k(key))
      .expire(this.k(key), ttlSeconds, 'NX')
      .exec()) as [[Error | null, number], [Error | null, number]];
    return value;
  }

  async sadd(key: string, member: string, ttlSeconds: number): Promise<void> {
    await this.redis.multi().sadd(this.k(key), member).expire(this.k(key), ttlSeconds).exec();
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(this.k(key));
  }

  async srem(key: string, member: string): Promise<void> {
    await this.redis.srem(this.k(key), member);
  }
}
