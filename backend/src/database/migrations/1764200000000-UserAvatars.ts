import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Profile photos (`user_avatars` + `users.avatar_updated_at`).
 * Idempotent, because a fresh install already gets both from 0001_initial_schema.sql.
 */
export class UserAvatars1764200000000 implements MigrationInterface {
  name = 'UserAvatars1764200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_avatars (
        user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        content_type text NOT NULL,
        data         bytea NOT NULL,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_avatars_type_ck CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
        CONSTRAINT user_avatars_size_ck CHECK (octet_length(data) <= 2097152)
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_avatars`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS avatar_updated_at`);
  }
}
