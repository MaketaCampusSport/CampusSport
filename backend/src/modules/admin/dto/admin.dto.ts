import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsISO8601, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination';

/** `Settings` schema (SRS 9.2); the example values are the defaults. */
export class SettingsDto {
  @ApiProperty({ example: 4, description: 'BR-01.' }) @IsInt() @Min(0) @Max(100) monthly_quota: number;

  @ApiPropertyOptional({ example: {}, description: 'Cotă separată per sport (FR-25), cu `sport_id` drept cheie.' })
  @IsOptional()
  @IsObject()
  monthly_quota_per_sport?: Record<string, number>;

  @ApiProperty({ example: 2, description: 'BR-02.' }) @IsInt() @Min(1) @Max(50) max_active_bookings: number;
  @ApiProperty({ example: 7, description: 'BR-03.' }) @IsInt() @Min(1) @Max(365) booking_window_days_student: number;
  @ApiProperty({ example: 14, description: 'BR-03.' }) @IsInt() @Min(1) @Max(365) booking_window_days_teacher: number;
  @ApiProperty({ example: 24, description: 'BR-03.' }) @IsInt() @Min(1) @Max(24 * 30) booking_window_hours_external: number;
  @ApiProperty({ example: 2, description: 'BR-04.' }) @IsInt() @Min(0) @Max(72) cancel_free_hours: number;
  @ApiProperty({ example: 10, description: 'BR-05.' }) @IsInt() @Min(0) @Max(120) checkin_minutes_before: number;
  @ApiProperty({ example: 15, description: 'BR-05.' }) @IsInt() @Min(0) @Max(120) checkin_minutes_after: number;
  @ApiProperty({ example: 3, description: 'BR-06.' }) @IsInt() @Min(1) @Max(100) no_show_threshold: number;
  @ApiProperty({ example: 14, description: 'BR-06.' }) @IsInt() @Min(0) @Max(365) no_show_suspension_days: number;
  @ApiProperty({ example: 10, description: 'BR-07.' }) @IsInt() @Min(1) @Max(1440) waitlist_offer_minutes: number;
  @ApiProperty({ example: 2, description: 'BR-07.' }) @IsInt() @Min(0) @Max(72) waitlist_simultaneous_under_hours: number;
  @ApiProperty({ example: 60, description: 'BR-08.' }) @IsInt() @Min(15) @Max(480) default_slot_minutes: number;
  @ApiProperty({ example: false, description: 'FR-24.' }) @IsBoolean() member_replaces_external: boolean;
}

export class SettingsResponse extends SettingsDto {
  @ApiProperty({ format: 'uuid', nullable: true, readOnly: true }) updated_by: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, readOnly: true }) updated_at: string | null;
}

export class AuditQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() actor?: string;
  @ApiPropertyOptional({ example: 'resource' }) @IsOptional() @IsString() @MaxLength(60) entity?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601({ strict: true }) from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601({ strict: true }) to?: string;
}

/** `AuditEntry` schema. */
export class AuditEntryResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid', nullable: true }) actor_id: string | null;
  @ApiProperty({ example: 'block.create' }) action: string;
  @ApiProperty({ example: 'occupancy' }) entity: string;
  @ApiProperty({ format: 'uuid', nullable: true }) entity_id: string | null;
  @ApiProperty({ nullable: true }) before: Record<string, unknown> | null;
  @ApiProperty({ nullable: true }) after: Record<string, unknown> | null;
  @ApiProperty({ format: 'date-time' }) at: string;
}

export class AuditPage {
  @ApiProperty() page: number;
  @ApiProperty() page_size: number;
  @ApiProperty() total: number;
  @ApiProperty({ type: [AuditEntryResponse] }) items: AuditEntryResponse[];
}
