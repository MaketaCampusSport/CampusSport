import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthCoreModule } from './common/auth/auth-core.module';
import { THROTTLER_OPTIONS, UserThrottlerGuard } from './common/http/throttler';
import { RedisModule } from './common/kv/redis.module';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MessagingModule } from './modules/messaging/messaging.module';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    RedisModule,
    AuthCoreModule,
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    AuditModule,
    MessagingModule,
    HealthModule,
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
