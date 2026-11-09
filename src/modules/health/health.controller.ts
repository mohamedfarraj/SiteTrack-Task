import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { Public } from '../../common/auth/decorators';
import { DatabaseService } from '../../database/database.service';

/** Liveness / readiness for docker compose and load balancers. */
@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'API and database health' })
  check() {
    return this.health.check([
      async () => {
        const check = this.indicator.check('database');
        try {
          await this.db.query('SELECT 1');
          return check.up();
        } catch (err) {
          return check.down({ message: (err as Error).message });
        }
      },
    ]);
  }
}
