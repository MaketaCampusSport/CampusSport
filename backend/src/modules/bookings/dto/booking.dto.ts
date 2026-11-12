import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Min, ValidateIf } from 'class-validator';
import { PageQueryDto } from '../../../common/http/pagination';
import { CANCEL_SOURCES, OCCUPANCY_STATUSES } from '../../../database/enums';
import type { CancelSource, OccupancyStatus } from '../../../database/enums';

/** `BookingCreate` schema. */
export class BookingCreateDto {
  @ApiProperty({ format: 'uuid', example: '7d2f4c1e-3a5b-4e8f-9c10-2b6a1d3e5f70' })
  @IsUUID()
  resource_id: string;

  @ApiProperty({ format: 'date-time', example: '2026-11-12T18:00:00+02:00', description: 'Începutul unui slot al resursei.' })
  @IsISO8601({ strict: true })
  start: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatoriu doar dacă este activă o cotă separată per sport (FR-25).' })
  @IsOptional()
  @IsUUID()
  sport_id?: string;

  @ApiPropertyOptional({ minimum: 1, example: 8, description: 'Rezervare pentru echipă; nu poate depăși `capacity`.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  participants_count?: number;

  @ApiPropertyOptional({ default: false, description: 'Preia slotul unui extern (FR-24).' })
  @IsOptional()
  @IsBoolean()
  replace_external?: boolean;
}

/** `Booking` schema. */
export class BookingResponse {
  @ApiProperty({ format: 'uuid', example: 'e3a94f60-1b2c-4d7e-8f05-6c2b9a0d4e11' }) id: string;
  @ApiProperty({ format: 'uuid' }) resource_id: string;
  @ApiProperty({ example: 'Teren baschet 2' }) resource_name: string;
  @ApiProperty({ format: 'uuid', nullable: true, description: 'Devine `null` după anonimizare.' }) user_id: string | null;
  @ApiProperty({ format: 'date-time', example: '2026-11-12T18:00:00+02:00' }) start: string;
  @ApiProperty({ format: 'date-time', example: '2026-11-12T19:00:00+02:00' }) end: string;
  @ApiProperty({ enum: OCCUPANCY_STATUSES }) status: OccupancyStatus;
  @ApiPropertyOptional({ enum: CANCEL_SOURCES }) cancel_source?: CancelSource;
  @ApiPropertyOptional({ nullable: true }) cancel_reason?: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) checked_in_at: string | null;
  @ApiProperty({ nullable: true, example: 8 }) participants_count: number | null;
  @ApiPropertyOptional({ example: 'e3a94f60.a91c07d2.5f2b8c', description: 'Doar pentru titular, cât timp rezervarea e activă.' })
  qr_token?: string;
  @ApiPropertyOptional({ example: 'Gata! Te așteptăm joi la 18:00 pe Teren baschet 2.' }) message_ro?: string;
  @ApiPropertyOptional({ example: 'All set! See you Thursday at 18:00 on Teren baschet 2.' }) message_en?: string;
}

export class CancellationResultResponse {
  @ApiProperty({ type: BookingResponse }) booking: BookingResponse;
  @ApiProperty({ description: '`true` dacă intrarea a fost restituită.' }) quota_refunded: boolean;
}

/** `CheckInRequest` schema. */
export class CheckInDto {
  @ApiProperty({ enum: ['qr', 'button'] })
  @IsIn(['qr', 'button'])
  method: 'qr' | 'button';

  @ApiPropertyOptional({ example: 'e3a94f60.a91c07d2.5f2b8c', description: 'Obligatoriu pentru `method = qr`.' })
  @ValidateIf((o: CheckInDto) => o.method === 'qr')
  @IsString()
  qr_token?: string;
}

/** `CheckInResult` schema. */
export class CheckInResultResponse {
  @ApiProperty({ format: 'uuid' }) booking_id: string;
  @ApiProperty({ format: 'date-time' }) checked_in_at: string;
  @ApiProperty({ example: 'Ion Popescu' }) holder_name: string;
  @ApiProperty({ enum: ['member', 'external'] }) category: 'member' | 'external';
}

export class MyBookingsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'history'], default: 'upcoming' })
  @IsOptional()
  @IsIn(['upcoming', 'history'])
  scope: 'upcoming' | 'history' = 'upcoming';
}

export class BookingPage {
  @ApiProperty() page: number;
  @ApiProperty() page_size: number;
  @ApiProperty() total: number;
  @ApiProperty({ type: [BookingResponse] }) items: BookingResponse[];
}

/** `Quota` schema. */
export class QuotaResponse {
  @ApiProperty({ format: 'date', example: '2026-11-01', description: 'Prima zi a lunii.' }) month: string;
  @ApiProperty({ example: 4 }) limit: number;
  @ApiProperty({ example: 3, description: 'Intrări folosite, inclusiv cele restituite ulterior.' }) used: number;
  @ApiProperty({ example: 1 }) refunded: number;
  @ApiProperty({ example: 2 }) remaining: number;
  @ApiProperty({ example: false }) over_quota_last_24h_only: boolean;
}
