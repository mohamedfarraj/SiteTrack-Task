import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminsEntity } from './admins.entity';
import { BaseService } from 'src/common/base/baseService.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminsService extends BaseService<AdminsEntity> {
  constructor(
    @InjectRepository(AdminsEntity)
    private readonly userRepository: Repository<AdminsEntity>,
  ) {
    super(userRepository);
  }

  async create(body: AdminsEntity): Promise<AdminsEntity> {
    try {
      body.password = await bcrypt.hash(body.password, 10);
      return await this.userRepository.save(body);
    } catch (e) {
      // Check for duplicate entry error (PostgreSQL error code 23505)
      if (e.code === '23505') {
        throw new HttpException(
          'Admin with this username/email already exists',
          HttpStatus.CONFLICT
        );
      }
      throw new HttpException(
        'Unable to create admin',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  async update(id: any, body: any): Promise<AdminsEntity> {
    try {
      if (body.password) {
        body.password = await bcrypt.hash(body.password, 10);
      }
      await this.userRepository.update(id, {...body});
      const updated = await this.userRepository.findOne({where:{id}});
      if (!updated) {
        throw new HttpException(
          'Admin not found',
          HttpStatus.BAD_REQUEST
        );
      }
      return updated;
    } catch (e) {
      // Check for duplicate entry error (PostgreSQL error code 23505)
      if (e.code === '23505') {
        throw new HttpException(
          'Admin with this username/email already exists',
          HttpStatus.CONFLICT
        );
      }
      console.error('Update admin error:', e);
      throw new HttpException(
        'Unable to update admin',
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
