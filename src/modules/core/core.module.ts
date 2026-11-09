import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminsController } from './admins/admins.controller';
import { AdminsEntity } from './admins/admins.entity';
import { AdminsService } from './admins/admins.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from 'src/common/shared/utils/jwt.util';
import { RolesEntity } from './roles/roles.entity';
import { PermissionsEntity } from './permissions/permissions.entity';
import { RolesController } from './roles/roles.controller';
import { PermissionsController } from './permissions/permissions.controller';
import { RolesService } from './roles/roles.service';
import { PermissionsService } from './permissions/permissions.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { LoggerService } from 'src/common/shared/logger.service';
import { CompaniesModule } from './companies/companies.module';
@Module({
  imports: [
    TypeOrmModule.forFeature([AdminsEntity, RolesEntity, PermissionsEntity]),

    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('app.jwt_secret_key'),
        signOptions: {
          expiresIn: configService.get<string>('app.jwt_expiration_time'),
        },
      }),
    }),
    CompaniesModule
  ],
  controllers: [
    AdminsController,
    AuthController,
    RolesController,
    PermissionsController,
  ],
  providers: [
    AdminsService,
    AuthService,
    JwtStrategy,
    RolesService,
    PermissionsService,
    LoggerService,
  ],
})
export class CoreModule {}
