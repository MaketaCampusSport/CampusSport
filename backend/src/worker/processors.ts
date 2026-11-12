import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { NoShowCheckJob, NotifyJob, OfferExpiredJob, QUEUES, SlotFreedJob } from '../modules/jobs/queues';
import { notificationLag } from '../modules/metrics/metrics';
import { NotificationDeliveryService } from '../modules/notifications/notification-delivery.service';
import { WaitlistService } from '../modules/waitlist/waitlist.service';
import { MaintenanceService } from './maintenance.service';

/** Notifications must leave within 2 minutes (NFR-03), so this queue gets more concurrency. */
@Processor(QUEUES.notifications, { concurrency: 20 })
export class NotificationsProcessor extends WorkerHost {
  constructor(private readonly delivery: NotificationDeliveryService) {
    super();
  }

  async process(job: Job<NotifyJob>): Promise<unknown> {
    const due = (job.timestamp ?? Date.now()) + (job.opts?.delay ?? 0);
    notificationLag.observe({ type: job.data.type }, Math.max(0, (Date.now() - due) / 1000));
    return this.delivery.deliver(job.data);
  }
}

/** One slot at a time per worker keeps the offer order deterministic (SDD 7.2). */
@Processor(QUEUES.waitlist, { concurrency: 1 })
export class WaitlistProcessor extends WorkerHost {
  constructor(
    private readonly waitlist: WaitlistService,
    private readonly maintenance: MaintenanceService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'slot-freed': {
        const d = job.data as SlotFreedJob;
        return this.waitlist.offerFreedPeriod(d.resourceId, { start: new Date(d.start), end: new Date(d.end) });
      }
      case 'offer-expired':
        return this.waitlist.expireOffer((job.data as OfferExpiredJob).waitlistId);
      case 'offer-scan':
        return this.maintenance.expireOffers();
      default:
        throw new Error(`Unknown waitlist job ${job.name}`);
    }
  }
}

@Processor(QUEUES.bookings, { concurrency: 5 })
export class BookingsProcessor extends WorkerHost {
  constructor(private readonly maintenance: MaintenanceService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'no-show-check':
        return this.maintenance.checkNoShow((job.data as NoShowCheckJob).bookingId);
      case 'maintenance':
        return { no_shows: await this.maintenance.scanNoShows(), completed: await this.maintenance.completeBookings() };
      case 'partitions':
        return this.maintenance.ensurePartitions();
      default:
        throw new Error(`Unknown bookings job ${job.name}`);
    }
  }
}

/** Repeatable jobs, registered idempotently at worker start. */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(QUEUES.bookings) private readonly bookings: Queue,
    @InjectQueue(QUEUES.waitlist) private readonly waitlist: Queue,
    private readonly maintenance: MaintenanceService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.maintenance.ensurePartitions().catch((err) => this.logger.error(`Partitions: ${err.message}`));
    try {
      await this.bookings.upsertJobScheduler('maintenance', { every: 5 * 60_000 }, { name: 'maintenance' });
      await this.bookings.upsertJobScheduler('partitions', { pattern: '0 3 * * *' }, { name: 'partitions' });
      await this.waitlist.upsertJobScheduler('offer-scan', { every: 60_000 }, { name: 'offer-scan' });
      this.logger.log('Repeatable jobs registered');
    } catch (err) {
      this.logger.error(`Could not register repeatable jobs: ${(err as Error).message}`);
    }
  }
}
