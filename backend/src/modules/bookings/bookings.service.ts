import { Inject, Injectable } from '@nestjs/common';
import { rowsOf } from '../../common/db/rows';
import { InjectDataSource } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import type { ErrorCode } from '../../common/errors/error-codes';
import { isTransientPgError, withTransientRetry } from '../../common/db/transient';
import { pgErrorCode, PG_EXCLUSION_VIOLATION } from '../../common/errors/all-exceptions.filter';
import { Page, pageOf, pageOffset } from '../../common/http/pagination';
import { addHours, addMinutes, dayOf, monthOf, toIsoInZone } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { Resource } from '../../database/entities';
import { findSlot, Interval } from '../availability/slots';
import { OccupancyEventsService } from '../events/occupancy-events.service';
import { bookingConflicts, bookingsCreated } from '../metrics/metrics';
import type { CancelledBooking } from '../jobs/queues';
import { QuotaService } from '../quota/quota.service';
import { Rules, SettingsService } from '../settings/settings.service';
import { BOOKING_SELECT, BookingRow, toBookingResponse } from './booking.presenter';
import { checkBookingRules, quotaView } from './booking-rules';
import {
  BookingCreateDto,
  BookingResponse,
  CancellationResultResponse,
  CheckInDto,
  CheckInResultResponse,
  MyBookingsQueryDto,
  QuotaResponse,
} from './dto/booking.dto';
import { QrService } from './qr.service';

export interface CreateOptions {
  now?: Date;
  /** Runs inside the booking transaction after the insert (waitlist acceptance marks its entry). */
  inTransaction?: (em: EntityManager, bookingId: string) => Promise<void>;
}

const NO_QUOTA = { used: 0, refunded: 0 };

/** SDD module "Rezervări" (FR-03, FR-11 – FR-18, FR-23 – FR-29). */
@Injectable()
export class BookingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly quota: QuotaService,
    private readonly qr: QrService,
    private readonly events: OccupancyEventsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private get zone(): string {
    return this.config.facilityTimezone;
  }

  // ---------- create (SDD 7.1) ----------

  async create(user: AuthUser, dto: BookingCreateDto, options: CreateOptions = {}): Promise<BookingResponse> {
    const now = options.now ?? new Date();
    const resource = await this.dataSource.getRepository(Resource).findOne({
      where: { id: dto.resource_id },
      relations: { sports: true },
    });
    if (!resource) throw new AppException('NOT_FOUND');

    const lookup = findSlot(resource.openingHours, resource.slotMinutes, new Date(dto.start), this.zone);
    if ('error' in lookup) throw new AppException(lookup.error);
    const slot = lookup.slot;
    this.validateInput(dto, resource);

    const month = monthOf(slot.start, this.zone);
    let displaced: CancelledBooking[];
    let bookingId: string;
    let rules: Rules;
    try {
      ({ bookingId, rules, displaced } = await withTransientRetry(() =>
        this.dataSource.transaction(async (em) => {
          // One booking transaction per user at a time: quota and active-limit checks cannot race.
          await em.query(`SELECT 1 FROM users WHERE id = $1 FOR NO KEY UPDATE`, [user.id]);
          const txRules = await this.settings.rules(em);
          const counters = user.role === 'student' ? await this.quota.counters(user.id, month, em) : NO_QUOTA;
          const activeBookings = await this.quota.activeBookings(user.id, now, em);
          const violation = checkBookingRules({
            user,
            resource,
            slot,
            now,
            rules: txRules,
            zone: this.zone,
            quota: counters,
            activeBookings,
          });
          if (violation) throw this.ruleError(violation, slot);

          const txDisplaced = dto.replace_external
            ? await this.displaceExternal(em, user, resource.id, slot, txRules)
            : [];
          const [row]: { id: string }[] = await em.query(
            `INSERT INTO occupancy (resource_id, period, kind, user_id, created_by, qr_nonce, participants_count, sport_id)
           VALUES ($1, tstzrange($2, $3, '[)'), 'booking', $4, $4, gen_random_uuid(), $5, $6)
           RETURNING id`,
            [
              resource.id,
              slot.start,
              slot.end,
              user.id,
              dto.participants_count ?? null,
              dto.sport_id ?? null,
            ],
          );
          if (user.role === 'student') await this.quota.consume(user.id, month, em);
          await options.inTransaction?.(em, row.id);
          return { bookingId: row.id, rules: txRules, displaced: txDisplaced };
        }),
      ));
    } catch (err) {
      // A deadlock that survived the retries is still a lost race for the slot.
      if (pgErrorCode(err) === PG_EXCLUSION_VIOLATION || isTransientPgError(err))
        throw await this.conflictError(resource.id, slot);
      throw err;
    }

    bookingsCreated.inc({ role: user.role });
    await this.events.bookingsCancelled(displaced, { source: 'member_priority' }, false);
    await this.events.bookingCreated(
      { id: bookingId, userId: user.id, resourceId: resource.id, start: slot.start, end: slot.end },
      addMinutes(slot.start, rules.checkin_minutes_after),
    );
    const row = (await this.loadRow(bookingId))!;
    return toBookingResponse(row, this.zone, { qrToken: this.qrFor(row), confirmation: true });
  }

  private validateInput(dto: BookingCreateDto, resource: Resource): void {
    const fields: Record<string, string[]> = {};
    if (dto.participants_count !== undefined && dto.participants_count > resource.capacity) {
      fields.participants_count = [`must not exceed the resource capacity (${resource.capacity})`];
    }
    if (dto.sport_id && !(resource.sports ?? []).some((s) => s.id === dto.sport_id)) {
      fields.sport_id = ['sport not allowed on this resource'];
    }
    if (Object.keys(fields).length) throw new AppException('VALIDATION_FAILED', { details: { fields } });
  }

  private ruleError(code: ErrorCode, slot: Interval): AppException {
    if (code !== 'QUOTA_EXHAUSTED') return new AppException(code);
    const month = DateTime.fromJSDate(slot.start, { zone: this.zone });
    return new AppException(code, {
      message_ro: `Ți-ai folosit intrările din ${month.setLocale('ro').toFormat('LLLL')}. Poți rezerva doar sloturi rămase libere în următoarele 24 h.`,
      message_en: `You have used all your entries for ${month.setLocale('en').toFormat('LLLL')}. You can only book slots left free in the next 24 hours.`,
    });
  }

  /** FR-24: a member takes over an external's slot when the rule is on. */
  private async displaceExternal(
    em: EntityManager,
    user: AuthUser,
    resourceId: string,
    slot: Interval,
    rules: Rules,
  ): Promise<CancelledBooking[]> {
    if (!rules.member_replaces_external || (user.role !== 'student' && user.role !== 'teacher')) {
      throw new AppException('VALIDATION_FAILED', {
        details: { fields: { replace_external: ['not allowed for this account or disabled by the rules'] } },
      });
    }
    const rows: { id: string; user_id: string; start: Date; end: Date }[] = rowsOf(
      await em.query(
        `UPDATE occupancy o SET status = 'cancelled', cancel_source = 'member_priority'
       FROM users u
       WHERE u.id = o.user_id AND u.role = 'external' AND o.resource_id = $1 AND o.kind = 'booking'
         AND o.status = 'active' AND o.period && tstzrange($2, $3, '[)')
       RETURNING o.id, o.user_id, lower(o.period) AS start, upper(o.period) AS "end"`,
        [resourceId, slot.start, slot.end],
      ),
    );
    return rows.map((r) => ({ id: r.id, userId: r.user_id, resourceId, start: r.start, end: r.end }));
  }

  /** 409 with the waitlist offer (SlotConflictError); SLOT_BLOCKED when a block covers the slot. */
  async conflictError(resourceId: string, slot: Interval): Promise<AppException> {
    const rows: { kind: string }[] = await this.dataSource.query(
      `SELECT kind FROM occupancy WHERE resource_id = $1 AND status = 'active' AND period && tstzrange($2, $3, '[)')`,
      [resourceId, slot.start, slot.end],
    );
    const code = rows.some((r) => r.kind !== 'booking') ? 'SLOT_BLOCKED' : 'SLOT_TAKEN';
    bookingConflicts.inc({ code });
    return new AppException(code, {
      extra: {
        waitlist_offer: {
          resource_id: resourceId,
          start: toIsoInZone(slot.start, this.zone),
          end: toIsoInZone(slot.end, this.zone),
        },
      },
    });
  }

  // ---------- read ----------

  async loadRow(id: string, em?: EntityManager, lock = false): Promise<BookingRow | null> {
    const rows: BookingRow[] = await (em ?? this.dataSource.manager).query(
      `${BOOKING_SELECT} WHERE o.id = $1 AND o.kind = 'booking'${lock ? ' FOR UPDATE OF o' : ''}`,
      [id],
    );
    return rows[0] ?? null;
  }

  private qrFor(row: BookingRow): string | undefined {
    if (row.status !== 'active' || !row.qr_nonce) return undefined;
    return this.qr.sign({ bookingId: row.id, nonce: row.qr_nonce, day: dayOf(row.start, this.zone) });
  }

  /** Holders see their bookings (with the QR); admins see all; anyone else gets 404 (SDD 8.1). */
  async get(user: AuthUser, id: string): Promise<BookingResponse> {
    const row = await this.loadRow(id);
    if (!row || (row.user_id !== user.id && user.role !== 'admin')) throw new AppException('NOT_FOUND');
    return toBookingResponse(row, this.zone, {
      qrToken: row.user_id === user.id ? this.qrFor(row) : undefined,
    });
  }

  async listMine(
    user: AuthUser,
    query: MyBookingsQueryDto,
    now = new Date(),
  ): Promise<Page<BookingResponse>> {
    const upcoming = query.scope !== 'history';
    const where = upcoming
      ? `o.user_id = $1 AND o.kind = 'booking' AND o.status = 'active' AND upper(o.period) > $2`
      : `o.user_id = $1 AND o.kind = 'booking' AND NOT (o.status = 'active' AND upper(o.period) > $2)`;
    const { skip, take } = pageOffset(query);
    const [rows, count]: [BookingRow[], { n: string }[]] = await Promise.all([
      this.dataSource.query(
        `${BOOKING_SELECT} WHERE ${where} ORDER BY lower(o.period) ${upcoming ? 'ASC' : 'DESC'} LIMIT $3 OFFSET $4`,
        [user.id, now, take, skip],
      ),
      this.dataSource.query(`SELECT count(*) AS n FROM occupancy o WHERE ${where}`, [user.id, now]),
    ]);
    return pageOf(
      query,
      rows.map((r) => toBookingResponse(r, this.zone)),
      Number(count[0].n),
    );
  }

  // ---------- cancel (FR-14, FR-27) ----------

  /**
   * Allowed until the slot starts and frees it at once. The entry is refunded only up to
   * `cancel_free_hours` before the start (README decision 2: later it stays consumed).
   */
  async cancel(user: AuthUser, id: string, now = new Date()): Promise<CancellationResultResponse> {
    const { row, refunded } = await this.dataSource.transaction(async (em) => {
      const current = await this.loadRow(id, em, true);
      if (!current || current.user_id !== user.id) throw new AppException('NOT_FOUND');
      if (current.status !== 'active' || current.start <= now)
        throw new AppException('BOOKING_NOT_CANCELLABLE');
      await em.query(`UPDATE occupancy SET status = 'cancelled', cancel_source = 'user' WHERE id = $1`, [id]);
      const rules = await this.settings.rules(em);
      const inTime = current.start.getTime() >= addHours(now, rules.cancel_free_hours).getTime();
      const wasRefunded =
        user.role === 'student' && inTime
          ? await this.quota.refund(user.id, monthOf(current.start, this.zone), em)
          : false;
      return { row: current, refunded: wasRefunded };
    });
    await this.events.bookingsCancelled(
      [{ id: row.id, userId: row.user_id, resourceId: row.resource_id, start: row.start, end: row.end }],
      { source: 'user' },
      true,
    );
    const updated = (await this.loadRow(id))!;
    return { booking: toBookingResponse(updated, this.zone), quota_refunded: refunded };
  }

  // ---------- check-in (FR-15, FR-16) ----------

  /**
   * The holder confirms with the button; staff (an `admin` account, README decision 1) scan the QR.
   * Allowed from `checkin_minutes_before` before to `checkin_minutes_after` after the start.
   */
  async checkIn(
    caller: AuthUser,
    id: string,
    dto: CheckInDto,
    now = new Date(),
  ): Promise<CheckInResultResponse> {
    return this.dataSource.transaction(async (em) => {
      const row = await this.loadRow(id, em, true);
      const isHolder = row?.user_id === caller.id;
      const isStaff = caller.role === 'admin';
      if (!row || (!isHolder && !isStaff)) throw new AppException('NOT_FOUND');

      if (dto.method === 'qr') {
        if (!isStaff) throw new AppException('FORBIDDEN');
        const verified = this.qr.verify(dto.qr_token ?? '', dayOf(now, this.zone));
        if (!verified || verified.bookingId !== row.id || verified.nonce !== row.qr_nonce)
          throw new AppException('QR_INVALID');
      }
      if (row.checked_in_at) throw new AppException('ALREADY_CHECKED_IN');
      if (row.status !== 'active') throw new AppException('BOOKING_NOT_ACTIVE');

      const rules = await this.settings.rules(em);
      const opens = addMinutes(row.start, -rules.checkin_minutes_before);
      const closes = addMinutes(row.start, rules.checkin_minutes_after);
      if (now < opens || now > closes) throw new AppException('CHECKIN_WINDOW_CLOSED');

      await em.query(`UPDATE occupancy SET checked_in_at = $2 WHERE id = $1`, [id, now]);
      return {
        booking_id: row.id,
        checked_in_at: toIsoInZone(now, this.zone),
        holder_name: row.holder_name ?? '',
        category: row.holder_role === 'external' ? 'external' : 'member',
      };
    });
  }

  // ---------- quota (FR-26) ----------

  async myQuota(user: AuthUser, now = new Date()): Promise<QuotaResponse> {
    const month = monthOf(now, this.zone);
    const [counters, rules] = await Promise.all([this.quota.counters(user.id, month), this.settings.rules()]);
    return { month, ...quotaView(counters, rules.monthly_quota) };
  }
}
