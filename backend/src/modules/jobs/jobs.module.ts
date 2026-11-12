import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { JobsService } from './jobs.service';
import { QUEUES, redisConnection } from './queues';

const queues = BullModule.registerQueue(...Object.values(QUEUES).map((name) => ({ name })));

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        connection: {
          ...redisConnection(config.redisUrl),
          maxRetriesPerRequest: null,
          enableOfflineQueue: true,
        },
        prefix: 'cs:bull',
      }),
    }),
    queues,
  ],
  providers: [JobsService],
  exports: [JobsService, queues],
})
export class JobsModule {}
