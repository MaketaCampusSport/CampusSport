import { Module } from '@nestjs/common';
import { QuotaModule } from '../quota/quota.module';
import {
  AdminBookingsController,
  BookingsController,
  MyBookingsController,
  PublicBookingLinksController,
} from './bookings.controller';
import { BookingsService } from './bookings.service';
import { QrService } from './qr.service';

@Module({
  imports: [QuotaModule],
  controllers: [BookingsController, PublicBookingLinksController, MyBookingsController, AdminBookingsController],
  providers: [BookingsService, QrService],
  exports: [BookingsService],
})
export class BookingsModule {}
