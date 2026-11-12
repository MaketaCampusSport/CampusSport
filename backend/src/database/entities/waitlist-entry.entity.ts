import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { WaitlistStatus } from '../enums';
import type { TimeRange } from '../tstzrange';
import { tstzRangeTransformer } from '../tstzrange';

/** Either a slot entry (resource + period) or a day + sport subscription. */
@Entity({ name: 'waitlist' })
export class WaitlistEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string | null;

  @Column({ name: 'sport_id', type: 'uuid', nullable: true })
  sportId: string | null;

  @Column({ type: 'date' })
  day: string;

  @Column({ type: 'tstzrange', nullable: true, transformer: tstzRangeTransformer })
  period: TimeRange | null;

  @Column({ type: 'smallint' })
  priority: 1 | 2 | 3;

  @Column({ type: 'text', default: 'waiting' })
  status: WaitlistStatus;

  @Column({ name: 'offered_at', type: 'timestamptz', nullable: true })
  offeredAt: Date | null;

  @Column({ name: 'offer_expires_at', type: 'timestamptz', nullable: true })
  offerExpiresAt: Date | null;

  @Column({ name: 'offered_resource_id', type: 'uuid', nullable: true })
  offeredResourceId: string | null;

  @Column({ name: 'offered_period', type: 'tstzrange', nullable: true, transformer: tstzRangeTransformer })
  offeredPeriod: TimeRange | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
