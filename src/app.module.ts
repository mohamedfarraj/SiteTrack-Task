import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggingMiddleware } from './common/middlewares/logging.middleware';
import { RequestIdMiddleware } from './common/middlewares/request-id.middleware';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from './modules/core/core.module';
import { RouterModule } from '@nestjs/core';
import appConfig from './common/config/app.config';
import { SystemModule } from './modules/system/system.module';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ttl: configService.get<number>('app.throttle_ttl') || 60,
        limit: configService.get<number>('app.throttle_limit') || 10,
      }),
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get<string>('app.db_host'),
        port: configService.get<number>('app.db_port') || 3306,
        database: configService.get<string>('app.db_name'),
        username: configService.get<string>('app.db_username'),
        password: configService.get<string>('app.db_password'),
        autoLoadEntities: true,
        synchronize: configService.get<boolean>('app.db_synchronize') !== false,
        keepConnectionAlive: true,
        logging: configService.get<boolean>('app.db_logging') || false,
        retryAttempts: 3,
        retryDelay: 3000,
        extra: {
          connectionLimit: 10,
        },
      }),
    }),
    CoreModule,
    SystemModule,

    RouterModule.register([
      {
        path: 'core',
        module: CoreModule,
      },
      {
        path: 'system',
        module: SystemModule,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    ConfigService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, LoggingMiddleware)
      .forRoutes('*');
  }
}
