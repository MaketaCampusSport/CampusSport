import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { Interval } from '../availability/slots';
import { CatalogService } from '../catalog/catalog.service';
import { SettingsService } from '../settings/settings.service';
import { MonthlyReportResponse } from './dto/report.dto';
import { monthBounds, occupancyRate } from './monthly-report';

/** Monthly reports (FR-44). `occupancyRate` in monthly-report.ts defines the occupancy rate. */
@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * `month` is `YYYY-MM` (validated by the DTO). Rows are for the active resources; counts are for the
   * bookings that start in the month.
   */
  async monthlyReport(month: string): Promise<MonthlyReportResponse> {
    const zone = this.config.facilityTimezone;
    const { start, end } = monthBounds(month, zone);
    const [resources, bookings, totals, rules] = await Promise.all([
      this.catalog.findResources({}),
      this.dataSource.query(
        `SELECT resource_id, lower(period) AS start, upper(period) AS "end" FROM occupancy
         WHERE kind = 'booking' AND status <> 'cancelled' AND period && tstzrange($1, $2)`,
        [start, end],
      ) as Promise<{ resource_id: string; start: Date; end: Date }[]>,
      // Cancelled bookings are not counted by category; anonymized ones (no holder) have no category.
      this.dataSource.query(
        `SELECT count(*) FILTER (WHERE o.status = 'no_show') AS no_shows,
                count(*) FILTER (WHERE o.status <> 'cancelled' AND u.role <> 'external') AS members,
                count(*) FILTER (WHERE o.status <> 'cancelled' AND u.role = 'external') AS externals
         FROM occupancy o LEFT JOIN users u ON u.id = o.user_id
         WHERE o.kind = 'booking' AND lower(o.period) >= $1 AND lower(o.period) < $2`,
        [start, end],
      ) as Promise<{ no_shows: string; members: string; externals: string }[]>,
      this.settings.rules(),
    ]);
    // Students whose consumed entries (used - refunded) reached the monthly quota currently configured (BR-01).
    const [limit]: { n: string }[] = await this.dataSource.query(
      `SELECT count(*) AS n FROM monthly_quota WHERE month = $1 AND used - refunded >= $2`,
      [`${month}-01`, rules.monthly_quota],
    );

    const byResource = new Map<string, Interval[]>();
    for (const b of bookings) {
      const list = byResource.get(b.resource_id) ?? [];
      list.push({ start: b.start, end: b.end });
      byResource.set(b.resource_id, list);
    }
    return {
      month,
      occupancy: resources.map((r) => occupancyRate(r, byResource.get(r.id) ?? [], month, zone)),
      no_shows_count: Number(totals[0]?.no_shows ?? 0),
      bookings_by_category: {
        members: Number(totals[0]?.members ?? 0),
        externals: Number(totals[0]?.externals ?? 0),
      },
      users_reaching_limit_count: Number(limit?.n ?? 0),
    };
  }
}
