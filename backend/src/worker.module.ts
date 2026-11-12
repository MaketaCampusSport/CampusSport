import { Module } from '@nestjs/common';
import { RedisModule } from './common/kv/redis.module';
import { loggingModule } from './common/logging';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { EventsModule } from './modules/events/events.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationDeliveryModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';
import { MaintenanceService } from './worker/maintenance.service';
import { BookingsProcessor, NotificationsProcessor, SchedulerService, WaitlistProcessor } from './worker/processors';

/** Worker process (SDD 4.1): BullMQ processors and repeatable jobs, no HTTP server. */
@Module({
  imports: [
    AppConfigModule,
    loggingModule('worker'),
    DatabaseModule,
    RedisModule,
    AuditModule,
    MessagingModule,
    SettingsModule,
    RealtimeModule,
    JobsModule,
    EventsModule,
    WaitlistModule,
    NotificationDeliveryModule,
  ],
  providers: [MaintenanceService, NotificationsProcessor, WaitlistProcessor, BookingsProcessor, SchedulerService],
})
export class WorkerModule {}
