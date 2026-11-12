import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { filter } from 'rxjs';
import type { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser, Public } from '../../common/auth/decorators';
import { dayOf } from '../../common/time';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import { RealtimeService } from '../realtime/realtime.service';
import { AvailabilityService, AvailabilityView } from './availability.service';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class AvailabilityQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Identificatorul resursei.' })
  @IsOptional()
  @IsUUID()
  resource?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Alternativă la `resource`. Extindere față de SDD 6.1.',
  })
  @IsOptional()
  @IsUUID()
  sport?: string;

  @ApiProperty({ format: 'date', example: '2026-11-12' })
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  date: string;
}

export class StreamQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  resource: string;

  @ApiProperty({ format: 'date', example: '2026-11-12' })
  @Matches(DATE_ONLY)
  @IsISO8601({ strict: true })
  date: string;
}

export const SSE_HEARTBEAT_MS = 25_000;

@ApiTags('Disponibilitate')
@Controller()
export class AvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Get('availability')
  @ApiOperation({ operationId: 'getAvailability', summary: 'Grila de sloturi' })
  @ApiOkResponse({ description: 'Grila pentru ziua cerută (`Availability`).' })
  getAvailability(
    @Query() query: AvailabilityQueryDto,
    @CurrentUser() caller?: AuthUser,
  ): Promise<AvailabilityView> {
    return this.availability.getAvailability(query, caller);
  }

  /** `slot-changed` events for one resource and day, without personal data (FR-09, FR-10). */
  @Public()
  @Get('stream/availability')
  @ApiOperation({ operationId: 'streamAvailability', summary: 'Actualizări în timp real (SSE)' })
  @ApiProduces('text/event-stream')
  async stream(
    @Query() query: StreamQueryDto,
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() caller?: AuthUser,
  ): Promise<void> {
    await this.availability.assertResource(query.resource, caller);
    const zone = this.config.facilityTimezone;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(': connected\n\n');

    const subscription = this.realtime.changes
      .pipe(filter((e) => e.resource_id === query.resource && dayOf(new Date(e.start), zone) === query.date))
      .subscribe((e) => res.write(`event: slot-changed\ndata: ${JSON.stringify(e)}\n\n`));
    const heartbeat = setInterval(() => res.write(': ping\n\n'), SSE_HEARTBEAT_MS);

    req.on('close', () => {
      clearInterval(heartbeat);
      subscription.unsubscribe();
      res.end();
    });
  }
}
