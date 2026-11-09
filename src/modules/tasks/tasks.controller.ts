import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth-user';
import { CurrentUser } from '../../common/auth/decorators';
import { TaskAction } from '../../common/enums';
import { AddDependencyDto, CreateTaskDto, TaskListQueryDto, UpdateTaskDto } from './tasks.dto';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@ApiParam({ name: 'projectCode', example: 'PRJ-0042' })
@Controller('projects/:projectCode/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Project: Tasks screen (5) with Late / Blocked flags and direct dependencies' })
  list(@CurrentUser() user: AuthUser, @Param('projectCode') project: string, @Query() query: TaskListQueryDto) {
    return this.tasks.list(user, project, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task (gets the next ID in the project, e.g. PRJ-0042-T-0138)' })
  create(@CurrentUser() user: AuthUser, @Param('projectCode') project: string, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, project, dto);
  }

  @Get(':taskCode')
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiOperation({ summary: 'Task details screen (6): allowed actions, everything it waits on and what waits on it' })
  get(@CurrentUser() user: AuthUser, @Param('projectCode') project: string, @Param('taskCode') task: string) {
    return this.tasks.get(user, project, task);
  }

  @Patch(':taskCode')
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiOperation({ summary: 'Edit name / planned dates. Status changes use the action endpoints.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('projectCode') project: string,
    @Param('taskCode') task: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user, project, task, dto);
  }

  @Delete(':taskCode')
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiOperation({ summary: 'Remove a task and its dependency links' })
  remove(@CurrentUser() user: AuthUser, @Param('projectCode') project: string, @Param('taskCode') task: string) {
    return this.tasks.remove(user, project, task);
  }

  @Post(':taskCode/start')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiOperation({ summary: 'Start: Not started -> In progress (only when every task it waits on is done)' })
  start(@CurrentUser() user: AuthUser, @Param('projectCode') project: string, @Param('taskCode') task: string) {
    return this.tasks.transition(user, project, task, TaskAction.START);
  }

  @Post(':taskCode/complete')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiOperation({ summary: 'Mark as done: In progress -> Done' })
  complete(@CurrentUser() user: AuthUser, @Param('projectCode') project: string, @Param('taskCode') task: string) {
    return this.tasks.transition(user, project, task, TaskAction.COMPLETE);
  }

  @Post(':taskCode/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiOperation({ summary: 'Reopen: Done -> In progress (only while no task waiting on it has started)' })
  reopen(@CurrentUser() user: AuthUser, @Param('projectCode') project: string, @Param('taskCode') task: string) {
    return this.tasks.transition(user, project, task, TaskAction.REOPEN);
  }

  @Post(':taskCode/dependencies')
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiOperation({ summary: 'Make this task wait on another task of the same project (cycles are rejected)' })
  addDependency(
    @CurrentUser() user: AuthUser,
    @Param('projectCode') project: string,
    @Param('taskCode') task: string,
    @Body() dto: AddDependencyDto,
  ) {
    return this.tasks.addDependency(user, project, task, dto.dependsOn);
  }

  @Delete(':taskCode/dependencies/:dependsOnCode')
  @ApiParam({ name: 'taskCode', example: 'PRJ-0042-T-0137' })
  @ApiParam({ name: 'dependsOnCode', example: 'PRJ-0042-T-0001' })
  @ApiOperation({ summary: 'Remove a dependency' })
  removeDependency(
    @CurrentUser() user: AuthUser,
    @Param('projectCode') project: string,
    @Param('taskCode') task: string,
    @Param('dependsOnCode') dependsOn: string,
  ) {
    return this.tasks.removeDependency(user, project, task, dependsOn);
  }
}
