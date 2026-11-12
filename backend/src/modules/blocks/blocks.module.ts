import { Module } from '@nestjs/common';
import { QuotaModule } from '../quota/quota.module';
import { BlocksController } from './blocks.controller';
import { BlocksService } from './blocks.service';

@Module({
  imports: [QuotaModule],
  controllers: [BlocksController],
  providers: [BlocksService],
})
export class BlocksModule {}
