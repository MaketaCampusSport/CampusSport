import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { dayBounds } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { Resource } from '../../database/entities';
import type { QuotaCounters } from '../bookings/booking-rules';
import { CatalogService } from '../catalog/catalog.service';
import { QuotaService } from '../quota/quota.service';
import { SettingsService } from '../settings/settings.service';
import { buildGrid, GridOccupancy, ResourceAvailabilityView } from './grid';

export interface AvailabilityView {
  date: string;
  resources: ResourceAvailabilityView[];
}

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** `resource` (SDD route) or `sport` (all compatible resources, FR-11); neither is a 400. */
  async getAvailability(
    query: { resource?: string; sport?: string; date: string },
    caller?: AuthUser,
    now = new Date(),
  ): Promise<AvailabilityView> {
    const resources = await this.resolveResources(query, caller);
    const zone = this.config.facilityTimezone;
    const { start, end } = dayBounds(query.date, zone);
    const [occupancies, rules] = await Promise.all([this.loadOccupancies(resources, start, end), this.settings.rules()]);

    let quota: QuotaCounters = { used: 0, refunded: 0 };
    let activeBookings = 0;
    if (caller) {
      [quota, activeBookings] = await Promise.all([
        caller.role === 'student' ? this.quota.counters(caller.id, `${query.date.slice(0, 7)}-01`) : quota,
        this.quota.activeBookings(caller.id, now),
      ]);
    }

    return {
      date: query.date,
      resources: buildGrid({ resources, occupancies, date: query.date, zone, now, rules, caller, quota, activeBookings }),
    };
  }

  private async resolveResources(query: { resource?: string; sport?: string }, caller?: AuthUser): Promise<Resource[]> {
    if (query.resource) return [await this.catalog.getResource(query.resource, caller)];
    if (query.sport) {
      await this.catalog.getSport(query.sport);
      return this.catalog.findResources({ sportId: query.sport });
    }
    throw new AppException('BAD_REQUEST', {
      message_ro: 'Alege o resursă sau un sport.',
      message_en: 'Choose a resource or a sport.',
    });
  }

  private async loadOccupancies(resources: Resource[], start: Date, end: Date): Promise<GridOccupancy[]> {
    if (!resources.length) return [];
    const rows: {
      id: string;
      resource_id: string;
      start: Date;
      end: Date | null;
      kind: GridOccupancy['kind'];
      user_id: string | null;
      full_name: string | null;
      role: GridOccupancy['holderRole'];
    }[] = await this.dataSource.query(
      `SELECT o.id, o.resource_id, lower(o.period) AS start, upper(o.period) AS "end", o.kind, o.user_id,
              u.full_name, u.role
       FROM occupancy o LEFT JOIN users u ON u.id = o.user_id
       WHERE o.resource_id = ANY($1::uuid[]) AND o.status = 'active' AND o.period && tstzrange($2, $3)
       ORDER BY lower(o.period)`,
      [resources.map((r) => r.id), start, end],
    );
    return rows.map((r) => ({
      id: r.id,
      resourceId: r.resource_id,
      start: r.start,
      end: r.end,
      kind: r.kind,
      userId: r.user_id,
      holderName: r.full_name,
      holderRole: r.role,
    }));
  }

  /** For SSE: the resource must exist (404 otherwise). */
  async assertResource(id: string, caller?: AuthUser): Promise<void> {
    await this.catalog.getResource(id, caller);
  }
}
