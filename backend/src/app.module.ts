import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { THROTTLER_OPTIONS, UserThrottlerGuard } from './common/http/throttler';
import { RedisModule } from './common/kv/redis.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { BlocksModule } from './modules/blocks/blocks.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EventsModule } from './modules/events/events.module';
import { HealthModule } from './modules/health/health.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { SettingsModule } from './modules/settings/settings.module';
import { WaitlistModule } from './modules/waitlist/waitlist.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    AuthCoreModule,
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    AuditModule,
    MessagingModule,
    SettingsModule,
    RealtimeModule,
    JobsModule,
    EventsModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    AvailabilityModule,
    BookingsModule,
    WaitlistModule,
    BlocksModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
