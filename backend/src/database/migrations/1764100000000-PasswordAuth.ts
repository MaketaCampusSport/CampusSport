import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Email + password sign-in (replaces SSO and the external OTP flow, which are commented out).
 * Idempotent, because a fresh install already gets both changes from 0001_initial_schema.sql.
 */
export class PasswordAuth1764100000000 implements MigrationInterface {
  name = 'PasswordAuth1764100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text`);
    // Members registered with a password have no SSO subject.
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_sso_ck`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // users_sso_ck is not restored: rows created with a password would violate it.
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS password_hash`);
  }
}
