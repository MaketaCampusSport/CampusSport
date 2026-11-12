import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { isTransientPgError } from '../../common/db/transient';
import { pgErrorCode, PG_EXCLUSION_VIOLATION } from '../../common/errors/all-exceptions.filter';
import { Page, pageOf, pageOffset } from '../../common/http/pagination';
import { addHours, monthOf, toIsoInZone, toIsoOrNull } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { BLOCK_LEVEL } from '../../database/enums';
import type { BlockKind, OccupancyKind, Role } from '../../database/enums';
import { AuditService } from '../audit/audit.service';
import { OccupancyEventsService } from '../events/occupancy-events.service';
import type { CancelledBooking } from '../jobs/queues';
import { QuotaService } from '../quota/quota.service';
import { SettingsService } from '../settings/settings.service';
import { BlockCreateDto, BlockResponse, BlockResultResponse, DeliveryStatusResponse, ListBlocksQueryDto } from './dto/block.dto';

interface BlockRow {
  id: string;
  resource_id: string;
  kind: BlockKind;
  start: Date;
  end: Date | null;
  reason: string | null;
  recurrence_id: string | null;
  created_by: string | null;
}

interface OverlapRow {
  id: string;
  kind: OccupancyKind;
  user_id: string | null;
  role: Role | null;
  start: Date;
  end: Date | null;
}

const BLOCK_SELECT = `SELECT id, resource_id, kind, lower(period) AS start, upper(period) AS "end", reason, recurrence_id, created_by
  FROM occupancy`;
const MAX_ATTEMPTS = 3;

/** SDD module "Blocări" (FR-22, FR-40 – FR-42, SDD 7.3). */
@Injectable()
export class BlocksService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly events: OccupancyEventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private get zone(): string {
    return this.config.facilityTimezone;
  }

  toResponse(row: BlockRow): BlockResponse {
    return {
      id: row.id,
      resource_id: row.resource_id,
      kind: row.kind,
      start: toIsoInZone(row.start, this.zone),
      end: toIsoOrNull(row.end, this.zone),
      reason: row.reason ?? '',
      recurrence_id: row.recurrence_id,
      created_by: row.created_by ?? '',
    };
  }

  async list(query: ListBlocksQueryDto): Promise<Page<BlockResponse>> {
    const where = [`kind <> 'booking'`, `status = 'active'`];
    const params: unknown[] = [];
    if (query.resource) where.push(`resource_id = $${params.push(query.resource)}`);
    if (query.kind) where.push(`kind = $${params.push(query.kind)}`);
    if (query.from || query.to) {
      where.push(`period && tstzrange($${params.push(query.from ?? null)}, $${params.push(query.to ?? null)}, '[)')`);
    }
    const { skip, take } = pageOffset(query);
    const sqlWhere = where.join(' AND ');
    const [rows, count]: [BlockRow[], { n: string }[]] = await Promise.all([
      this.dataSource.query(
        `${BLOCK_SELECT} WHERE ${sqlWhere} ORDER BY lower(period) DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, take, skip],
      ),
      this.dataSource.query(`SELECT count(*) AS n FROM occupancy WHERE ${sqlWhere}`, params),
    ]);
    return pageOf(
      query,
      rows.map((r) => this.toResponse(r)),
      Number(count[0].n),
    );
  }

  /**
   * SDD 7.3 in one transaction: lock overlapping rows, refuse a same/higher-level block (409), supersede
   * lower-level blocks (SRS 9.1), cancel overlapping bookings with a quota refund, insert the block.
   * Notifications with alternatives are sent by the worker after commit.
   */
  async create(actor: AuthUser, dto: BlockCreateDto, now = new Date()): Promise<BlockResultResponse> {
    if (dto.recurrence) {
      throw new AppException('NOT_IMPLEMENTED', {
        message_ro: 'Blocările recurente nu sunt încă disponibile.',
        message_en: 'Recurring blocks are not available yet.',
      });
    }
    const start = dto.start ? new Date(dto.start) : now;
    const end = dto.end ? new Date(dto.end) : null;
    if (end && end <= start) {
      throw new AppException('VALIDATION_FAILED', { details: { fields: { end: ['must be after start'] } } });
    }
    const resource: { id: string }[] = await this.dataSource.query(`SELECT id FROM resources WHERE id = $1`, [dto.resource_id]);
    if (!resource.length) throw new AppException('NOT_FOUND');

    for (let attempt = 1; ; attempt++) {
      try {
        const result = await this.dataSource.transaction((em) => this.createInTransaction(em, actor, dto, start, end));
        await this.events.bookingsCancelled(result.cancelled, { source: dto.kind, reason: dto.reason, blockId: result.block.id }, false);
        await this.events.slotsChanged([{ resourceId: dto.resource_id, start, end, status: 'blocked' }]);
        return {
          block: this.toResponse(result.block),
          cancelled_bookings_count: result.cancelled.length,
          superseded_blocks_count: result.superseded,
          notified_users_count: new Set(result.cancelled.map((b) => b.userId).filter(Boolean)).size,
        };
      } catch (err) {
        // A booking committed (or was being inserted) between our lock and the insert: run the algorithm again.
        const retryable = pgErrorCode(err) === PG_EXCLUSION_VIOLATION || isTransientPgError(err);
        if (!retryable || attempt >= MAX_ATTEMPTS) throw err;
      }
    }
  }

  private async createInTransaction(
    em: EntityManager,
    actor: AuthUser,
    dto: BlockCreateDto,
    start: Date,
    end: Date | null,
  ): Promise<{ block: BlockRow; cancelled: CancelledBooking[]; superseded: number }> {
    const overlapping: OverlapRow[] = await em.query(
      `SELECT o.id, o.kind, o.user_id, u.role, lower(o.period) AS start, upper(o.period) AS "end"
       FROM occupancy o LEFT JOIN users u ON u.id = o.user_id
       WHERE o.resource_id = $1 AND o.status = 'active' AND o.period && tstzrange($2, $3, '[)')
       FOR UPDATE OF o`,
      [dto.resource_id, start, end],
    );
    const level = BLOCK_LEVEL[dto.kind];
    const blocks = overlapping.filter((o) => o.kind !== 'booking');
    if (blocks.some((b) => BLOCK_LEVEL[b.kind as BlockKind] >= level)) throw new AppException('BLOCK_CONFLICT');
    const bookings = overlapping.filter((o) => o.kind === 'booking');

    if (blocks.length) {
      await em.query(`UPDATE occupancy SET status = 'cancelled', cancel_source = $2 WHERE id = ANY($1::uuid[])`, [
        blocks.map((b) => b.id),
        dto.kind,
      ]);
    }
    if (bookings.length) {
      await em.query(`UPDATE occupancy SET status = 'cancelled', cancel_source = $2, reason = $3 WHERE id = ANY($1::uuid[])`, [
        bookings.map((b) => b.id),
        dto.kind,
        dto.reason,
      ]);
      // FR-27: entries cancelled by the facility are always returned.
      for (const b of bookings) {
        if (b.role === 'student' && b.user_id) await this.quota.refund(b.user_id, monthOf(b.start, this.zone), em);
      }
    }

    const [block]: BlockRow[] = await em.query(
      `INSERT INTO occupancy (resource_id, period, kind, created_by, reason)
       VALUES ($1, tstzrange($2, $3, '[)'), $4, $5, $6)
       RETURNING id, resource_id, kind, lower(period) AS start, upper(period) AS "end", reason, recurrence_id, created_by`,
      [dto.resource_id, start, end, dto.kind, actor.id, dto.reason],
    );
    await this.audit.record(
      {
        actorId: actor.id,
        action: 'block.create',
        entity: 'occupancy',
        entityId: block.id,
        after: {
          resource_id: dto.resource_id,
          kind: dto.kind,
          start: start.toISOString(),
          end: end?.toISOString() ?? null,
          reason: dto.reason,
          cancelled_booking_ids: bookings.map((b) => b.id),
          superseded_block_ids: blocks.map((b) => b.id),
        },
      },
      em,
    );
    return {
      block,
      superseded: blocks.length,
      cancelled: bookings.map((b) => ({ id: b.id, userId: b.user_id, resourceId: dto.resource_id, start: b.start, end: b.end! })),
    };
  }

  /**
   * Ends the block (or removes it if it has not started) and offers the freed time to the waitlist.
   * Bookings it cancelled are not restored (spec).
   */
  async remove(actor: AuthUser, id: string, now = new Date()): Promise<void> {
    const { block, freedFrom } = await this.dataSource.transaction(async (em) => {
      const rows: BlockRow[] = await em.query(`${BLOCK_SELECT} WHERE id = $1 AND kind <> 'booking' AND status = 'active' FOR UPDATE`, [id]);
      const current = rows[0];
      if (!current) throw new AppException('NOT_FOUND');
      if (current.start > now) {
        await em.query(`UPDATE occupancy SET status = 'cancelled', cancel_source = 'admin' WHERE id = $1`, [id]);
      } else {
        await em.query(`UPDATE occupancy SET period = tstzrange(lower(period), $2, '[)') WHERE id = $1`, [id, now]);
      }
      await this.audit.record(
        {
          actorId: actor.id,
          action: 'block.delete',
          entity: 'occupancy',
          entityId: id,
          before: { start: current.start.toISOString(), end: current.end?.toISOString() ?? null, kind: current.kind },
        },
        em,
      );
      return { block: current, freedFrom: current.start > now ? current.start : now };
    });
    // An open-ended block frees everything up to the longest booking window.
    const rules = await this.settings.rules();
    const freedTo = block.end ?? addHours(now, rules.booking_window_days_teacher * 24);
    if (freedTo > freedFrom) await this.events.periodFreed(block.resource_id, freedFrom, freedTo);
  }

  /** "Anunțați / livrați" counter (FR-41, NFR-03), from the worker's `notifications` rows. */
  async delivery(id: string): Promise<DeliveryStatusResponse> {
    const exists: unknown[] = await this.dataSource.query(`SELECT 1 FROM occupancy WHERE id = $1 AND kind <> 'booking'`, [id]);
    if (!exists.length) throw new AppException('NOT_FOUND');
    const [totals]: { notified: string; delivered: string; failed: string }[] = await this.dataSource.query(
      `SELECT count(DISTINCT user_id) AS notified,
              count(DISTINCT user_id) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
              count(DISTINCT user_id) FILTER (WHERE error IS NOT NULL AND delivered_at IS NULL) AS failed
       FROM notifications WHERE block_id = $1`,
      [id],
    );
    const channels: { channel: 'push' | 'email' | 'sms'; n: string }[] = await this.dataSource.query(
      `SELECT channel, count(*) AS n FROM notifications WHERE block_id = $1 AND sent_at IS NOT NULL GROUP BY channel`,
      [id],
    );
    const by = { push: 0, email: 0, sms: 0 };
    for (const c of channels) by[c.channel] = Number(c.n);
    return {
      notified: Number(totals?.notified ?? 0),
      delivered: Number(totals?.delivered ?? 0),
      failed: Number(totals?.failed ?? 0),
      by_channel: by,
    };
  }
}
