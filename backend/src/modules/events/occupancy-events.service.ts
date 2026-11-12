import { Inject, Injectable } from '@nestjs/common';
import { toIsoInZone } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { JobsService } from '../jobs/jobs.service';
import type { CancellationCause, CancelledBooking } from '../jobs/queues';
import { PublicSlotStatus, RealtimeService } from '../realtime/realtime.service';

export interface SlotChange {
  resourceId: string;
  start: Date;
  end: Date | null;
  status: PublicSlotStatus;
}

/**
 * What happens after an occupancy change commits: the grid is told through SSE (FR-09) and the worker
 * gets its jobs (confirmations, reminders, waitlist offers, notifications).
 */
@Injectable()
export class OccupancyEventsService {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jobs: JobsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private iso(d: Date): string {
    return toIsoInZone(d, this.config.facilityTimezone);
  }

  async slotsChanged(changes: SlotChange[]): Promise<void> {
    await this.realtime.publish(
      ...changes.map((c) => ({
        resource_id: c.resourceId,
        start: this.iso(c.start),
        end: c.end ? this.iso(c.end) : null,
        status: c.status,
      })),
    );
  }

  async bookingCreated(
    booking: { id: string; userId: string; resourceId: string; start: Date; end: Date },
    checkInClosesAt: Date,
  ): Promise<void> {
    await this.slotsChanged([
      { resourceId: booking.resourceId, start: booking.start, end: booking.end, status: 'occupied' },
    ]);
    this.jobs.notify({
      type: 'booking-confirmed',
      userId: booking.userId,
      occupancyId: booking.id,
      data: {},
    });
    for (const hoursBefore of [24, 1]) {
      const at = new Date(booking.start.getTime() - hoursBefore * 3_600_000);
      if (at.getTime() > Date.now()) {
        this.jobs.notify(
          {
            type: 'booking-reminder',
            userId: booking.userId,
            occupancyId: booking.id,
            data: { hours_before: hoursBefore },
          },
          { delay: at.getTime() - Date.now(), jobId: `reminder_${booking.id}_${hoursBefore}` },
        );
      }
    }
    this.jobs.noShowCheck({ bookingId: booking.id }, checkInClosesAt);
  }

  /**
   * Bookings cancelled by their holder or by someone else. Freed slots go to the waitlist unless a block
   * now covers them; holders are notified when the cancellation was not their own (FR-35).
   */
  async bookingsCancelled(
    bookings: CancelledBooking[],
    cause: CancellationCause,
    slotsFreed: boolean,
  ): Promise<void> {
    if (!bookings.length) return;
    if (slotsFreed) {
      await this.slotsChanged(
        bookings.map((b) => ({ resourceId: b.resourceId, start: b.start, end: b.end, status: 'free' })),
      );
      for (const b of bookings)
        this.jobs.slotFreed({
          resourceId: b.resourceId,
          start: b.start.toISOString(),
          end: b.end.toISOString(),
        });
    }
    if (cause.source === 'user') return;
    for (const b of bookings) {
      if (!b.userId) continue;
      this.jobs.notify({
        type: 'booking-cancelled',
        userId: b.userId,
        occupancyId: b.id,
        blockId: cause.blockId ?? null,
        critical: true,
        data: { cancel_source: cause.source, reason: cause.reason ?? null },
      });
    }
  }

  /** A block or event ended or was removed: its period is free again. */
  async periodFreed(resourceId: string, start: Date, end: Date): Promise<void> {
    await this.slotsChanged([{ resourceId, start, end, status: 'free' }]);
    this.jobs.slotFreed({ resourceId, start: start.toISOString(), end: end.toISOString() });
  }
}
