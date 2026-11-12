import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Role } from '../../database/enums';
import { AppException } from '../errors/app.exception';
import { AUTH_USER_LOADER } from './auth.types';
import type { AccessTokenPayload, AuthUser, AuthUserLoader } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

export function bearerToken(req: Pick<Request, 'headers'>): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Global guard. Every route needs a valid access JWT unless marked @Public();
 * @Roles() restricts further (401 UNAUTHENTICATED / 403 FORBIDDEN).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @Inject(AUTH_USER_LOADER) private readonly users: AuthUserLoader,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ?? false;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();

    const user = await this.authenticate(req);
    if (user) req.user = user;
    if (isPublic) return true;
    if (!user) throw new AppException('UNAUTHENTICATED');
    if (roles?.length && !roles.includes(user.role)) throw new AppException('FORBIDDEN');
    return true;
  }

  private async authenticate(req: Request): Promise<AuthUser | null> {
    const token = bearerToken(req);
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      if (payload.typ !== 'access' || !payload.sub) return null;
      return await this.users.load(payload.sub);
    } catch {
      return null;
    }
  }
}
