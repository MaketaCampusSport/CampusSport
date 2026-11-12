import { Module } from '@nestjs/common';
import { NotificationDeliveryService } from './notification-delivery.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

/** API: devices and preferences. */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}

/** Worker: delivery over push, email and SMS. */
@Module({
  providers: [NotificationDeliveryService, PushService],
  exports: [NotificationDeliveryService],
})
export class NotificationDeliveryModule {}
