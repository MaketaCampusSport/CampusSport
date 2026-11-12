import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';
import { REDIS } from '../../common/kv/redis.module';

export type PublicSlotStatus = 'free' | 'occupied' | 'blocked';

/** Payload of the `slot-changed` SSE event: no personal data (FR-10). */
export interface SlotChangedEvent {
  resource_id: string;
  start: string;
  end: string | null;
  status: PublicSlotStatus;
}

const CHANNEL = 'cs:slot-changed';

/**
 * Fan-out of slot changes to every API instance (SDD 8.2) through Redis pub/sub; falls back to
 * in-process delivery when Redis is not connected, so a single instance keeps working.
 */
@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly events = new Subject<SlotChangedEvent>();
  private subscriber?: Redis;

  constructor(@Optional() @Inject(REDIS) private readonly redis?: Redis) {}

  async onModuleInit(): Promise<void> {
    if (!this.redis) return;
    this.subscriber = this.redis.duplicate();
    this.subscriber.on('error', () => undefined);
    this.subscriber.on('message', (_channel, message) => {
      try {
        this.events.next(JSON.parse(message) as SlotChangedEvent);
      } catch (err) {
        this.logger.warn(`Ignoring malformed slot event: ${(err as Error).message}`);
      }
    });
    await this.subscriber.subscribe(CHANNEL).catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    this.events.complete();
    await this.subscriber?.quit().catch(() => undefined);
  }

  get changes(): Observable<SlotChangedEvent> {
    return this.events.asObservable();
  }

  async publish(...events: SlotChangedEvent[]): Promise<void> {
    for (const event of events) {
      if (this.redis?.status === 'ready' && this.subscriber?.status === 'ready') {
        await this.redis.publish(CHANNEL, JSON.stringify(event));
      } else {
        this.events.next(event);
      }
    }
  }
}
