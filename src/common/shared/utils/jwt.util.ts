import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { DataSource } from 'typeorm';
import { Request as RequestType } from 'express';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private dataSource: DataSource,

    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.extractJWT,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('app.jwt_secret_key'),
      passReqToCallback: true,
    });
  }

  private static extractJWT(req: RequestType): string | null {
    if (
      (req.cookies &&
        'backend_token' in req.cookies &&
        req.cookies.backend_token.length > 0) ||
      (req.headers.authorization && req.headers.authorization.length > 0)
    ) {

      return (
        req.cookies.backend_token || req.headers.authorization.split(' ')[1]
      );
    }

    return null;
  }

  private async getAdminAuthDate(id) {
    let user = await this.dataSource
      .createQueryBuilder()
      .select('admin')
      .addSelect('role')
      .addSelect('permission')
      .from('admins', 'admin')
      .leftJoin('admin.rolesId', 'role')
      .leftJoin('role.permissionsList', 'permission')
      .where('admin.id = :id', { id })
      .getOne();

    return user;
  }

  async validate(req: RequestType, payload: any) {
    const user = await this.getAdminAuthDate(payload.id);
    if (
      (user.rolesId &&
        user.rolesId.permissionsList.find(
          (e) => e.url == req.path && e.method == req.method,
        )) ||
        (user.rolesId &&
          user.rolesId.id == 1) ||
          req.path == '/api/core/auth/adminProfile' ||
          req.path == '/api/core/auth/adminsLogout' ||
        payload.auth_type == 'users'
      ) {
      return { ...payload, user };
    } else {
      throw new UnauthorizedException('Access to this URL is restricted');
    }
  }
}
