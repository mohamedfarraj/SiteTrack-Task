import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AdminsService } from './admins.service';
import { BaseController } from 'src/common/base/baseController.controller';
import { CreateAdmins } from './dto/createAdmins.dto';
import { UpdateAdmins } from './dto/updateAdmins.dto';
import { ApiBody, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UserInfo } from 'src/common/decorators/user.decorator';


@Controller('admins')
@ApiTags('Admins')
@UseGuards(AuthGuard('jwt'))
export class AdminsController extends BaseController<CreateAdmins> {
  constructor(private readonly userService: AdminsService) {
    super(userService);
  }

  @Post()
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: CreateAdmins,
  })
  @ApiBody({ type: CreateAdmins })
  async create(@Body() body: CreateAdmins): Promise<CreateAdmins> {
    return this.service.create(body);
  }

  @Put(':id')
  @ApiCreatedResponse({
    description: 'The record has been successfully created.',
    type: UpdateAdmins,
  })
  @ApiBody({ type: UpdateAdmins })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateAdmins,
  ): Promise<UpdateAdmins> {
    return this.service.update(id, body);
  }
}
