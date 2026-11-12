import { Inject, Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';

export type PushOutcome = 'delivered' | 'gone' | 'failed';

/** Web Push with VAPID (FR-34); disabled until VAPID keys are configured. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  readonly enabled: boolean;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.enabled = Boolean(config.vapid.publicKey && config.vapid.privateKey);
    if (this.enabled)
      webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
    else this.logger.warn('VAPID keys missing: push notifications are disabled');
  }

  async send(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: object,
  ): Promise<{ outcome: PushOutcome; error?: string }> {
    if (!this.enabled) return { outcome: 'failed', error: 'push disabled' };
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      return { outcome: 'delivered' };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return { outcome: 'gone', error: `endpoint expired (${status})` };
      return { outcome: 'failed', error: (err as Error).message };
    }
  }
}
