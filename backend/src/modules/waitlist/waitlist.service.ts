import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DateTime } from 'luxon';
import { DataSource, EntityManager } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { isSuspended } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { pgErrorCode } from '../../common/errors/all-exceptions.filter';
import { addHours, addMinutes, dayOf } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { Resource, Sport, WaitlistEntry } from '../../database/entities';
import { ROLE_PRIORITY } from '../../database/enums';
import { findSlot, Interval, slotsForDay } from '../availability/slots';
import { BookingsService } from '../bookings/bookings.service';
import type { BookingResponse } from '../bookings/dto/booking.dto';
import { JobsService } from '../jobs/jobs.service';
import { SettingsService } from '../settings/settings.service';
import { toWaitlistResponse, WaitlistEntryResponse, WaitlistJoinDto } from './dto/waitlist.dto';

const PG_UNIQUE_VIOLATION = '23505';

export interface OfferResult {
  slot: Interval;
  offeredTo: string[];
  simultaneous: boolean;
}

function invalid(fields: Record<string, string[]>): AppException {
  return new AppException('VALIDATION_FAILED', { details: { fields } });
}

/** SDD module "Listă de așteptare" (FR-13, FR-30 – FR-33, SDD 7.2). */
@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bookings: BookingsService,
    private readonly settings: SettingsService,
    private readonly jobs: JobsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private get zone(): string {
    return this.config.facilityTimezone;
  }

  private toResponse(e: WaitlistEntry): WaitlistEntryResponse {
    return toWaitlistResponse(e, this.zone);
  }

  // ---------- user actions ----------

  /** Priority is set by the server from the role: teacher 1, student 2, external 3; then signup time. */
  async join(user: AuthUser, dto: WaitlistJoinDto, now = new Date()): Promise<WaitlistEntryResponse> {
    if (user.role === 'admin') throw new AppException('FORBIDDEN');
    if (isSuspended(user, now)) throw new AppException('ACCOUNT_SUSPENDED');
    const entry: Partial<WaitlistEntry> = { userId: user.id, day: dto.day, priority: ROLE_PRIORITY[user.role] };

    if (dto.resource_id) {
      if (!dto.start || !dto.end) throw invalid({ start: ['required with resource_id'], end: ['required with resource_id'] });
      const start = new Date(dto.start);
      const end = new Date(dto.end);
      const resource = await this.dataSource.getRepository(Resource).findOneBy({ id: dto.resource_id });
      if (!resource || !resource.active) throw new AppException('NOT_FOUND');
      const lookup = findSlot(resource.openingHours, resource.slotMinutes, start, this.zone);
      if ('error' in lookup || lookup.slot.end.getTime() !== end.getTime()) throw invalid({ start: ['not a slot of this resource'] });
      if (dayOf(start, this.zone) !== dto.day) throw invalid({ day: ['must be the day of start'] });
      if (start <= now) throw invalid({ start: ['the slot has already started'] });
      Object.assign(entry, { resourceId: resource.id, sportId: dto.sport_id ?? null, period: { start, end } });
    } else {
      if (!dto.sport_id) throw invalid({ sport_id: ['required for a day + sport subscription'] });
      if (dto.start || dto.end) throw invalid({ resource_id: ['required with start/end'] });
      if (!(await this.dataSource.getRepository(Sport).existsBy({ id: dto.sport_id }))) throw new AppException('NOT_FOUND');
      if (dto.day < dayOf(now, this.zone)) throw invalid({ day: ['must not be in the past'] });
      Object.assign(entry, { resourceId: null, sportId: dto.sport_id, period: null });
    }

    try {
      const repo = this.dataSource.getRepository(WaitlistEntry);
      return this.toResponse(await repo.save(repo.create(entry)));
    } catch (err) {
      if (pgErrorCode(err) === PG_UNIQUE_VIOLATION) throw new AppException('ALREADY_ON_WAITLIST');
      throw err;
    }
  }

  async listMine(user: AuthUser, now = new Date()): Promise<WaitlistEntryResponse[]> {
    const rows = await this.dataSource
      .getRepository(WaitlistEntry)
      .createQueryBuilder('w')
      .where('w.user_id = :userId', { userId: user.id })
      .andWhere('w.day >= :today', { today: dayOf(now, this.zone) })
      .orderBy('w.day', 'ASC')
      .addOrderBy('w.created_at', 'ASC')
      .getMany();
    return rows.map((r) => this.toResponse(r));
  }

  /** An offer in progress moves on to the next candidate immediately (FR-33). */
  async leave(user: AuthUser, id: string): Promise<void> {
    const repo = this.dataSource.getRepository(WaitlistEntry);
    const entry = await repo.findOneBy({ id, userId: user.id });
    if (!entry) throw new AppException('NOT_FOUND');
    await repo.delete({ id });
    if (entry.status === 'offered' && entry.offeredResourceId && entry.offeredPeriod?.end) {
      this.jobs.slotFreed({
        resourceId: entry.offeredResourceId,
        start: entry.offeredPeriod.start.toISOString(),
        end: entry.offeredPeriod.end.toISOString(),
      });
    }
  }

  /**
   * Books the offered slot through the normal booking algorithm (FR-32): the first to confirm wins through
   * `no_overlap`; the others get OFFER_TAKEN and go back to waiting.
   */
  async accept(user: AuthUser, id: string, now = new Date()): Promise<BookingResponse> {
    const entry = await this.dataSource.getRepository(WaitlistEntry).findOneBy({ id, userId: user.id });
    if (!entry) throw new AppException('NOT_FOUND');
    if (entry.status === 'expired' || (entry.status === 'offered' && entry.offerExpiresAt && entry.offerExpiresAt <= now)) {
      throw new AppException('OFFER_EXPIRED');
    }
    if (entry.status !== 'offered' || !entry.offeredResourceId || !entry.offeredPeriod?.end) {
      throw new AppException('OFFER_TAKEN');
    }
    const slot = { start: entry.offeredPeriod.start, end: entry.offeredPeriod.end };
    const resourceId = entry.offeredResourceId;
    try {
      return await this.bookings.create(
        user,
        { resource_id: resourceId, start: slot.start.toISOString() },
        {
          now,
          inTransaction: async (em) => {
            const updated: unknown[] = await em.query(
              `UPDATE waitlist SET status = 'accepted' WHERE id = $1 AND status = 'offered' RETURNING 1`,
              [id],
            );
            if (!updated.length) throw new AppException('OFFER_TAKEN');
            // Simultaneous offers for the same slot go back to waiting.
            await em.query(
              `UPDATE waitlist SET status = 'waiting', offered_at = NULL, offer_expires_at = NULL,
                 offered_resource_id = NULL, offered_period = NULL
               WHERE id <> $1 AND status = 'offered' AND offered_resource_id = $2 AND offered_period && tstzrange($3, $4, '[)')`,
              [id, resourceId, slot.start, slot.end],
            );
          },
        },
      );
    } catch (err) {
      if (err instanceof AppException && (err.code === 'SLOT_TAKEN' || err.code === 'SLOT_BLOCKED')) {
        await this.resetOffer(id);
        throw new AppException('OFFER_TAKEN');
      }
      throw err;
    }
  }

  private async resetOffer(id: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE waitlist SET status = 'waiting', offered_at = NULL, offer_expires_at = NULL,
         offered_resource_id = NULL, offered_period = NULL
       WHERE id = $1 AND status = 'offered'`,
      [id],
    );
  }

  // ---------- worker side (SDD 7.2) ----------

  /**
   * A period became free on a resource. Each free future slot in it goes to the best candidates:
   * the first by priority and signup time for `waitlist_offer_minutes`, or everyone at once when the slot
   * starts in less than `waitlist_simultaneous_under_hours` (BR-07).
   */
  async offerFreedPeriod(resourceId: string, period: Interval, now = new Date()): Promise<OfferResult[]> {
    const resource = await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId }, relations: { sports: true } });
    if (!resource?.active) return [];
    const rules = await this.settings.rules();
    const results: OfferResult[] = [];
    for (const slot of this.slotsWithin(resource, period, now)) {
      const result = await this.dataSource.transaction(async (em) => this.offerSlot(em, resource, slot, now, rules));
      if (result) results.push(result);
    }
    for (const r of results) {
      if (!r.simultaneous) {
        this.jobs.offerExpires({ waitlistId: r.offeredTo[0] }, addMinutes(now, rules.waitlist_offer_minutes));
      }
    }
    return results;
  }

  /** Grid slots of the resource lying fully inside the period and not started yet. */
  slotsWithin(resource: Pick<Resource, 'openingHours' | 'slotMinutes'>, period: Interval, now: Date): Interval[] {
    const slots: Interval[] = [];
    const last = dayOf(period.end, this.zone);
    for (let day = DateTime.fromJSDate(period.start, { zone: this.zone }); day.toISODate()! <= last; day = day.plus({ days: 1 })) {
      for (const slot of slotsForDay(resource.openingHours, resource.slotMinutes, day.toISODate()!, this.zone)) {
        if (slot.start >= period.start && slot.end <= period.end && slot.start > now) slots.push(slot);
      }
    }
    return slots;
  }

  private async offerSlot(
    em: EntityManager,
    resource: Resource,
    slot: Interval,
    now: Date,
    rules: { waitlist_offer_minutes: number; waitlist_simultaneous_under_hours: number },
  ): Promise<OfferResult | null> {
    const taken: unknown[] = await em.query(
      `SELECT 1 FROM occupancy WHERE resource_id = $1 AND status = 'active' AND period && tstzrange($2, $3, '[)')`,
      [resource.id, slot.start, slot.end],
    );
    if (taken.length) return null;
    const pending: unknown[] = await em.query(
      `SELECT 1 FROM waitlist WHERE status = 'offered' AND offered_resource_id = $1 AND offered_period && tstzrange($2, $3, '[)')`,
      [resource.id, slot.start, slot.end],
    );
    if (pending.length) return null;

    const sportIds = (resource.sports ?? []).map((s) => s.id);
    const candidates: { id: string; user_id: string }[] = await em.query(
      `SELECT w.id, w.user_id FROM waitlist w JOIN users u ON u.id = w.user_id
       WHERE w.status = 'waiting' AND w.day = $4
         AND (u.status = 'active' OR u.suspended_until <= now())
         AND ((w.resource_id = $1 AND w.period = tstzrange($2, $3, '[)'))
              OR (w.resource_id IS NULL AND w.sport_id = ANY($5::uuid[])))
       ORDER BY w.priority, w.created_at
       FOR UPDATE OF w SKIP LOCKED`,
      [resource.id, slot.start, slot.end, dayOf(slot.start, this.zone), sportIds],
    );
    if (!candidates.length) return null;

    const simultaneous = slot.start.getTime() < addHours(now, rules.waitlist_simultaneous_under_hours).getTime();
    const chosen = simultaneous ? candidates : candidates.slice(0, 1);
    const expiresAt = simultaneous ? null : addMinutes(now, rules.waitlist_offer_minutes);
    await em.query(
      `UPDATE waitlist SET status = 'offered', offered_at = $2, offer_expires_at = $3,
         offered_resource_id = $4, offered_period = tstzrange($5, $6, '[)')
       WHERE id = ANY($1::uuid[])`,
      [chosen.map((c) => c.id), now, expiresAt, resource.id, slot.start, slot.end],
    );
    for (const c of chosen) {
      this.jobs.notify({
        type: 'waitlist-offer',
        userId: c.user_id,
        data: {
          waitlist_id: c.id,
          resource_id: resource.id,
          resource_name: resource.name,
          start: slot.start.toISOString(),
          end: slot.end.toISOString(),
          expires_at: expiresAt?.toISOString() ?? null,
        },
      });
    }
    this.logger.log(`Offered ${resource.name} ${slot.start.toISOString()} to ${chosen.length} candidate(s)`);
    return { slot, offeredTo: chosen.map((c) => c.id), simultaneous };
  }

  /** The 10-minute offer lapsed without an answer: the entry expires and the next candidate gets it. */
  async expireOffer(waitlistId: string, now = new Date()): Promise<void> {
    const rows: { offered_resource_id: string; start: Date; end: Date }[] = await this.dataSource.query(
      `UPDATE waitlist SET status = 'expired'
       WHERE id = $1 AND status = 'offered' AND offer_expires_at <= $2
       RETURNING offered_resource_id, lower(offered_period) AS start, upper(offered_period) AS "end"`,
      [waitlistId, now],
    );
    if (rows.length) await this.offerFreedPeriod(rows[0].offered_resource_id, { start: rows[0].start, end: rows[0].end }, now);
  }
}
