import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { QuotaCounters } from '../bookings/booking-rules';

/** Reads the per-student monthly counters (`monthly_quota`) and the active-bookings count (BR-01, BR-02). */
@Injectable()
export class QuotaService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  private runner(em?: EntityManager): EntityManager {
    return em ?? this.dataSource.manager;
  }

  /** `forUpdate` locks the row inside a booking transaction so concurrent bookings cannot both pass the check. */
  async counters(userId: string, month: string, em?: EntityManager, forUpdate = false): Promise<QuotaCounters> {
    const rows: { used: number; refunded: number }[] = await this.runner(em).query(
      `SELECT used, refunded FROM monthly_quota WHERE user_id = $1 AND month = $2${forUpdate ? ' FOR UPDATE' : ''}`,
      [userId, month],
    );
    return rows[0] ?? { used: 0, refunded: 0 };
  }

  async activeBookings(userId: string, now: Date, em?: EntityManager): Promise<number> {
    const rows: { n: string }[] = await this.runner(em).query(
      `SELECT count(*) AS n FROM occupancy
       WHERE user_id = $1 AND kind = 'booking' AND status = 'active' AND upper(period) > $2`,
      [userId, now],
    );
    return Number(rows[0]?.n ?? 0);
  }

  async consume(userId: string, month: string, em: EntityManager): Promise<void> {
    await em.query(
      `INSERT INTO monthly_quota (user_id, month, used) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, month) DO UPDATE SET used = monthly_quota.used + 1`,
      [userId, month],
    );
  }

  /** Returns the entry (FR-27); never refunds more than was used (monthly_quota_refunded_ck). */
  async refund(userId: string, month: string, em: EntityManager): Promise<boolean> {
    const rows: unknown[] = await em.query(
      `UPDATE monthly_quota SET refunded = refunded + 1
       WHERE user_id = $1 AND month = $2 AND refunded < used RETURNING 1`,
      [userId, month],
    );
    return rows.length > 0;
  }
}
