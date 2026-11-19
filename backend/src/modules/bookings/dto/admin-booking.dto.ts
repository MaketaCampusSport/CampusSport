import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination';
import { OCCUPANCY_STATUSES } from '../../../database/enums';
import type { OccupancyStatus } from '../../../database/enums';

/** Filters of `GET /admin/bookings` (FR-43). */
export class AdminBookingsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  resource?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-11-12', description: 'Ziua începutului.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  date?: string;

  @ApiPropertyOptional({ enum: OCCUPANCY_STATUSES })
  @IsOptional()
  @IsIn(OCCUPANCY_STATUSES)
  status?: OccupancyStatus;
}

/** Body of `POST /admin/bookings/{id}/cancel`. */
export class AdminCancelDto {
  @ApiProperty({ example: 'Teren indisponibil' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
