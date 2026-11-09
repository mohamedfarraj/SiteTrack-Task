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
import { PermissionsService } from './permissions.service';
import { BaseController } from 'src/common/base/baseController.controller';


import { ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';


@Controller('permissions')
@ApiTags('Permissions')
@UseGuards(AuthGuard('jwt'))
export class PermissionsController extends BaseController<any> {
  constructor(private readonly permissionsService: PermissionsService) {
    super(permissionsService);
  }

  

}
