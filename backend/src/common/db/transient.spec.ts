import { QueryFailedError } from 'typeorm';
import { isTransientPgError, withTransientRetry } from './transient';

const pgError = (code: string) =>
  new QueryFailedError('INSERT', [], Object.assign(new Error(code), { code }));

describe('withTransientRetry', () => {
  it('retries deadlocks and serialization failures, then succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(pgError('40P01'))
      .mockRejectedValueOnce(pgError('40001'))
      .mockResolvedValue('ok');
    await expect(withTransientRetry(fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors and gives up after the limit', async () => {
    const other = jest.fn().mockRejectedValue(pgError('23P01'));
    await expect(withTransientRetry(other)).rejects.toBeInstanceOf(QueryFailedError);
    expect(other).toHaveBeenCalledTimes(1);
    const always = jest.fn().mockRejectedValue(pgError('40P01'));
    await expect(withTransientRetry(always, 2)).rejects.toBeInstanceOf(QueryFailedError);
    expect(always).toHaveBeenCalledTimes(2);
  });

  it('classifies codes', () => {
    expect(isTransientPgError(pgError('40P01'))).toBe(true);
    expect(isTransientPgError(pgError('23505'))).toBe(false);
    expect(isTransientPgError(new Error('x'))).toBe(false);
  });
});
