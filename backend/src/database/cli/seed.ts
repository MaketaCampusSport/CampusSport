import 'reflect-metadata';
import { loadConfig } from '../../config/configuration';
import { loadEnvFile } from '../../config/load-env';
import { createDataSource } from '../data-source';
import { seedDevelopmentData } from '../seeds/seed';

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  if (config.env === 'production') throw new Error('Refusing to seed example data in production');
  const ds = await createDataSource(config).initialize();
  try {
    const counts = await seedDevelopmentData(ds);
    console.log('Seeded', counts);
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
