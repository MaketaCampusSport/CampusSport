import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [AvailabilityModule, CatalogModule],
  controllers: [AdminController],
  providers: [AdminService, DashboardService, ReportsService],
})
export class AdminModule {}
