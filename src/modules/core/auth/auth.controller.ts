import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';

import { Auth } from './dto/auth.dto';
import { UserInfo } from 'src/common/decorators/user.decorator';
import { AuthGuard } from '@nestjs/passport';

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}



  

  @Post('adminsLogin')
  @ApiCreatedResponse({
    type: Auth,
  })
  @HttpCode(HttpStatus.OK)
  async adminsLogin(
    @Body() body: Auth,
    @Req() req,
    @Res({ passthrough: true }) response,
  ) {
    const data = await this.authService.adminsLogin(body, req);
    if (body.rememberMe) {
      response.cookie('backend_token', data.token, { httpOnly: true, expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) });
    } else {
      response.cookie('backend_token', data.token, { httpOnly: true });
    }
    return { msg: 'success' };
  }

  @Get('adminsLogout')
  @ApiCreatedResponse({
    type: Auth,
  })
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async adminsLogout(@Res({ passthrough: true }) response) {
    response.cookie('backend_token', '', { expires: new Date() });
    return { msg: 'success' };
  }

  @Get('adminProfile')
  @ApiCreatedResponse()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  async adminProfile(@UserInfo() user) {
    try {
      return this.authService.adminProfile(user.id);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.UNAUTHORIZED);
    }
  }

  
}
