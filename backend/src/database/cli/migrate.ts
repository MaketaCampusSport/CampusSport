import 'reflect-metadata';
import { loadConfig } from '../../config/configuration';
import { loadEnvFile } from '../../config/load-env';
import { createDataSource } from '../data-source';
import { ensureDatabase } from './ensure-database';

/** Usage: node dist/database/cli/migrate.js [up|down] */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const direction = process.argv[2] ?? 'up';
  if (direction === 'up' && (await ensureDatabase(config.databaseUrl))) {
    console.log('Created database', new URL(config.databaseUrl).pathname.slice(1));
  }
  const ds = await createDataSource(config).initialize();
  try {
    if (direction === 'down') {
      await ds.undoLastMigration({ transaction: 'each' });
      console.log('Reverted last migration');
    } else {
      const done = await ds.runMigrations({ transaction: 'each' });
      console.log(done.length ? `Applied: ${done.map((m) => m.name).join(', ')}` : 'Schema is up to date');
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
