import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { JobsOptions, Queue } from 'bullmq';
import { NoShowCheckJob, NotifyJob, OfferExpiredJob, QUEUES, SlotFreedJob } from './queues';

const ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * Producer side of the worker queues. Calls never block or fail the HTTP request: the transaction is
 * already committed, so a Redis outage is logged (and the worker's periodic scans catch up).
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectQueue(QUEUES.notifications) private readonly notifications: Queue,
    @InjectQueue(QUEUES.waitlist) private readonly waitlist: Queue,
    @InjectQueue(QUEUES.bookings) private readonly bookings: Queue,
  ) {}

  notify(job: NotifyJob, opts: JobsOptions = {}): void {
    this.add(this.notifications, job.type, job, { attempts: 5, backoff: { type: 'exponential', delay: 5_000 }, ...opts });
  }

  slotFreed(job: SlotFreedJob): void {
    this.add(this.waitlist, 'slot-freed', job, { attempts: 3 });
  }

  offerExpires(job: OfferExpiredJob, at: Date): void {
    this.add(this.waitlist, 'offer-expired', job, {
      delay: Math.max(0, at.getTime() - Date.now()),
      jobId: `offer-expired_${job.waitlistId}`,
    });
  }

  noShowCheck(job: NoShowCheckJob, at: Date): void {
    this.add(this.bookings, 'no-show-check', job, {
      delay: Math.max(0, at.getTime() - Date.now()),
      jobId: `no-show_${job.bookingId}`,
    });
  }

  /** BullMQ 6 rejects custom job ids containing ":"; ids here use "_" as separator. */
  private add(queue: Queue, name: string, data: object, opts: JobsOptions): void {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${ENQUEUE_TIMEOUT_MS} ms`)), ENQUEUE_TIMEOUT_MS).unref(),
    );
    Promise.race([queue.add(name, data, { removeOnComplete: 1000, removeOnFail: 5000, ...opts }), timeout]).catch((err) =>
      this.logger.error(`Could not enqueue ${queue.name}/${name}: ${(err as Error).message}`),
    );
  }
}
