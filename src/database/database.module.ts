import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/** Global so every feature module can inject DatabaseService directly. */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
