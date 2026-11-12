import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiConflictResponse,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/decorators';
import { TokenService } from '../../common/auth/token.service';
import { AppException } from '../../common/errors/app.exception';
import type { User } from '../../database/entities';
import { AuthFlowsService } from './auth-flows.service';
import {
  ExternalLoginDto,
  ExternalRegistrationDto,
  ExternalVerifyDto,
  OtpSentResponse,
  SessionResponse,
  SsoCallbackQueryDto,
  SsoLoginQueryDto,
  TwoFactorVerifyDto,
} from './dto/auth.dto';
import { REFRESH_COOKIE, SessionsService } from './sessions.service';
import { UsersService } from './users.service';

/** OTP and 2FA endpoints: 5 attempts per minute per caller. */
const STRICT = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly flows: AuthFlowsService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
  ) {}

  @Public()
  @Get('sso/login')
  @ApiOperation({ operationId: 'ssoLogin', summary: 'Redirecționare către SSO-ul universității' })
  @ApiFoundResponse({ description: 'Redirecționare către furnizorul de identitate.' })
  async ssoLogin(@Query() query: SsoLoginQueryDto, @Res() res: Response): Promise<void> {
    res.redirect(302, await this.flows.startSso(query.return_to));
  }

  @Public()
  @Get('sso/callback')
  @ApiOperation({ operationId: 'ssoCallback', summary: 'Revenire de la furnizorul SSO' })
  @ApiFoundResponse({ description: 'Redirecționare către PWA; administratorii trec întâi prin 2FA.' })
  async ssoCallback(@Query() query: SsoCallbackQueryDto, @Res() res: Response): Promise<void> {
    const result = await this.flows.finishSso({ ...query } as Record<string, string>);
    if (result.kind === 'member') await this.startSession(result.user, res);
    res.redirect(302, result.redirectTo);
  }

  @Public()
  @Throttle(STRICT)
  @Post('2fa/verify')
  @HttpCode(200)
  @ApiOperation({ operationId: 'verifyTwoFactor', summary: 'Al doilea pas de autentificare pentru administratori' })
  @ApiOkResponse({ type: SessionResponse, description: 'Sesiune de administrator creată (valabilă 8 ore).' })
  @ApiUnauthorizedResponse({ description: 'Cod greșit sau provocare expirată (`OTP_INVALID`).' })
  @ApiTooManyRequestsResponse()
  async verifyTwoFactor(
    @Body() dto: TwoFactorVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const user = await this.flows.verifySecondFactor(dto.challenge_id, dto.code);
    return this.startSession(user, res);
  }

  @Public()
  @Throttle(STRICT)
  @Post('external/register')
  @HttpCode(202)
  @ApiOperation({ operationId: 'registerExternal', summary: 'Înregistrare extern' })
  @ApiAcceptedResponse({ type: OtpSentResponse, description: 'Coduri OTP trimise.' })
  @ApiConflictResponse({ description: 'Există deja un cont cu acest email (`EMAIL_ALREADY_USED`).' })
  registerExternal(@Body() dto: ExternalRegistrationDto): Promise<OtpSentResponse> {
    return this.flows.registerExternal(dto);
  }

  @Public()
  @Throttle(STRICT)
  @Post('external/login')
  @HttpCode(202)
  @ApiOperation({ operationId: 'loginExternal', summary: 'Solicitare cod OTP pentru un extern deja înregistrat' })
  @ApiAcceptedResponse({ type: OtpSentResponse })
  loginExternal(@Body() dto: ExternalLoginDto): Promise<OtpSentResponse> {
    return this.flows.requestExternalLogin(dto);
  }

  @Public()
  @Throttle(STRICT)
  @Post('external/verify')
  @HttpCode(200)
  @ApiOperation({ operationId: 'verifyExternal', summary: 'Verifică OTP și emite JWT' })
  @ApiOkResponse({ type: SessionResponse })
  @ApiUnauthorizedResponse({ description: 'Cod OTP greșit sau expirat (`OTP_INVALID`).' })
  async verifyExternal(
    @Body() dto: ExternalVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    const user = await this.flows.verifyExternal(dto);
    return this.startSession(user, res);
  }

  /** Authenticated by the refresh cookie, not by a bearer token. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ operationId: 'refreshSession', summary: 'Emite un nou JWT de acces' })
  @ApiBody({ required: false, schema: {} })
  @ApiOkResponse({ type: SessionResponse, description: 'JWT nou; cookie-ul este rotit.' })
  @ApiUnauthorizedResponse()
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionResponse> {
    const session = await this.sessions.rotate(req.cookies?.[REFRESH_COOKIE], async (userId) => {
      const user = await this.users.getById(userId).catch(() => null);
      return user?.role ?? null;
    });
    if (!session) {
      this.sessions.clearCookie(res);
      throw new AppException('UNAUTHENTICATED');
    }
    this.sessions.setCookie(res, session);
    const user = await this.users.getById(session.userId);
    await this.users.touch(user.id);
    return { ...(await this.tokens.signAccess(user)), user: this.users.toResponse(user) };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ operationId: 'logout', summary: 'Închide sesiunea' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.sessions.revoke(req.cookies?.[REFRESH_COOKIE]);
    this.sessions.clearCookie(res);
  }

  private async startSession(user: User, res: Response): Promise<SessionResponse> {
    this.sessions.setCookie(res, await this.sessions.create(user));
    return { ...(await this.tokens.signAccess(user)), user: this.users.toResponse(user) };
  }
}
