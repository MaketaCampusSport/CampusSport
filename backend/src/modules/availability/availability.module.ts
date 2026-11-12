import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { QuotaModule } from '../quota/quota.module';
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

@Module({
  imports: [CatalogModule, QuotaModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
