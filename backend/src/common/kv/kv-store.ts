/**
 * Short-lived state kept in Redis (livrabil05/baza-de-date/README.md: OTP codes, refresh tokens and
 * import previews have no tables). Abstracted so services are unit-testable without Redis.
 */
export interface KvStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Atomically reads and removes a key (one-time challenges, refresh-token rotation). */
  take<T>(key: string): Promise<T | null>;
  del(...keys: string[]): Promise<void>;
  /** Increments a counter, setting the TTL when it is created; returns the new value. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  /** Set membership, used to find all refresh sessions of a user. */
  sadd(key: string, member: string, ttlSeconds: number): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
}

export const KV_STORE = Symbol('KV_STORE');

/** In-memory implementation for tests and for running without Redis. */
export class MemoryKvStore implements KvStore {
  private readonly data = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  private live(key: string): { value: unknown; expiresAt: number } | undefined {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.live(key);
    return entry ? (structuredClone(entry.value) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.data.set(key, { value: structuredClone(value), expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async take<T>(key: string): Promise<T | null> {
    const value = await this.get<T>(key);
    this.data.delete(key);
    return value;
  }

  async del(...keys: string[]): Promise<void> {
    keys.forEach((k) => this.data.delete(k));
  }

  async incr(key: string, ttlSeconds: number): Promise<number> {
    const entry = this.live(key);
    const next = ((entry?.value as number) ?? 0) + 1;
    this.data.set(key, { value: next, expiresAt: entry?.expiresAt ?? this.now() + ttlSeconds * 1000 });
    return next;
  }

  async sadd(key: string, member: string, ttlSeconds: number): Promise<void> {
    const set = new Set<string>(((this.live(key)?.value as string[]) ?? []).concat(member));
    this.data.set(key, { value: [...set], expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async smembers(key: string): Promise<string[]> {
    return ((this.live(key)?.value as string[]) ?? []).slice();
  }

  async srem(key: string, member: string): Promise<void> {
    const entry = this.live(key);
    if (entry) entry.value = (entry.value as string[]).filter((m) => m !== member);
  }
}
