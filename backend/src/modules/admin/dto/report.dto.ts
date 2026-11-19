import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, Matches } from 'class-validator';

export const REPORT_FORMATS = ['json', 'csv', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export const REPORT_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class ReportQueryDto {
  @ApiProperty({
    pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
    example: '2026-10',
    description: 'Luna raportului, `AAAA-LL`.',
  })
  @Matches(REPORT_MONTH, { message: 'month must be YYYY-MM' })
  month: string;

  @ApiPropertyOptional({ enum: REPORT_FORMATS, default: 'json' })
  @IsOptional()
  @IsIn(REPORT_FORMATS)
  format: ReportFormat = 'json';
}

export class HourRate {
  @ApiProperty({ minimum: 0, maximum: 23, example: 18 }) hour: number;
  @ApiProperty({ format: 'float', example: 0.95 }) rate: number;
}

export class ResourceOccupancy {
  @ApiProperty({ format: 'uuid' }) resource_id: string;
  @ApiProperty({ example: 'Teren baschet 2' }) resource_name: string;
  @ApiProperty({ format: 'float', minimum: 0, maximum: 1, example: 0.72 }) rate: number;
  @ApiProperty({ type: [HourRate] }) by_hour: HourRate[];
}

export class BookingsByCategory {
  @ApiProperty({ example: 812 }) members: number;
  @ApiProperty({ example: 64 }) externals: number;
}

/** `MonthlyReport` schema (FR-44). */
export class MonthlyReportResponse {
  @ApiProperty({ example: '2026-10' }) month: string;
  @ApiProperty({ type: [ResourceOccupancy], description: 'Gradul de ocupare per resursă și oră.' })
  occupancy: ResourceOccupancy[];
  @ApiProperty({ example: 37 }) no_shows_count: number;
  @ApiProperty({ type: BookingsByCategory }) bookings_by_category: BookingsByCategory;
  @ApiProperty({ example: 58 }) users_reaching_limit_count: number;
}
