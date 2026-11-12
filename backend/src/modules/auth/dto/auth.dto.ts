import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { UserResponse } from './user.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

/** `Session` schema. */
export class SessionResponse {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiJ9.e30.c2lnbmF0dXJl' })
  access_token: string;

  @ApiProperty({ enum: ['Bearer'] })
  token_type: 'Bearer';

  @ApiProperty({ example: 900, description: 'Durata de viață în secunde.' })
  expires_in: number;

  @ApiProperty({ type: UserResponse })
  user: UserResponse;
}

/** `OtpSent` schema. */
export class OtpSentResponse {
  @ApiProperty({ example: 600, description: 'Valabilitatea codului, în secunde.' })
  expires_in: number;
}

export class SsoLoginQueryDto {
  @ApiPropertyOptional({ example: '/start', description: 'Ruta din PWA la care se revine după autentificare.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  return_to?: string;
}

export class SsoCallbackQueryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  state: string;

  @ApiPropertyOptional({ description: 'Parametru adăugat de unii furnizori (RFC 9207).' })
  @IsOptional()
  @IsString()
  iss?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  session_state?: string;
}

export class TwoFactorVerifyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  challenge_id: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}

/** `ExternalRegistration` schema. */
export class ExternalRegistrationDto {
  @ApiProperty({ maxLength: 120, example: 'Ana Rusu' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  full_name: string;

  @ApiProperty({ format: 'email', example: 'ana.rusu@example.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ pattern: '^\\+[1-9]\\d{7,14}$', example: '+37360000001', description: 'Format E.164.' })
  @Transform(trim)
  @Matches(/^\+[1-9]\d{7,14}$/)
  phone: string;
}

export class ExternalLoginDto {
  @ApiProperty({ format: 'email', example: 'ana.rusu@example.com' })
  @Transform(lower)
  @IsEmail()
  email: string;
}

export class ExternalVerifyDto {
  @ApiProperty({ format: 'email', example: 'ana.rusu@example.com' })
  @Transform(lower)
  @IsEmail()
  email: string;

  @ApiProperty({ example: '583021' })
  @IsString()
  @Matches(/^\d{6}$/)
  email_code: string;

  @ApiPropertyOptional({ example: '190274', description: 'Obligatoriu doar la prima verificare a contului.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  phone_code?: string;
}
