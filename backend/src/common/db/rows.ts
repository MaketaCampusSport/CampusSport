/**
 * TypeORM's PostgreSQL `query()` returns `[rows, rowCount]` for UPDATE and DELETE (also with RETURNING),
 * but plain `rows` for SELECT and INSERT. Wrap UPDATE/DELETE ... RETURNING calls with this to get the rows.
 */
export function rowsOf<T>(result: unknown): T[] {
  if (
    Array.isArray(result) &&
    result.length === 2 &&
    Array.isArray(result[0]) &&
    typeof result[1] === 'number'
  ) {
    return result[0] as T[];
  }
  return result as T[];
}
