import 'reflect-metadata';
import { loadConfig } from '../../config/configuration';
import { loadEnvFile } from '../../config/load-env';
import { createDataSource } from '../data-source';
import { seedDevelopmentData } from '../seeds/seed';

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  // Production refuses by default; a demo/staging deployment can opt in explicitly (docker-compose `seed` service).
  if (config.env === 'production' && process.env.SEED_ALLOW_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to seed example data in production (set SEED_ALLOW_PRODUCTION=true to override)',
    );
  }
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
