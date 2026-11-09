import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { CreateProjectDto, ProjectListQueryDto, UpdateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({
    summary: 'Projects screen (4): every project the caller can access, with task statistics',
  })
  list(@CurrentUser() user: AuthUser, @Query() query: ProjectListQueryDto) {
    return this.projects.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a project. The creator becomes its project admin.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Get(':projectCode')
  @ApiParam({ name: 'projectCode', example: 'PRJ-0042' })
  @ApiOperation({ summary: 'One project with statistics (404 if missing or not accessible)' })
  get(@CurrentUser() user: AuthUser, @Param('projectCode') code: string) {
    return this.projects.get(user, code);
  }

  @Patch(':projectCode')
  @ApiParam({ name: 'projectCode', example: 'PRJ-0042' })
  @ApiOperation({ summary: 'Edit name / planned dates (project admins)' })
  update(@CurrentUser() user: AuthUser, @Param('projectCode') code: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, code, dto);
  }

  @Delete(':projectCode')
  @ApiParam({ name: 'projectCode', example: 'PRJ-0042' })
  @ApiOperation({
    summary: 'Remove a project (project admins)',
    description: 'Refused (409) while the project store holds stock or deliveries are in transit.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('projectCode') code: string) {
    return this.projects.remove(user, code);
  }
}
