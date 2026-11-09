import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { DatabaseService } from '../../database/database.service';
import { AccessTokenPayload, AuthUser } from './auth-user';
import { IS_PUBLIC_KEY } from './decorators';

/**
 * Global authentication guard (every route is protected unless @Public()).
 *
 * 1. Verifies the Bearer access token's signature and expiry.
 * 2. Loads the session + user in ONE indexed query and rejects the request if
 *    the session was logged out / expired or the user no longer exists.
 *
 * Step 2 is what makes logout and role changes effective immediately instead
 * of waiting for the JWT to expire. It costs a single primary-key lookup.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing access token');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.db.one<AuthUser>(
      `SELECT u.id, u.name, u.email, u.role, s.id AS "sessionId"
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2
          AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [payload.sid, payload.sub],
    );
    if (!user) throw new UnauthorizedException('Session is no longer active');

    request.user = user;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type?.toLowerCase() === 'bearer' ? token : undefined;
  }
}
