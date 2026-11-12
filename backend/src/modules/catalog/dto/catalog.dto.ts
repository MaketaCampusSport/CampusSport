import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { Resource, Sport, WeeklyHours } from '../../../database/entities';
import { EXTERNAL_ACCESS } from '../../../database/enums';
import type { ExternalAccess } from '../../../database/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

// ---------- Sports ----------

/** `SportInput` schema. */
export class SportInputDto {
  @ApiProperty({ example: 'Baschet' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name_ro: string;

  @ApiProperty({ example: 'Basketball' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name_en: string;

  @ApiProperty({ example: 'basketball' })
  @IsString()
  @Matches(/^[a-z0-9-]{1,40}$/)
  icon: string;

  @ApiProperty({ type: [String], example: ['panou'], description: 'Dotările pe care trebuie să le aibă o resursă.' })
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  required_equipment: string[];
}

export class SportResponse extends SportInputDto {
  @ApiProperty({ format: 'uuid', example: '5b1a8e02-6c7d-4f31-b2a9-0e4d7c9f1a26' })
  id: string;
}

export function toSportResponse(s: Sport): SportResponse {
  return { id: s.id, name_ro: s.nameRo, name_en: s.nameEn, icon: s.icon, required_equipment: s.requiredEquipment };
}

// ---------- Resources ----------

export class TimeRangeDto {
  @ApiProperty({ example: '07:00' })
  @Matches(HHMM)
  open: string;

  @ApiProperty({ example: '22:00' })
  @Matches(HHMM)
  close: string;
}

/** `WeeklyHours`: a missing day means closed. */
export class WeeklyHoursDto {
  @ApiPropertyOptional({ type: [TimeRangeDto] }) @IsOptional() @ValidateNested({ each: true }) @Type(() => TimeRangeDto)
  mon?: TimeRangeDto[];

  @ApiPropertyOptional({ type: [TimeRangeDto] }) @IsOptional() @ValidateNested({ each: true }) @Type(() => TimeRangeDto)
  tue?: TimeRangeDto[];

  @ApiPropertyOptional({ type: [TimeRangeDto] }) @IsOptional() @ValidateNested({ each: true }) @Type(() => TimeRangeDto)
  wed?: TimeRangeDto[];

  @ApiPropertyOptional({ type: [TimeRangeDto] }) @IsOptional() @ValidateNested({ each: true }) @Type(() => TimeRangeDto)
  thu?: TimeRangeDto[];

  @ApiPropertyOptional({ type: [TimeRangeDto] }) @IsOptional() @ValidateNested({ each: true }) @Type(() => TimeRangeDto)
  fri?: TimeRangeDto[];

  @ApiPropertyOptional({ type: [TimeRangeDto] }) @IsOptional() @ValidateNested({ each: true }) @Type(() => TimeRangeDto)
  sat?: TimeRangeDto[];

  @ApiPropertyOptional({ type: [TimeRangeDto] }) @IsOptional() @ValidateNested({ each: true }) @Type(() => TimeRangeDto)
  sun?: TimeRangeDto[];
}

/** `ResourceInput` for POST: name, type, location, capacity, sport_ids and opening_hours are required. */
export class ResourceCreateDto {
  @ApiProperty({ example: 'Teren baschet 2' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'teren' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  type: string;

  @ApiProperty({ example: '47.0245,28.8322', description: 'Adresă sau coordonate pentru hartă.' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  location: string;

  @ApiPropertyOptional({ format: 'uri', nullable: true, example: 'https://campussport.example/media/teren-baschet-2.jpg' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'], require_tld: false })
  photo_url?: string | null;

  @ApiProperty({ minimum: 1, example: 10 })
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiPropertyOptional({ type: [String], example: ['panou', 'minge baschet', 'vestiar'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  equipment?: string[];

  @ApiProperty({ type: [String], format: 'uuid', description: 'Sporturile permise pe resursă.' })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  sport_ids: string[];

  @ApiProperty({ type: WeeklyHoursDto })
  @IsObject()
  @ValidateNested()
  @Type(() => WeeklyHoursDto)
  opening_hours: WeeklyHoursDto;

  @ApiPropertyOptional({ minimum: 15, example: 60, description: 'Dacă lipsește, `default_slot_minutes` din setări.' })
  @IsOptional()
  @IsInt()
  @Min(15)
  slot_minutes?: number;

  @ApiPropertyOptional({ enum: EXTERNAL_ACCESS })
  @IsOptional()
  @IsIn(EXTERNAL_ACCESS)
  external_access?: ExternalAccess;

  @ApiPropertyOptional({ type: WeeklyHoursDto, nullable: true, description: 'Folosit doar când `external_access` este `window`.' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @ValidateNested()
  @Type(() => WeeklyHoursDto)
  external_access_windows?: WeeklyHoursDto | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** PATCH /admin/resources/{id}: only the changed fields are sent. */
export class ResourcePatchDto extends PartialType(ResourceCreateDto) {}

export class ResourceResponse {
  @ApiProperty({ format: 'uuid', example: '7d2f4c1e-3a5b-4e8f-9c10-2b6a1d3e5f70' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() location: string;
  @ApiProperty({ nullable: true }) photo_url: string | null;
  @ApiProperty() capacity: number;
  @ApiProperty({ type: [String] }) equipment: string[];
  @ApiProperty({ type: [String], format: 'uuid' }) sport_ids: string[];
  @ApiProperty({ type: WeeklyHoursDto }) opening_hours: WeeklyHours;
  @ApiProperty() slot_minutes: number;
  @ApiProperty({ enum: EXTERNAL_ACCESS }) external_access: ExternalAccess;
  @ApiProperty({ type: WeeklyHoursDto, nullable: true }) external_access_windows: WeeklyHours | null;
  @ApiProperty() active: boolean;
}

export function toResourceResponse(r: Resource): ResourceResponse {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    location: r.location,
    photo_url: r.photoUrl,
    capacity: r.capacity,
    equipment: r.equipment,
    sport_ids: (r.sports ?? []).map((s) => s.id).sort(),
    opening_hours: r.openingHours,
    slot_minutes: r.slotMinutes,
    external_access: r.externalAccess,
    external_access_windows: r.externalAccessWindows,
    active: r.active,
  };
}

export class ListResourcesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Identificatorul sportului.' })
  @IsOptional()
  @IsUUID()
  sport?: string;

  @ApiPropertyOptional({ default: false, description: 'Include resursele dezactivate. Ignorat dacă apelantul nu este admin.' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  include_inactive?: boolean;
}
