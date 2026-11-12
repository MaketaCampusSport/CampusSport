import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { CancelSource, OccupancyKind, OccupancyStatus } from '../enums';
import type { TimeRange } from '../tstzrange';
import { tstzRangeTransformer } from '../tstzrange';
import { Resource } from './resource.entity';
import { User } from './user.entity';

/**
 * Bookings and blocks share this table so the `no_overlap` exclusion constraint
 * (resource_id WITH =, period WITH &&) WHERE status = 'active' guards both (FR-12).
 */
@Entity({ name: 'occupancy' })
export class Occupancy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'resource_id', type: 'uuid' })
  resourceId: string;

  @ManyToOne(() => Resource)
  @JoinColumn({ name: 'resource_id' })
  resource?: Resource;

  @Column({ type: 'tstzrange', transformer: tstzRangeTransformer })
  period: TimeRange;

  @Column({ type: 'text' })
  kind: OccupancyKind;

  @Column({ type: 'text', default: 'active' })
  status: OccupancyStatus;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user?: User | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'recurrence_id', type: 'uuid', nullable: true })
  recurrenceId: string | null;

  @Column({ name: 'cancel_source', type: 'text', nullable: true })
  cancelSource: CancelSource | null;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  @Column({ name: 'qr_nonce', type: 'uuid', nullable: true })
  qrNonce: string | null;

  @Column({ name: 'participants_count', type: 'integer', nullable: true })
  participantsCount: number | null;

  @Column({ name: 'sport_id', type: 'uuid', nullable: true })
  sportId: string | null;

  @Column({ name: 'anonymized_at', type: 'timestamptz', nullable: true })
  anonymizedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
