import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { Page, pageOf, pageOffset } from '../../common/http/pagination';
import { dayBounds, monthOf } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { AuditService } from '../audit/audit.service';
import { OccupancyEventsService } from '../events/occupancy-events.service';
import { QuotaService } from '../quota/quota.service';
import { BOOKING_SELECT, BookingRow, toBookingResponse } from './booking.presenter';
import { BookingsService } from './bookings.service';
import { AdminBookingsQueryDto } from './dto/admin-booking.dto';
import { BookingResponse, CancellationResultResponse } from './dto/booking.dto';

/** Booking management by administrators (FR-27, FR-35, FR-43, FR-45). */
@Injectable()
export class AdminBookingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bookings: BookingsService,
    private readonly quota: QuotaService,
    private readonly audit: AuditService,
    private readonly events: OccupancyEventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private get zone(): string {
    return this.config.facilityTimezone;
  }

  /** All bookings, filtered by resource, start day and status; a day is listed in time order, otherwise newest first. */
  async list(query: AdminBookingsQueryDto): Promise<Page<BookingResponse>> {
    const where = [`o.kind = 'booking'`];
    const params: unknown[] = [];
    if (query.resource) where.push(`o.resource_id = $${params.push(query.resource)}`);
    if (query.date) {
      const { start, end } = dayBounds(query.date, this.zone);
      where.push(`lower(o.period) >= $${params.push(start)} AND lower(o.period) < $${params.push(end)}`);
    }
    if (query.status) where.push(`o.status = $${params.push(query.status)}`);
    const sqlWhere = `WHERE ${where.join(' AND ')}`;
    const order = query.date ? 'ASC' : 'DESC';
    const { skip, take } = pageOffset(query);
    const [rows, count]: [BookingRow[], { n: string }[]] = await Promise.all([
      this.dataSource.query(
        `${BOOKING_SELECT} ${sqlWhere} ORDER BY lower(o.period) ${order}, o.id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, take, skip],
      ),
      this.dataSource.query(`SELECT count(*) AS n FROM occupancy o ${sqlWhere}`, params),
    ]);
    return pageOf(
      query,
      rows.map((r) => toBookingResponse(r, this.zone)),
      Number(count[0].n),
    );
  }

  /**
   * Cancels an active booking at any time, even after it started. Unlike the holder's cancellation, the
   * entry is always returned (FR-27), the holder is notified with the reason (FR-35) and the action is
   * audited in the same transaction (FR-45).
   */
  async cancel(
    actor: AuthUser,
    id: string,
    reason: string,
    now = new Date(),
  ): Promise<CancellationResultResponse> {
    const { row, refunded } = await this.dataSource.transaction(async (em) => {
      const current = await this.bookings.loadRow(id, em, true);
      if (!current) throw new AppException('NOT_FOUND');
      if (current.status !== 'active') throw new AppException('BOOKING_NOT_ACTIVE');
      await em.query(
        `UPDATE occupancy SET status = 'cancelled', cancel_source = 'admin', reason = $2 WHERE id = $1`,
        [id, reason],
      );
      const wasRefunded =
        current.holder_role === 'student' && current.user_id
          ? await this.quota.refund(current.user_id, monthOf(current.start, this.zone), em)
          : false;
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'booking.cancel',
          entity: 'occupancy',
          entityId: id,
          before: { status: current.status },
          after: {
            status: 'cancelled',
            cancel_source: 'admin',
            reason,
            user_id: current.user_id,
            resource_id: current.resource_id,
            start: current.start.toISOString(),
            quota_refunded: wasRefunded,
          },
        },
        em,
      );
      return { row: current, refunded: wasRefunded };
    });
    // The rest of the slot goes to the waitlist only while it has not ended.
    await this.events.bookingsCancelled(
      [{ id: row.id, userId: row.user_id, resourceId: row.resource_id, start: row.start, end: row.end }],
      { source: 'admin', reason },
      row.end > now,
    );
    const updated = (await this.bookings.loadRow(id))!;
    return { booking: toBookingResponse(updated, this.zone), quota_refunded: refunded };
  }
}
