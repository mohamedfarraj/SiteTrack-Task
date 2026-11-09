import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser, Roles } from '../../common/auth/decorators';
import { COMPANY_STORE_ROLES } from '../../common/enums';
import { parseProjectCode } from '../../common/utils/ids';
import { CompanyDeliveryListQueryDto, CreateCompanyDeliveryDto, StockLinesDto } from '../deliveries/deliveries.dto';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { ProjectsService } from '../projects/projects.service';
import { CompanyStockQueryDto, ProjectPickerQueryDto, ReorderPointDto } from './stores.dto';
import { StoresService } from './stores.service';

/**
 * Company store (screens 10 and 11). Only company store managers and
 * SuperAdmins reach anything here; everyone else gets 403.
 */
@ApiTags('Company store')
@ApiBearerAuth()
@Roles(...COMPANY_STORE_ROLES)
@Controller('company-store')
export class CompanyStoreController {
  constructor(
    private readonly stores: StoresService,
    private readonly deliveries: DeliveriesService,
    private readonly projects: ProjectsService,
  ) {}

  @Get('stock')
  @ApiOperation({ summary: 'Stock screen (10): quantity, in transit to projects, reorder point and status' })
  stock(@Query() query: CompanyStockQueryDto) {
    return this.stores.companyStock(query);
  }

  @Post('stock/additions')
  @ApiOperation({ summary: 'Add supplier stock (the only way new material enters SiteTrack)' })
  addStock(@CurrentUser() user: AuthUser, @Body() dto: StockLinesDto) {
    return this.stores.addStock(user.id, dto.lines, dto.note);
  }

  @Put('stock/:materialId/reorder-point')
  @ApiOperation({ summary: 'Set the reorder point of a material' })
  setReorderPoint(@Param('materialId', ParseIntPipe) materialId: number, @Body() dto: ReorderPointDto) {
    return this.stores.setReorderPoint(materialId, dto.reorderPoint);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Project picker (code + name) for sending deliveries and filtering' })
  projectPicker(@Query() query: ProjectPickerQueryDto) {
    return this.projects.pickList(query.search, 50);
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Deliveries screen (11): across all projects, newest first' })
  listDeliveries(@Query() query: CompanyDeliveryListQueryDto) {
    let projectId: number | undefined;
    if (query.projectCode) {
      // An unknown code simply matches nothing.
      projectId = parseProjectCode(query.projectCode) ?? -1;
    }
    return this.deliveries.list('COMPANY', query, projectId);
  }

  @Get('deliveries/:id')
  getDelivery(@Param('id', ParseIntPipe) id: number) {
    return this.deliveries.get('COMPANY', id);
  }

  @Post('deliveries')
  @ApiOperation({ summary: 'Send material from the company store to a project store' })
  async send(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDeliveryDto) {
    const projectId = parseProjectCode(dto.projectCode) ?? -1;
    return this.deliveries.initiate('COMPANY', projectId, user.id, dto.lines, dto.note);
  }

  @Post('deliveries/:id/record')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a delivery coming back from a project (stock joins the company store)' })
  record(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.deliveries.settle('COMPANY', id, 'RECORD', user.id);
  }

  @Post('deliveries/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a delivery coming back from a project (stock returns to the project)' })
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.deliveries.settle('COMPANY', id, 'REJECT', user.id);
  }

  @Post('deliveries/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an in-transit delivery the company store sent (stock returns)' })
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.deliveries.settle('COMPANY', id, 'CANCEL', user.id);
  }
}
