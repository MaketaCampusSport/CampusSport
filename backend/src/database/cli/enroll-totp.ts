import 'reflect-metadata';
import { generateSecret, generateURI } from 'otplib';
import { loadConfig } from '../../config/configuration';
import { loadEnvFile } from '../../config/load-env';
import { createDataSource } from '../data-source';

/**
 * Enrols an administrator for TOTP (NFR-08) and prints the otpauth:// URI to add to an authenticator app.
 * Usage: npm run admin:enroll-totp -- admin@example.edu
 */
async function main(): Promise<void> {
  loadEnvFile();
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run admin:enroll-totp -- <admin email>');
  const config = loadConfig();
  const ds = await createDataSource(config).initialize();
  try {
    const secret = generateSecret();
    const rows: { id: string }[] = await ds.query(
      `UPDATE users SET totp_secret = $1 WHERE email = $2 AND role = 'admin' RETURNING id`,
      [secret, email],
    );
    if (!rows.length) throw new Error(`No administrator with email ${email}`);
    console.log(generateURI({ issuer: config.totpIssuer, label: email, secret }));
  } finally {
    await ds.destroy();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
