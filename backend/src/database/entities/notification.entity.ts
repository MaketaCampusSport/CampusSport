import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { NotificationChannel } from '../enums';

/** Partitioned monthly by created_at, so the primary key is (id, created_at). */
@Entity({ name: 'notifications' })
export class Notification {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @PrimaryColumn({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'occupancy_id', type: 'uuid', nullable: true })
  occupancyId: string | null;

  @Column({ name: 'block_id', type: 'uuid', nullable: true })
  blockId: string | null;

  @Column({ type: 'text' })
  type: string;

  @Column({ type: 'text' })
  channel: NotificationChannel;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;
}
