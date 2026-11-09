import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/auth/decorators';
import { COMPANY_STORE_ROLES } from '../../common/enums';
import { CreateMaterialDto, MaterialListQueryDto, UpdateMaterialDto } from './materials.dto';
import { MaterialsService } from './materials.service';

/**
 * Catalogue: readable by every logged-in person. Creating, editing and removing
 * materials is reserved for company store managers and SuperAdmins (our call:
 * they own the company store, which is where every material enters).
 */
@ApiTags('Materials')
@ApiBearerAuth()
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materials: MaterialsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse / search the materials catalogue' })
  list(@Query() query: MaterialListQueryDto) {
    return this.materials.list(query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Distinct categories (for filter dropdowns)' })
  categories() {
    return this.materials.categories();
  }

  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.materials.get(id);
  }

  @Post()
  @Roles(...COMPANY_STORE_ROLES)
  @ApiOperation({ summary: 'Add a material to the catalogue (store managers, SuperAdmins)' })
  create(@Body() dto: CreateMaterialDto) {
    return this.materials.create(dto);
  }

  @Patch(':id')
  @Roles(...COMPANY_STORE_ROLES)
  @ApiOperation({ summary: 'Edit a material (store managers, SuperAdmins)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMaterialDto) {
    return this.materials.update(id, dto);
  }

  @Delete(':id')
  @Roles(...COMPANY_STORE_ROLES)
  @ApiOperation({ summary: 'Remove an unused material (store managers, SuperAdmins)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.materials.remove(id);
  }
}
