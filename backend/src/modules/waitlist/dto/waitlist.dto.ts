import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';
import { toIsoInZone, toIsoOrNull } from '../../../common/time';
import type { WaitlistEntry } from '../../../database/entities';
import { WAITLIST_STATUSES } from '../../../database/enums';
import type { WaitlistStatus } from '../../../database/enums';

/** `WaitlistJoin`: slot entry (resource_id, day, start, end) or subscription (sport_id, day). */
export class WaitlistJoinDto {
  @ApiProperty({ format: 'date', example: '2026-11-12' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsISO8601({ strict: true })
  day: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Lipsește la abonare (orice resursă compatibilă).' })
  @IsOptional()
  @IsUUID()
  resource_id?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatoriu la abonare.' })
  @IsOptional()
  @IsUUID()
  sport_id?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Obligatoriu la înscrierea pe slot.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  start?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Obligatoriu la înscrierea pe slot.' })
  @IsOptional()
  @IsISO8601({ strict: true })
  end?: string;
}

export class SlotReferenceResponse {
  @ApiProperty({ format: 'uuid' }) resource_id: string;
  @ApiProperty({ format: 'date-time' }) start: string;
  @ApiProperty({ format: 'date-time' }) end: string;
}

/** `WaitlistEntry` schema. */
export class WaitlistEntryResponse {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date', example: '2026-11-12' }) day: string;
  @ApiProperty({ format: 'uuid', nullable: true }) resource_id: string | null;
  @ApiProperty({ format: 'uuid', nullable: true }) sport_id: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) start: string | null;
  @ApiProperty({ format: 'date-time', nullable: true }) end: string | null;
  @ApiProperty({ example: 2, description: '1 profesor, 2 student, 3 extern.' }) priority: number;
  @ApiProperty({ enum: WAITLIST_STATUSES }) status: WaitlistStatus;
  @ApiProperty({ format: 'date-time', nullable: true }) offered_at: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, description: '`null` când oferta merge la toți simultan.' })
  offer_expires_at: string | null;
  @ApiPropertyOptional({ type: SlotReferenceResponse }) offered_slot?: SlotReferenceResponse;
}

export function toWaitlistResponse(e: WaitlistEntry, zone: string): WaitlistEntryResponse {
  const response: WaitlistEntryResponse = {
    id: e.id,
    day: e.day,
    resource_id: e.resourceId,
    sport_id: e.sportId,
    start: e.period ? toIsoInZone(e.period.start, zone) : null,
    end: e.period?.end ? toIsoInZone(e.period.end, zone) : null,
    priority: e.priority,
    status: e.status,
    offered_at: toIsoOrNull(e.offeredAt, zone),
    offer_expires_at: toIsoOrNull(e.offerExpiresAt, zone),
  };
  if (e.status === 'offered' && e.offeredResourceId && e.offeredPeriod?.end) {
    response.offered_slot = {
      resource_id: e.offeredResourceId,
      start: toIsoInZone(e.offeredPeriod.start, zone),
      end: toIsoInZone(e.offeredPeriod.end, zone),
    };
  }
  return response;
}
