import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { DeliveryListQueryDto, StockLinesDto } from '../deliveries/deliveries.dto';
import { DeliveriesService, DeliveryAction } from '../deliveries/deliveries.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { ProjectStockQueryDto } from './stores.dto';
import { StoresService } from './stores.service';

/**
 * A project's store and its deliveries (screens 7 and 8). Any project member
 * (and SuperAdmins) can work here; everyone else gets 404.
 */
@ApiTags('Project store & deliveries')
@ApiBearerAuth()
@ApiParam({ name: 'projectCode', example: 'PRJ-0042' })
@Controller('projects/:projectCode')
export class ProjectStoreController {
  constructor(
    private readonly access: ProjectAccessService,
    private readonly stores: StoresService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @Get('store')
  @ApiOperation({ summary: 'Project: Store screen (7)' })
  async stock(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Query() query: ProjectStockQueryDto) {
    const { projectId } = await this.access.resolve(user, code);
    return this.stores.projectStock(projectId, query);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Project: Deliveries screen (8), newest first' })
  async list(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Query() query: DeliveryListQueryDto) {
    const { projectId } = await this.access.resolve(user, code);
    return this.deliveries.list('PROJECT', query, projectId);
  }

  @Get('deliveries/:id')
  async get(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Param('id', ParseIntPipe) id: number) {
    const { projectId } = await this.access.resolve(user, code);
    return this.deliveries.get('PROJECT', id, projectId);
  }

  @Post('deliveries')
  @ApiOperation({ summary: 'Send material back to the company store' })
  async send(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Body() dto: StockLinesDto) {
    const { projectId } = await this.access.resolve(user, code);
    return this.deliveries.initiate('PROJECT', projectId, user.id, dto.lines, dto.note);
  }

  @Post('deliveries/:id/record')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record an incoming delivery (stock joins the project store)' })
  record(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Param('id', ParseIntPipe) id: number) {
    return this.settle(user, code, id, 'RECORD');
  }

  @Post('deliveries/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject an incoming delivery (stock returns to the company store)' })
  reject(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Param('id', ParseIntPipe) id: number) {
    return this.settle(user, code, id, 'REJECT');
  }

  @Post('deliveries/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an outgoing delivery that is still in transit' })
  cancel(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Param('id', ParseIntPipe) id: number) {
    return this.settle(user, code, id, 'CANCEL');
  }

  private async settle(user: AuthUser, code: string, id: number, action: DeliveryAction) {
    const { projectId } = await this.access.resolve(user, code);
    return this.deliveries.settle('PROJECT', id, action, user.id, projectId);
  }
}
