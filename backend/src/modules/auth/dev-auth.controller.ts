import { Body, Controller, Get, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import type { Response } from 'express';
import { Public } from '../../common/auth/decorators';
import { TokenService } from '../../common/auth/token.service';
import { AppException } from '../../common/errors/app.exception';
import { APP_CONFIG } from '../../config/configuration';
import type { AppConfig } from '../../config/configuration';
import type { SessionResponse } from './dto/auth.dto';
import { SessionsService } from './sessions.service';
import { UsersService } from './users.service';

export class DevLoginDto {
  @IsEmail()
  email: string;
}

export interface DevLoginUser {
  email: string;
  full_name: string;
  role: string;
}

/**
 * Development-only sign-in without SSO, Keycloak or 2FA, so the PWA can be used on a machine without
 * them. Not part of the API contract (assets/livrabil05/openapi.yaml): hidden from Swagger, and every
 * route answers 404 unless NODE_ENV=development and DEV_LOGIN is not `false`.
 */
@ApiExcludeController()
@Public()
@Controller('auth/dev')
export class DevAuthController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private assertEnabled(): void {
    if (!this.config.devLogin) throw new AppException('NOT_FOUND');
  }

  @Get('users')
  async list(): Promise<DevLoginUser[]> {
    this.assertEnabled();
    const users = await this.users.listActive();
    return users.map((u) => ({ email: u.email, full_name: u.fullName, role: u.role }));
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: DevLoginDto, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
    this.assertEnabled();
    const user = await this.users.findByEmail(dto.email);
    if (!user || user.status !== 'active') throw new AppException('NOT_FOUND');
    this.sessions.setCookie(res, await this.sessions.create(user));
    await this.users.touch(user.id);
    return { ...(await this.tokens.signAccess(user)), user: this.users.toResponse(user) };
  }
}
