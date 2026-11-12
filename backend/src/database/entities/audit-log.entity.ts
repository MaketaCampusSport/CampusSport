import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Insert-only (trigger audit_log_insert_only), partitioned monthly by `at`. */
@Entity({ name: 'audit_log' })
export class AuditLog {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @PrimaryColumn({ type: 'timestamptz', default: () => 'now()' })
  at: Date;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text' })
  entity: string;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  before: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  after: Record<string, unknown> | null;
}
