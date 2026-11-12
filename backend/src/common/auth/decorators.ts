import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '../../database/enums';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'campussport:isPublic';
export const ROLES_KEY = 'campussport:roles';

/** `x-min-role: public`. A valid bearer token is still read, so the handler can tailor the response. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the given roles (`x-min-role: admin`, `student`, ...). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated user; `undefined` on public routes called anonymously. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => ctx.switchToHttp().getRequest().user,
);
