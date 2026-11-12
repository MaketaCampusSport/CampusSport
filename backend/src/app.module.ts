import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [AppConfigModule, HealthModule],
})
export class AppModule {}
