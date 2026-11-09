import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { BaseController } from 'src/common/base/baseController.controller';
import { CreateRoles } from './dto/createRoles.dto';
import { UpdateRoles } from './dto/updateRoles.dto';
import { ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';


@Controller('roles')
@ApiTags('Roles')
@UseGuards(AuthGuard('jwt'))
export class RolesController extends BaseController<CreateRoles> {
  constructor(private readonly rolesService: RolesService) {
    super(rolesService);
  }


  @Post()
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: CreateRoles,
  })
  @ApiBody({ type: CreateRoles })
  async create(@Body() body: CreateRoles): Promise<CreateRoles> {
    try {
      return this.service.create(body);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }

  @Put(':id')
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: UpdateRoles,
  })
  @ApiBody({ type: UpdateRoles })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateRoles,
  ): Promise<UpdateRoles> {
    try {
      return this.service.update(id, body);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }
}
