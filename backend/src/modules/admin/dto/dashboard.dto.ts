import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, Matches } from 'class-validator';
import type { ResourceAvailabilityView } from '../../availability/grid';

export class DashboardQueryDto {
  @ApiPropertyOptional({ format: 'date', example: '2026-11-05', description: 'Implicit ziua curentă.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  date?: string;
}

/** `Dashboard` schema (FR-43). */
export class DashboardResponse {
  @ApiProperty({ format: 'date', example: '2026-11-05' }) date: string;
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Grila zilei pentru fiecare resursă activă (`ResourceAvailability`).',
  })
  resources: ResourceAvailabilityView[];
  @ApiProperty({ example: 41 }) check_ins_count: number;
  @ApiProperty({ example: 3 }) no_shows_count: number;
}
