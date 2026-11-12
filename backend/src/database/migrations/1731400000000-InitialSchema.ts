import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Applies livrabil05/baza-de-date/schema-postgresql.sql verbatim (copied to ../sql so it ships in dist/).
 * A unit test keeps the copy identical to the livrabil05 original.
 */
export class InitialSchema1731400000000 implements MigrationInterface {
  name = 'InitialSchema1731400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const sql = readFileSync(join(__dirname, '..', 'sql', '0001_initial_schema.sql'), 'utf8');
    // No parameters -> pg uses the simple query protocol, which accepts many statements and $$ bodies.
    await queryRunner.query(sql);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS audit_log, settings, push_subscriptions, notifications, waitlist, monthly_quota,
        occupancy, recurrences, resource_sports, resources, sports, users CASCADE;
      DROP FUNCTION IF EXISTS create_monthly_partitions(date);
      DROP FUNCTION IF EXISTS audit_log_insert_only();
    `);
  }
}
