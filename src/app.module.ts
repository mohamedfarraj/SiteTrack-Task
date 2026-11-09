import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard';
import { RolesGuard } from './common/auth/roles.guard';
import { LoggingMiddleware } from './common/middlewares/logging.middleware';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import appConfig, { AppConfig } from './config/app.config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { MembersModule } from './modules/members/members.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { StoresModule } from './modules/stores/stores.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig], envFilePath: ['.env.local', '.env'] }),

    // Global rate limit; auth endpoints use a stricter @Throttle override.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { throttle } = config.getOrThrow<AppConfig>('app');
        return { throttlers: [{ ttl: throttle.ttlMs, limit: throttle.limit }] };
      },
    }),

    // Signs / verifies short-lived access tokens.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { auth } = config.getOrThrow<AppConfig>('app');
        return { secret: auth.jwtSecret, signOptions: { expiresIn: auth.accessTokenTtl as any } };
      },
    }),

    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    MembersModule,
    NotificationsModule,
    TasksModule,
    MaterialsModule,
    StoresModule,
  ],
  providers: [
    // Order matters: rate limit -> authenticate -> authorise by app role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, LoggingMiddleware).forRoutes('*path');
  }
}
