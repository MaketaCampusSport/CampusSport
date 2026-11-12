import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Business rules (SRS 9.2), read on every request (SDD 2.1). */
@Entity({ name: 'settings' })
export class Setting {
  @PrimaryColumn({ type: 'text' })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
