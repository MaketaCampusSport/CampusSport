import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { API_PREFIX } from '../../../app.setup';
import { PageQueryDto } from '../../../common/http/pagination';
import { toIsoInZone, toIsoOrNull } from '../../../common/time';
import type { User } from '../../../database/entities';
import { ACCOUNT_STATUSES, ROLES } from '../../../database/enums';
import type { AccountStatus, Role } from '../../../database/enums';

/** `User` schema. */
export class UserResponse {
  @ApiProperty({ format: 'uuid', readOnly: true })
  id: string;

  @ApiProperty({ example: 'Ion Popescu' })
  full_name: string;

  @ApiProperty({ format: 'email', example: 'ion.popescu@student.example.edu' })
  email: string;

  @ApiProperty({ nullable: true, example: '+37360000000', description: 'Obligatoriu doar pentru externi.' })
  phone: string | null;

  @ApiProperty({ enum: ROLES })
  role: Role;

  @ApiProperty({ enum: ACCOUNT_STATUSES })
  status: AccountStatus;

  @ApiProperty({ format: 'date-time', nullable: true })
  suspended_until: string | null;

  @ApiProperty({
    nullable: true,
    readOnly: true,
    description: 'Calea fotografiei de profil (`GET /users/{id}/avatar`), cu versiunea în `v`.',
  })
  avatar_url: string | null;

  @ApiProperty({ format: 'date-time', readOnly: true })
  created_at: string;
}

/** Same-origin path of the photo; `v` changes with every upload, so browsers may cache it for good. */
export function avatarUrl(u: Pick<User, 'id' | 'avatarUpdatedAt'>): string | null {
  return u.avatarUpdatedAt ? `/${API_PREFIX}/users/${u.id}/avatar?v=${u.avatarUpdatedAt.getTime()}` : null;
}

export function toUserResponse(u: User, zone: string): UserResponse {
  return {
    id: u.id,
    full_name: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    suspended_until: toIsoOrNull(u.suspendedUntil, zone),
    avatar_url: avatarUrl(u),
    created_at: toIsoInZone(u.createdAt, zone),
  };
}

export class UserPage {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  page_size: number;

  @ApiProperty({ example: 57 })
  total: number;

  @ApiProperty({ type: [UserResponse] })
  items: UserResponse[];
}

export class ListUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Text căutat în nume sau email.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @ApiPropertyOptional({ enum: ACCOUNT_STATUSES })
  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  status?: AccountStatus;
}

export class SuspendUserDto {
  @ApiProperty({ format: 'date-time', example: '2026-11-26T00:00:00+02:00' })
  @IsISO8601({ strict: true })
  until: string;

  @ApiProperty({ example: 'No-show-uri repetate' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
/** Empty string means "no phone". */
const phone = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value);
const E164 = /^\+[1-9]\d{7,14}$/;

/** `UserCreate` schema: an administrator creates any role. */
export class CreateUserDto {
  @ApiProperty({ maxLength: 120, example: 'Elena Munteanu' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name: string;

  @ApiProperty({ format: 'email', example: 'elena.munteanu@example.edu' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ nullable: true, pattern: E164.source, example: '+37360000002' })
  @Transform(phone)
  @IsOptional()
  @Matches(E164)
  phone?: string | null;

  @ApiProperty({ enum: ROLES })
  @IsIn(ROLES)
  role: Role;

  @ApiProperty({ format: 'password', minLength: 8, maxLength: 128, example: 'parola123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

/** `UserUpdate` schema: only the fields that change. `phone: null` clears it. */
export class UpdateUserDto {
  @ApiPropertyOptional({ maxLength: 120 })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name?: string;

  @ApiPropertyOptional({ format: 'email' })
  @Transform(lower)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ nullable: true, pattern: E164.source })
  @Transform(phone)
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @Matches(E164)
  phone?: string | null;

  @ApiPropertyOptional({ enum: ROLES })
  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @ApiPropertyOptional({ format: 'password', minLength: 8, maxLength: 128 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
