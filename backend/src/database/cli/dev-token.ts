import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { loadConfig } from '../../config/configuration';
import { loadEnvFile } from '../../config/load-env';
import { createDataSource } from '../data-source';
import { EXAMPLE_USERS } from '../seeds/example-data';

type Caller = keyof typeof EXAMPLE_USERS;
const CALLERS = Object.keys(EXAMPLE_USERS) as Caller[];

/**
 * Development only: prints access tokens for the seeded example users, so the API can be tried from
 * Swagger or Postman without SSO/Redis. This is a terminal command, not an HTTP login route.
 *
 *   npm run dev:token -- student            one token
 *   npm run dev:token                       all four
 *   npm run dev:token -- --postman          writes postman/CampusSport-local.postman_environment.json
 */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  if (config.env === 'production') throw new Error('dev:token is disabled in production');

  const args = process.argv.slice(2);
  const wanted = args.filter((a) => !a.startsWith('--')) as Caller[];
  const unknown = wanted.filter((c) => !CALLERS.includes(c));
  if (unknown.length)
    throw new Error(`Unknown user ${unknown.join(', ')}; use one of: ${CALLERS.join(', ')}`);
  const callers = wanted.length ? wanted : CALLERS;

  const ds = await createDataSource(config).initialize();
  try {
    const rows: { id: string }[] = await ds.query(`SELECT id FROM users WHERE id = ANY($1::uuid[])`, [
      callers.map((c) => EXAMPLE_USERS[c].id),
    ]);
    const missing = callers.filter((c) => !rows.some((r) => r.id === EXAMPLE_USERS[c].id));
    if (missing.length) throw new Error(`Seeded users missing (${missing.join(', ')}); run npm run seed`);
  } finally {
    await ds.destroy();
  }

  const jwt = new JwtService({ secret: config.jwt.accessSecret });
  const ttl = '12h';
  const tokens = Object.fromEntries(
    callers.map((c) => {
      const u = EXAMPLE_USERS[c];
      return [c, jwt.sign({ sub: u.id, role: u.role, typ: 'access' }, { expiresIn: ttl })];
    }),
  ) as Record<Caller, string>;

  if (args.includes('--postman')) {
    const root = join(process.cwd(), '..', 'postman');
    const template = JSON.parse(readFileSync(join(root, 'CampusSport.postman_environment.json'), 'utf8'));
    template.name = 'CampusSport local (with tokens)';
    template.values = template.values.map((v: { key: string; value: string }) => {
      const caller = v.key.replace(/Token$/, '') as Caller;
      return v.key.endsWith('Token') && tokens[caller] ? { ...v, value: tokens[caller] } : v;
    });
    const target = join(root, 'CampusSport-local.postman_environment.json');
    writeFileSync(target, JSON.stringify(template, null, 2));
    console.log(`Wrote ${target} (tokens valid ${ttl}). Import it in Postman next to the collection.`);
    return;
  }
  for (const c of callers) console.log(`${c.padEnd(9)} ${tokens[c]}`);
  console.log(`\nValid ${ttl}. Use as: Authorization: Bearer <token>`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
