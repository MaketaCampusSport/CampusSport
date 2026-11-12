import { pgErrorCode } from '../errors/all-exceptions.filter';

export const PG_DEADLOCK_DETECTED = '40P01';
export const PG_SERIALIZATION_FAILURE = '40001';

export function isTransientPgError(err: unknown): boolean {
  const code = pgErrorCode(err);
  return code === PG_DEADLOCK_DETECTED || code === PG_SERIALIZATION_FAILURE;
}

/**
 * Re-runs a transaction aborted by a deadlock or serialization failure. Concurrent inserts that collide on
 * an exclusion constraint (`no_overlap`) wait on each other's uncommitted rows, and PostgreSQL resolves that
 * as a deadlock; on retry the winner has committed and the loser gets a clean 23P01.
 */
export async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientPgError(err) || attempt >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 5 * attempt + Math.random() * 20));
    }
  }
}
