import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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

  @ApiProperty({ format: 'date-time', readOnly: true })
  created_at: string;
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
