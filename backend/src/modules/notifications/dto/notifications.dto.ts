import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PushKeysDto {
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(200) p256dh: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(100) auth: string;
}

/** `PushSubscriptionInput` schema (the browser's PushSubscription.toJSON()). */
export class PushSubscriptionInputDto {
  @ApiProperty({ format: 'uri', example: 'https://push.example.com/send/abc123' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  endpoint: string;

  @ApiProperty({ type: PushKeysDto })
  @IsObject()
  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

export class PushSubscriptionResponse extends PushSubscriptionInputDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) created_at: string;
}

/** `NotificationPreferences` schema. */
export class NotificationPreferencesDto {
  @ApiProperty({ example: true }) @IsBoolean() push: boolean;
  @ApiProperty({ example: true }) @IsBoolean() email: boolean;
  @ApiProperty({ example: false }) @IsBoolean() sms: boolean;

  @ApiPropertyOptional({ enum: ['ro', 'en'], default: 'ro' })
  @IsOptional()
  @IsIn(['ro', 'en'])
  language?: 'ro' | 'en';
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * `AnnouncementCreate` schema (FR-38). At least one of `resource_id` and `start` + `end` is required;
 * the service checks the combination.
 */
export class AnnouncementCreateDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  resource_id?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-11-12T08:00:00+02:00' })
  @IsOptional()
  @IsISO8601({ strict: true })
  start?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-11-12T12:00:00+02:00' })
  @IsOptional()
  @IsISO8601({ strict: true })
  end?: string;

  @ApiProperty({ example: 'Vestiarele sunt închise astăzi până la ora 12:00.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message_ro: string;

  @ApiPropertyOptional({ example: 'The changing rooms are closed today until 12:00.' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message_en?: string;
}

export class AnnouncementResultResponse {
  @ApiProperty({ example: 23 }) recipients_count: number;
}
