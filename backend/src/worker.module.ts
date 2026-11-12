import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';

/** Worker process (SDD 4.1): BullMQ processors only, no HTTP server. */
@Module({
  imports: [AppConfigModule, DatabaseModule],
})
export class WorkerModule {}
