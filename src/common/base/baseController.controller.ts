import {
  Body,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { PageOptionsDto } from './dto/page-options.dto';
import { PageDto } from './dto/page.dto';
import { ApiBody } from '@nestjs/swagger';

export abstract class BaseController<T> {
  constructor(protected readonly service: any) {}

  @Get()
  async findAll(
    @Query() pageOptionsDto: PageOptionsDto,
  ): Promise<PageDto<T[]>> {
    return await this.service.findAll(pageOptionsDto);
  }

  @Get("getAll")
  @HttpCode(HttpStatus.OK)
  async getAll(
    @Query() body:any,
  ): Promise<T[]> {
    return await this.service.getAll(body);
  }
  

  @Post('search')
  @ApiBody({ type: Object })
  @HttpCode(HttpStatus.OK)
  async search(
    @Query() pageOptionsDto: PageOptionsDto,
    @Body() searchDto: T,
  ): Promise<PageDto<T[]>> {
    return await this.service.search(pageOptionsDto,searchDto);
  }
  

  @Get(':id/view')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id') id: number): Promise<T> {
    return this.service.findOne(id);
  }


  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id') id: number): Promise<void> {
    try {
      return this.service.delete(id);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }


  @Get('count')
  @HttpCode(HttpStatus.OK)
  async count(@Query() query: any) {
    return this.service.count(query);
  }
}
