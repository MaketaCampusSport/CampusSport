import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

/** API: devices, preferences and announcements. */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, AnnouncementsService],
})
export class NotificationsModule {}

/** Worker: delivery over push, email and SMS. */
@Module({
  providers: [NotificationDeliveryService, PushService],
  exports: [NotificationDeliveryService],
})
export class NotificationDeliveryModule {}
