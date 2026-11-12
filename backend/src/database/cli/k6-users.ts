import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JwtService } from '@nestjs/jwt';
import { DateTime } from 'luxon';
import { loadConfig } from '../../config/configuration';
import { loadEnvFile } from '../../config/load-env';
import { createDataSource } from '../data-source';
import { EXAMPLE_RESOURCES } from '../seeds/example-data';

/**
 * Prepares the k6 load tests: N teacher accounts (no quota) with access tokens, and a target slot.
 * Usage: npm run k6:prepare -- 100      Cleanup: npm run k6:cleanup
 * Never run against production: it creates accounts and signs tokens with the configured secret.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  if (config.env === 'production') throw new Error('Refusing to create load-test users in production');
  const ds = await createDataSource(config).initialize();
  try {
    await ds.query(
      `DELETE FROM occupancy WHERE user_id IN (SELECT id FROM users WHERE sso_subject LIKE 'k6:%')`,
    );
    await ds.query(`DELETE FROM users WHERE sso_subject LIKE 'k6:%'`);
    if (process.argv[2] === 'cleanup') {
      console.log('Removed k6 users and their bookings');
      return;
    }
    const count = Number(process.argv[2] ?? 100);
    const jwt = new JwtService({ secret: config.jwt.accessSecret });
    const tokens: string[] = [];
    for (let i = 0; i < count; i++) {
      const [row]: { id: string }[] = await ds.query(
        `INSERT INTO users (full_name, email, role, sso_subject) VALUES ($1, $2, 'teacher', $3) RETURNING id`,
        [`k6 user ${i}`, `k6-${i}@load.example.edu`, `k6:${i}`],
      );
      tokens.push(jwt.sign({ sub: row.id, role: 'teacher', typ: 'access' }, { expiresIn: '2h' }));
    }
    let day = DateTime.now().setZone(config.facilityTimezone).plus({ days: 2 }).startOf('day');
    while (day.weekday > 5) day = day.plus({ days: 1 });
    const target = {
      api: `http://localhost:${config.port}/api/v1`,
      resource_id: EXAMPLE_RESOURCES.basketballCourt.id,
      start: day.set({ hour: 12 }).toISO({ suppressMilliseconds: true }),
      date: day.toISODate(),
      tokens,
    };
    const dir = join(process.cwd(), 'k6');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'tokens.json'), JSON.stringify(target, null, 2));
    console.log(`Created ${count} users; target slot ${target.start}; wrote k6/tokens.json`);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
