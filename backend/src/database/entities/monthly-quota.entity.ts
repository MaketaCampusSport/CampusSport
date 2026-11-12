import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'monthly_quota' })
export class MonthlyQuota {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** First day of the month, `YYYY-MM-01`. */
  @PrimaryColumn({ type: 'date' })
  month: string;

  @Column({ type: 'integer', default: 0 })
  used: number;

  @Column({ type: 'integer', default: 0 })
  refunded: number;
}
