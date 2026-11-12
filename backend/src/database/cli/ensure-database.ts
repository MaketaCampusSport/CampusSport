import { Client } from 'pg';

/** Creates the target database if it does not exist (connects to the `postgres` maintenance DB). */
export async function ensureDatabase(databaseUrl: string): Promise<boolean> {
  const target = new URL(databaseUrl);
  const dbName = decodeURIComponent(target.pathname.replace(/^\//, ''));
  const probe = new Client({ connectionString: databaseUrl });
  try {
    await probe.connect();
    return false;
  } catch (err) {
    if ((err as { code?: string }).code !== '3D000') throw err;
  } finally {
    await probe.end().catch(() => undefined);
  }
  const admin = new URL(databaseUrl);
  admin.pathname = '/postgres';
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
    return true;
  } finally {
    await client.end();
  }
}
