import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateNested } from 'class-validator';

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
