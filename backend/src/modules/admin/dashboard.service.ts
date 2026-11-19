import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { dayBounds, dayOf } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { AvailabilityService } from '../availability/availability.service';
import { CatalogService } from '../catalog/catalog.service';
import { DashboardResponse } from './dto/dashboard.dto';

/** The admin's day view (FR-43): every active resource's grid plus the day's check-ins and no-shows. */
@Injectable()
export class DashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly availability: AvailabilityService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async dashboard(caller: AuthUser, date?: string, now = new Date()): Promise<DashboardResponse> {
    const zone = this.config.facilityTimezone;
    const day = date ?? dayOf(now, zone);
    const { start, end } = dayBounds(day, zone);
    const resources = await this.catalog.findResources({});
    const [grid, counts]: [DashboardResponse['resources'], { check_ins: string; no_shows: string }[]] =
      await Promise.all([
        this.availability.gridFor(resources, day, caller, now),
        // Bookings are counted on the day they start.
        this.dataSource.query(
          `SELECT count(*) FILTER (WHERE checked_in_at IS NOT NULL) AS check_ins,
                  count(*) FILTER (WHERE status = 'no_show') AS no_shows
           FROM occupancy
           WHERE kind = 'booking' AND lower(period) >= $1 AND lower(period) < $2`,
          [start, end],
        ),
      ]);
    return {
      date: day,
      resources: grid,
      check_ins_count: Number(counts[0]?.check_ins ?? 0),
      no_shows_count: Number(counts[0]?.no_shows ?? 0),
    };
  }
}
