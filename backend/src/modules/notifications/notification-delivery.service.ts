import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { dayOf } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { NotificationPreferencesValue } from '../../database/entities';
import type { NotificationChannel } from '../../database/enums';
import { BOOKING_SELECT, BookingRow } from '../bookings/booking.presenter';
import type { NotifyJob } from '../jobs/queues';
import { MailService, SmsService } from '../messaging/messaging.service';
import { AlternativeResource, pickAlternatives } from './alternatives';
import { renderMessage, RenderedMessage } from './messages';
import { PushService } from './push.service';

interface Recipient {
  id: string;
  email: string;
  phone: string | null;
  notification_preferences: NotificationPreferencesValue;
}

interface ChannelResult {
  channel: NotificationChannel;
  delivered: boolean;
  error?: string;
}

/**
 * Worker side of notifications (FR-34 – FR-37). Preferences choose the channels; critical messages
 * (cancellations, blocks) go out regardless and fall back to SMS when push did not get through (FR-36).
 * Every attempt is stored in `notifications`, which feeds the delivery counter (FR-41).
 */
@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly push: PushService,
    private readonly mail: MailService,
    private readonly sms: SmsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async deliver(job: NotifyJob, now = new Date()): Promise<ChannelResult[]> {
    const [user]: Recipient[] = await this.dataSource.query(
      `SELECT id, email, phone, notification_preferences FROM users WHERE id = $1`,
      [job.userId],
    );
    if (!user) return [];
    const booking = job.occupancyId ? await this.booking(job.occupancyId) : null;
    if (job.occupancyId && !booking) return [];
    // Confirmations and reminders are pointless once the booking is no longer active.
    if ((job.type === 'booking-confirmed' || job.type === 'booking-reminder') && booking?.status !== 'active') return [];

    const prefs = user.notification_preferences;
    const lang = prefs.language === 'en' ? 'en' : 'ro';
    const alternatives = job.type === 'booking-cancelled' && booking ? await this.alternatives(booking, now) : [];
    const message = renderMessage(
      job,
      booking ? { resourceName: booking.resource_name, start: booking.start, end: booking.end } : null,
      lang,
      this.config.facilityTimezone,
      alternatives.map((a) => ({ resourceName: a.resourceName, start: a.start })),
    );

    const results: ChannelResult[] = [];
    if (prefs.push || job.critical) results.push(await this.viaPush(user, message));
    if (prefs.email || job.critical) results.push(await this.viaEmail(user, message));
    const pushOk = results.some((r) => r.channel === 'push' && r.delivered);
    if (user.phone && (prefs.sms || (job.critical && !pushOk))) results.push(await this.viaSms(user, message));

    for (const r of results) {
      await this.dataSource.query(
        `INSERT INTO notifications (user_id, occupancy_id, block_id, type, channel, payload, sent_at, delivered_at, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.id,
          job.occupancyId ?? null,
          job.blockId ?? null,
          job.type,
          r.channel,
          JSON.stringify({ ...message, data: job.data }),
          now,
          r.delivered ? new Date() : null,
          r.error ?? null,
        ],
      );
    }
    return results;
  }

  private async booking(id: string): Promise<BookingRow | null> {
    const rows: BookingRow[] = await this.dataSource.query(`${BOOKING_SELECT} WHERE o.id = $1`, [id]);
    return rows[0] ?? null;
  }

  private async viaPush(user: Recipient, message: RenderedMessage): Promise<ChannelResult> {
    const subs: { id: string; endpoint: string; keys: { p256dh: string; auth: string } }[] = await this.dataSource.query(
      `SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1`,
      [user.id],
    );
    if (!subs.length) return { channel: 'push', delivered: false, error: 'no push subscription' };
    const errors: string[] = [];
    let delivered = false;
    for (const sub of subs) {
      const result = await this.push.send(sub, message);
      if (result.outcome === 'delivered') delivered = true;
      if (result.outcome === 'gone') await this.dataSource.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
      if (result.error) errors.push(result.error);
    }
    return { channel: 'push', delivered, ...(delivered ? {} : { error: errors.join('; ') }) };
  }

  private async viaEmail(user: Recipient, message: RenderedMessage): Promise<ChannelResult> {
    try {
      await this.mail.send({ to: user.email, subject: `CampusSport: ${message.title}`, text: `${message.body}\n\n${this.config.pwaUrl}${message.url}` });
      return { channel: 'email', delivered: true };
    } catch (err) {
      this.logger.warn(`Email for user ${user.id} failed: ${(err as Error).message}`);
      return { channel: 'email', delivered: false, error: (err as Error).message };
    }
  }

  private async viaSms(user: Recipient, message: RenderedMessage): Promise<ChannelResult> {
    try {
      await this.sms.send({ to: user.phone!, text: `CampusSport: ${message.body}`.slice(0, 320) });
      return { channel: 'sms', delivered: true };
    } catch (err) {
      return { channel: 'sms', delivered: false, error: (err as Error).message };
    }
  }

  private async alternatives(booking: BookingRow, now: Date) {
    const zone = this.config.facilityTimezone;
    const day = dayOf(booking.start, zone);
    const resources: AlternativeResource[] = await this.dataSource.query(
      `SELECT DISTINCT r.id, r.name, r.opening_hours AS "openingHours", r.slot_minutes AS "slotMinutes"
       FROM resources r JOIN resource_sports rs ON rs.resource_id = r.id
       WHERE r.active AND rs.sport_id IN (SELECT sport_id FROM resource_sports WHERE resource_id = $1)`,
      [booking.resource_id],
    );
    if (!resources.length) return [];
    const occupied: { resource_id: string; start: Date; end: Date | null }[] = await this.dataSource.query(
      `SELECT resource_id, lower(period) AS start, upper(period) AS "end" FROM occupancy
       WHERE resource_id = ANY($1::uuid[]) AND status = 'active'
         AND period && tstzrange($2::date::timestamp AT TIME ZONE $3, ($2::date + 1)::timestamp AT TIME ZONE $3)`,
      [resources.map((r) => r.id), day, zone],
    );
    return pickAlternatives({
      resources,
      occupied: occupied.map((o) => ({ resourceId: o.resource_id, start: o.start, end: o.end })),
      original: { start: booking.start, end: booking.end },
      day,
      zone,
      now,
    });
  }
}
