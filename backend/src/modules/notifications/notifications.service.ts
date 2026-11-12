import { Inject, Injectable } from '@nestjs/common';
import { rowsOf } from '../../common/db/rows';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';
import { toIsoInZone } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { NotificationPreferencesValue } from '../../database/entities';
import {
  NotificationPreferencesDto,
  PushSubscriptionInputDto,
  PushSubscriptionResponse,
} from './dto/notifications.dto';

/** Devices and preferred channels (FR-34, FR-37). */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Re-registering the same endpoint (e.g. after a re-login) moves it to the current user. */
  async registerPush(user: AuthUser, dto: PushSubscriptionInputDto): Promise<PushSubscriptionResponse> {
    const [row]: {
      id: string;
      endpoint: string;
      keys: { p256dh: string; auth: string };
      created_at: Date;
    }[] = await this.dataSource.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys) VALUES ($1, $2, $3)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys
       RETURNING id, endpoint, keys, created_at`,
      [user.id, dto.endpoint, JSON.stringify({ p256dh: dto.keys.p256dh, auth: dto.keys.auth })],
    );
    return {
      id: row.id,
      endpoint: row.endpoint,
      keys: row.keys,
      created_at: toIsoInZone(row.created_at, this.config.facilityTimezone),
    };
  }

  async deletePush(user: AuthUser, id: string): Promise<void> {
    const rows: unknown[] = rowsOf(
      await this.dataSource.query(
        `DELETE FROM push_subscriptions WHERE id = $1 AND user_id = $2 RETURNING 1`,
        [id, user.id],
      ),
    );
    if (!rows.length) throw new AppException('NOT_FOUND');
  }

  async getPreferences(user: AuthUser): Promise<NotificationPreferencesValue> {
    const [row]: { notification_preferences: NotificationPreferencesValue }[] = await this.dataSource.query(
      `SELECT notification_preferences FROM users WHERE id = $1`,
      [user.id],
    );
    if (!row) throw new AppException('NOT_FOUND');
    return row.notification_preferences;
  }

  /** Critical notices (cancellations, blocks) are sent regardless of these choices. */
  async updatePreferences(
    user: AuthUser,
    dto: NotificationPreferencesDto,
  ): Promise<NotificationPreferencesValue> {
    const value: NotificationPreferencesValue = {
      push: dto.push,
      email: dto.email,
      sms: dto.sms,
      language: dto.language ?? 'ro',
    };
    const [row]: { notification_preferences: NotificationPreferencesValue }[] = rowsOf(
      await this.dataSource.query(
        `UPDATE users SET notification_preferences = $2 WHERE id = $1 RETURNING notification_preferences`,
        [user.id, JSON.stringify(value)],
      ),
    );
    if (!row) throw new AppException('NOT_FOUND');
    return row.notification_preferences;
  }
}
