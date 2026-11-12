import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination';
import { BLOCK_KINDS } from '../../../database/enums';
import type { BlockKind } from '../../../database/enums';

/** `Recurrence` schema. */
export class RecurrenceDto {
  @ApiProperty({ example: 'FREQ=WEEKLY;BYDAY=TU', description: 'Regulă RRULE iCal.' })
  @IsString()
  @Matches(/^FREQ=/)
  rule: string;

  @ApiProperty({ format: 'date', example: '2027-02-01' })
  @IsISO8601({ strict: true })
  valid_from: string;

  @ApiProperty({ format: 'date', example: '2027-06-13' })
  @IsISO8601({ strict: true })
  valid_to: string;
}

/** `BlockCreate` schema. */
export class BlockCreateDto {
  @ApiProperty({ format: 'uuid', example: '2c9e7a10-84b1-4f6d-a3c2-91de0f4b7a33' })
  @IsUUID()
  resource_id: string;

  @ApiProperty({ enum: ['emergency', 'maintenance'] })
  @IsIn(['emergency', 'maintenance'])
  kind: 'emergency' | 'maintenance';

  @ApiProperty({ example: 'Avarie' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Implicit acum.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  start?: string;

  @ApiPropertyOptional({ format: 'date-time', nullable: true, description: '`null` înseamnă „până la noi ordine”.' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsISO8601({ strict: true })
  end?: string | null;

  @ApiPropertyOptional({ type: RecurrenceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecurrenceDto)
  recurrence?: RecurrenceDto;
}

/** `Block` schema. */
export class BlockResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) resource_id: string;
  @ApiProperty({ enum: BLOCK_KINDS }) kind: BlockKind;
  @ApiProperty({ format: 'date-time' }) start: string;
  @ApiProperty({ format: 'date-time', nullable: true }) end: string | null;
  @ApiProperty({ example: 'Avarie' }) reason: string;
  @ApiProperty({ format: 'uuid', nullable: true }) recurrence_id: string | null;
  @ApiProperty({ format: 'uuid' }) created_by: string;
}

/** `BlockResult` schema. */
export class BlockResultResponse {
  @ApiProperty({ type: BlockResponse }) block: BlockResponse;
  @ApiProperty({ example: 23 }) cancelled_bookings_count: number;
  @ApiProperty({ example: 0, description: 'Blocări de nivel inferior înlăturate (SRS 9.1).' }) superseded_blocks_count: number;
  @ApiProperty({ example: 23 }) notified_users_count: number;
}

/** `DeliveryStatus` schema. */
export class DeliveryStatusResponse {
  @ApiProperty({ example: 23 }) notified: number;
  @ApiProperty({ example: 21 }) delivered: number;
  @ApiProperty({ example: 0 }) failed: number;
  @ApiProperty({ example: { push: 19, email: 23, sms: 4 } }) by_channel: { push: number; email: number; sms: number };
}

export class ListBlocksQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  resource?: string;

  @ApiPropertyOptional({ enum: BLOCK_KINDS })
  @IsOptional()
  @IsIn(BLOCK_KINDS)
  kind?: BlockKind;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class BlockPage {
  @ApiProperty() page: number;
  @ApiProperty() page_size: number;
  @ApiProperty() total: number;
  @ApiProperty({ type: [BlockResponse] }) items: BlockResponse[];
}
