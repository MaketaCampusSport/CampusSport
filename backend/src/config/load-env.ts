import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Loads backend/.env into process.env (Node 24 built-in); real env vars win. */
export function loadEnvFile(path = resolve(process.cwd(), '.env')): void {
  if (process.env.NODE_ENV === 'test' || !existsSync(path)) return;
  process.loadEnvFile(path);
}
