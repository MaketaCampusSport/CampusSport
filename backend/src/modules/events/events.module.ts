import { Global, Module } from '@nestjs/common';
import { OccupancyEventsService } from './occupancy-events.service';

@Global()
@Module({
  providers: [OccupancyEventsService],
  exports: [OccupancyEventsService],
})
export class EventsModule {}
