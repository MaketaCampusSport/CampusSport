import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';

/** Worker process (SDD 4.1): BullMQ processors only, no HTTP server. */
@Module({
  imports: [AppConfigModule],
})
export class WorkerModule {}
