import { loadConfig } from '../../config/configuration';
import { MemoryKvStore } from './kv-store';
import { RedisKvStore } from './redis-kv.store';
import { createKvStore } from './redis.module';

describe('createKvStore', () => {
  const dev = loadConfig({ NODE_ENV: 'development' });

  it('uses Redis when it answers PING', async () => {
    const store = await createKvStore({ ping: jest.fn().mockResolvedValue('PONG') }, dev);
    expect(store).toBeInstanceOf(RedisKvStore);
  });

  it('falls back to memory outside production when Redis is down', async () => {
    const store = await createKvStore({ ping: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) }, dev);
    expect(store).toBeInstanceOf(MemoryKvStore);
  });

  it('never falls back in production', async () => {
    const prod = loadConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      JWT_ACCESS_SECRET: 's',
      QR_HMAC_SECRET: 'q',
    });
    const ping = jest.fn();
    const store = await createKvStore({ ping }, prod);
    expect(store).toBeInstanceOf(RedisKvStore);
    expect(ping).not.toHaveBeenCalled();
  });
});
