import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AppConfig } from './config/app.config';

export const API_PREFIX = 'api';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService).getOrThrow<AppConfig>('app');
  const logger = new Logger('Bootstrap');

  // Security headers. Swagger UI needs inline scripts, so CSP is relaxed only in dev.
  app.use(helmet({ contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false }));
  app.use(compression());
  app.enableCors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
  });

  // All routes live under /api/v1/...
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // DTO validation: strip unknown fields, reject unexpected ones, convert types.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // OpenAPI docs: the contract for the frontend team (also served in production).
  const swagger = new DocumentBuilder()
    .setTitle('SiteTrack API')
    .setDescription(
      [
        'Construction projects, tasks, dependencies, stores and material deliveries.',
        '',
        '**Auth:** call `POST /api/v1/auth/login`, then send `Authorization: Bearer <accessToken>`.',
        'When a request answers 401, call `POST /api/v1/auth/refresh` with the refresh token and retry.',
        '',
        '**Envelope:** success = `{ data, requestId }`; lists = `data: { items, meta }`;',
        'errors = `{ statusCode, error, message, details?, requestId }`.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, swagger), {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });

  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  logger.log(`SiteTrack API listening on port ${config.port} (docs at /docs)`);
}

bootstrap().catch((err) => {
  console.error('Failed to start SiteTrack API', err);
  process.exit(1);
});
