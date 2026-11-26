import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

/** scrypt cost parameters: an OWASP-recommended set (N=2^15, r=8, p=3) that needs 32 MiB per hash. */
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  // 128 * N * r bytes are needed; leave headroom over Node's 32 MiB default.
  const options: ScryptOptions = { N: n, r, p, maxmem: 256 * n * r };
  return new Promise((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

/** Returns `scrypt$N$r$p$<salt base64>$<hash base64>`; the parameters travel with the hash. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time check against a stored hash. Malformed hashes never match. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every((v) => Number.isInteger(v) && v > 0) || n > 2 ** 20) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, salt, n, r, p);
  return timingSafeEqual(actual, expected);
}

/** A real hash of a random password, so unknown emails cost the same time as wrong passwords. */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
