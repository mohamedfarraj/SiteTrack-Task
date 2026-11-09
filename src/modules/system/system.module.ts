import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { UploadsController } from './uploads/uploads.controller';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([]),
    TerminusModule,
  ],
  controllers: [
    UploadsController,
    HealthController,
  ],
  providers: [],
})
export class SystemModule {}
