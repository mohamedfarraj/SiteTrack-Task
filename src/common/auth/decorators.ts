import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AppRole } from '../enums';
import { AuthUser } from './auth-user';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Marks a route as reachable without a token (register, login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route (or controller) to the given app roles. */
export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);

/** Injects the authenticated user: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
