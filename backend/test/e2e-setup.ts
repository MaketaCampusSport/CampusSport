import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { getQueueToken } from '@nestjs/bullmq';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { KV_STORE, MemoryKvStore } from '../src/common/kv/kv-store';
import { REDIS } from '../src/common/kv/redis.module';
import { loadConfig } from '../src/config/configuration';
import { ensureDatabase } from '../src/database/cli/ensure-database';
import { createDataSource } from '../src/database/data-source';
import { seedDevelopmentData } from '../src/database/seeds/seed';
import { QUEUES } from '../src/modules/jobs/queues';

export interface RecordedJob {
  queue: string;
  name: string;
  data: Record<string, unknown>;
}

/**
 * Test database: TEST_DATABASE_URL, else `<DB_NAME>_test` next to the development database from .env,
 * else a Testcontainers PostgreSQL 18. The schema is dropped and recreated, so only `*_test` names are accepted.
 */
async function resolveDatabaseUrl(): Promise<{ url: string; stop?: () => Promise<void> }> {
  if (process.env.TEST_DATABASE_URL) return { url: process.env.TEST_DATABASE_URL };
  const envFile = join(__dirname, '..', '.env');
  if (existsSync(envFile)) {
    // parseEnv, not process.loadEnvFile: Jest sandboxes process.env.
    const fileEnv = parseEnv(readFileSync(envFile, 'utf8'));
    const devUrl = new URL(loadConfig({ ...fileEnv, NODE_ENV: 'development' }).databaseUrl);
    devUrl.pathname = `/${decodeURIComponent(devUrl.pathname.slice(1))}_test`;
    return { url: devUrl.toString() };
  }
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  const container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('campussport_test')
    .start();
  return { url: container.getConnectionUri(), stop: async () => void (await container.stop()) };
}

async function resetSchema(url: string): Promise<void> {
  const name = decodeURIComponent(new URL(url).pathname.slice(1));
  if (!name.endsWith('_test'))
    throw new Error(`Refusing to reset "${name}": e2e databases must end with _test`);
  await ensureDatabase(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();
  const ds = await createDataSource({ databaseUrl: url }).initialize();
  await ds.runMigrations({ transaction: 'each' });
  await seedDevelopmentData(ds);
  await ds.destroy();
}

/** A stand-in for ioredis: never "ready", so realtime falls back to in-process delivery. */
const fakeRedis = {
  status: 'end',
  on: () => fakeRedis,
  duplicate: () => fakeRedis,
  subscribe: async () => undefined,
  publish: async () => 0,
  quit: async () => 'OK',
};

export interface E2eContext {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  db: Client;
  jobs: RecordedJob[];
  bearer: (userId: string, role: string) => string;
  close: () => Promise<void>;
}

export async function createE2eApp(): Promise<E2eContext> {
  const { url, stop } = await resolveDatabaseUrl();
  await resetSchema(url);
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: url,
    JWT_ACCESS_SECRET: 'e2e-access-secret',
    QR_HMAC_SECRET: 'e2e-qr-secret',
    LOG_LEVEL: 'silent',
  });

  const jobs: RecordedJob[] = [];
  const fakeQueue = (queue: string) => ({
    name: queue,
    add: async (name: string, data: Record<string, unknown>) => {
      jobs.push({ queue, name, data });
      return { id: String(jobs.length) };
    },
    close: async () => undefined,
  });
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(REDIS)
    .useValue(fakeRedis)
    .overrideProvider(KV_STORE)
    .useValue(new MemoryKvStore());
  for (const queue of Object.values(QUEUES))
    builder = builder.overrideProvider(getQueueToken(queue)).useValue(fakeQueue(queue));
  const moduleRef = await builder.compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();
  const jwt = moduleRef.get(JwtService);
  const db = new Client({ connectionString: url });
  await db.connect();

  return {
    app,
    http: () => request(app.getHttpServer()),
    db,
    jobs,
    bearer: (userId, role) => `Bearer ${jwt.sign({ sub: userId, role, typ: 'access' })}`,
    close: async () => {
      await db.end();
      await app.close();
      await stop?.();
    },
  };
}
