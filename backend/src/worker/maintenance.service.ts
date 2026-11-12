import { Inject, Injectable, Logger } from '@nestjs/common';
import { rowsOf } from '../common/db/rows';
import { InjectDataSource } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { DataSource } from 'typeorm';
import { addMinutes } from '../common/time';
import { APP_CONFIG } from '../config/configuration';
import type { AppConfig } from '../config/configuration';
import { AuditService } from '../modules/audit/audit.service';
import { SettingsService } from '../modules/settings/settings.service';
import { WaitlistService } from '../modules/waitlist/waitlist.service';

/** Periodic and delayed work of the worker (SDD 4.1): no-shows, completion, partitions, offer expiry. */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly waitlist: WaitlistService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * BR-06 / FR-16: a booking without check-in by start + `checkin_minutes_after` becomes a no-show;
   * at `no_show_threshold` no-shows in a month the account is suspended for `no_show_suspension_days`.
   * Returns true when the booking was marked.
   */
  async checkNoShow(bookingId: string, now = new Date()): Promise<boolean> {
    const rules = await this.settings.rules();
    return this.dataSource.transaction(async (em) => {
      const marked: { user_id: string | null; start: Date }[] = rowsOf(
        await em.query(
          `UPDATE occupancy SET status = 'no_show'
         WHERE id = $1 AND kind = 'booking' AND status = 'active' AND checked_in_at IS NULL
           AND lower(period) + make_interval(mins => $2) <= $3
         RETURNING user_id, lower(period) AS start`,
          [bookingId, rules.checkin_minutes_after, now],
        ),
      );
      const row = marked[0];
      if (!row?.user_id) return Boolean(row);

      const month = DateTime.fromJSDate(row.start, { zone: this.config.facilityTimezone }).startOf('month');
      const [{ n }]: { n: string }[] = await em.query(
        `SELECT count(*) AS n FROM occupancy
         WHERE user_id = $1 AND kind = 'booking' AND status = 'no_show' AND lower(period) >= $2 AND lower(period) < $3`,
        [row.user_id, month.toJSDate(), month.plus({ months: 1 }).toJSDate()],
      );
      if (Number(n) >= rules.no_show_threshold) {
        const until = DateTime.fromJSDate(now).plus({ days: rules.no_show_suspension_days }).toJSDate();
        const suspended: unknown[] = rowsOf(
          await em.query(
            `UPDATE users SET status = 'suspended', suspended_until = GREATEST(COALESCE(suspended_until, $2), $2)
           WHERE id = $1 AND role <> 'admin' RETURNING 1`,
            [row.user_id, until],
          ),
        );
        if (suspended.length) {
          await this.audit.record(
            {
              actorId: null,
              action: 'user.auto_suspend',
              entity: 'user',
              entityId: row.user_id,
              after: {
                status: 'suspended',
                suspended_until: until.toISOString(),
                no_shows_this_month: Number(n),
              },
            },
            em,
          );
          this.logger.log(`User ${row.user_id} suspended after ${n} no-shows`);
        }
      }
      return true;
    });
  }

  /** Safety net for missed delayed jobs (e.g. Redis was down when the booking was made). */
  async scanNoShows(now = new Date()): Promise<number> {
    const rules = await this.settings.rules();
    const due: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM occupancy WHERE kind = 'booking' AND status = 'active' AND checked_in_at IS NULL
         AND lower(period) <= $1 LIMIT 500`,
      [addMinutes(now, -rules.checkin_minutes_after)],
    );
    let marked = 0;
    for (const { id } of due) if (await this.checkNoShow(id, now)) marked++;
    return marked;
  }

  /** Checked-in bookings that ended become `completed`. */
  async completeBookings(now = new Date()): Promise<number> {
    const rows: unknown[] = rowsOf(
      await this.dataSource.query(
        `UPDATE occupancy SET status = 'completed'
       WHERE kind = 'booking' AND status = 'active' AND checked_in_at IS NOT NULL AND upper(period) <= $1
       RETURNING 1`,
        [now],
      ),
    );
    return rows.length;
  }

  /** Monthly partitions of notifications and audit_log, created ahead of time (schema: create_monthly_partitions). */
  async ensurePartitions(now = new Date()): Promise<void> {
    const month = DateTime.fromJSDate(now, { zone: this.config.facilityTimezone }).startOf('month');
    for (let i = 0; i <= 2; i++) {
      await this.dataSource.query(`SELECT create_monthly_partitions($1::date)`, [
        month.plus({ months: i }).toISODate(),
      ]);
    }
  }

  /** Offers whose delayed expiry job was lost. */
  async expireOffers(now = new Date()): Promise<number> {
    const due: { id: string }[] = await this.dataSource.query(
      `SELECT id FROM waitlist WHERE status = 'offered' AND offer_expires_at <= $1 LIMIT 200`,
      [now],
    );
    for (const { id } of due) await this.waitlist.expireOffer(id, now);
    return due.length;
  }
}
