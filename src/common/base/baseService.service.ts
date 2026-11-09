import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  Repository,
  BaseEntity,
  DeleteResult,
  Like,
  FindOptionsWhere,
} from 'typeorm';
import { PageOptionsDto } from './dto/page-options.dto';
import { PageMetaDto } from './dto/page-meta.dto';
import { PageDto } from './dto/page.dto';

@Injectable()
export abstract class BaseService<T extends BaseEntity> {
  constructor(protected readonly repository: Repository<T>) {}

  async findAll(pageOptionsDto: PageOptionsDto): Promise<PageDto<T>> {
    try {
      let order: any = { id: 'DESC' };
      if (pageOptionsDto.order) {
        order = {};
        order[pageOptionsDto.sortField] = pageOptionsDto.order;
      }

      const skip = (pageOptionsDto.page - 1) * pageOptionsDto.take || 0;
      const take = pageOptionsDto.take || 10;

      const data = await this.repository.findAndCount({
        skip,
        take,
        order,
      });

      const pageMetaDto = new PageMetaDto({
        itemCount: data[1],
        pageOptionsDto,
      });

      return new PageDto(data[0], pageMetaDto);
      } catch (e) {
        throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async search(
    pageOptionsDto: PageOptionsDto,
    searchDto: any,
  ): Promise<PageDto<T>> {
    try {
      let order: any = { id: 'DESC' };
      if (pageOptionsDto.order) {
        order = {};
        order[pageOptionsDto.sortField] = pageOptionsDto.order;
      }

      const skip = (pageOptionsDto.page - 1) * pageOptionsDto.take || 0;
      const take = pageOptionsDto.take || 10;

      if (searchDto.name) {
        searchDto.name = Like(`%${searchDto.name}%`);
      }
      const data = await this.repository.findAndCount({
        skip,
        take,
        order,
        where: searchDto,
      });

      const pageMetaDto = new PageMetaDto({
        itemCount: data[1],
        pageOptionsDto,
      });

      return new PageDto(data[0], pageMetaDto);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }

  async getAll(body: any) {
    try {
      const q:any = {};
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === 'string' || typeof value === 'number') {
          q[key] = !isNaN(Number(value)) ? Number(value) : value;
        }
      }
      if (q.name) {
        q.name = Like(`%${q.name}%`);
      }
      const order: any = { id: 'DESC' };
      return await this.repository.find({
        where: q,
        order,
      });
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async findOne(id: number): Promise<T> {
    try {
      const where: any = { id };
      return this.repository.findOneByOrFail(where);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async create(entity: T): Promise<T> {
    try {
      return this.repository.save(entity);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async update(id: number, entity: any): Promise<T> {
    try {
      const where: any = { id };
      await this.repository.update(where, entity);
      return this.repository.findOneByOrFail(where);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async delete(id: number): Promise<DeleteResult> {
    try {
      return await this.repository.delete(id);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }

  async count(body: object): Promise<number> {
    try {
      return await this.repository.count(body);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
    }
  }
}
