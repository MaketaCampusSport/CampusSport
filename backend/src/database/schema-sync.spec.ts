import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** livrabil05 is the source of truth for the schema; the shipped copy must not drift. */
describe('schema SQL copy', () => {
  it('matches livrabil05/baza-de-date/schema-postgresql.sql', () => {
    const normalize = (s: string) => s.replace(/\r\n/g, '\n');
    const original = readFileSync(
      join(__dirname, '../../../livrabil05/baza-de-date/schema-postgresql.sql'),
      'utf8',
    );
    const copy = readFileSync(join(__dirname, 'sql/0001_initial_schema.sql'), 'utf8');
    expect(normalize(copy)).toBe(normalize(original));
  });
});
