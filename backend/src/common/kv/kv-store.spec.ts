import { MemoryKvStore } from './kv-store';

describe('MemoryKvStore', () => {
  let now = 1_000_000;
  const kv = new MemoryKvStore(() => now);

  it('stores copies of values and expires them', async () => {
    const value = { user_id: 'u1' };
    await kv.set('a', value, 10);
    value.user_id = 'changed';
    expect(await kv.get('a')).toEqual({ user_id: 'u1' });
    now += 11_000;
    expect(await kv.get('a')).toBeNull();
  });

  it('take() reads once', async () => {
    await kv.set('once', 1, 60);
    expect(await kv.take('once')).toBe(1);
    expect(await kv.take('once')).toBeNull();
  });

  it('incr() counts within the TTL window', async () => {
    expect(await kv.incr('c', 60)).toBe(1);
    expect(await kv.incr('c', 60)).toBe(2);
    now += 61_000;
    expect(await kv.incr('c', 60)).toBe(1);
  });

  it('keeps set members', async () => {
    await kv.sadd('s', 'x', 60);
    await kv.sadd('s', 'y', 60);
    await kv.sadd('s', 'x', 60);
    expect((await kv.smembers('s')).sort()).toEqual(['x', 'y']);
    await kv.srem('s', 'x');
    expect(await kv.smembers('s')).toEqual(['y']);
    await kv.del('s');
    expect(await kv.smembers('s')).toEqual([]);
  });
});
