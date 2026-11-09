import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionsEntity } from './permissions.entity';
import { BaseService } from 'src/common/base/baseService.service';

@Injectable()
export class PermissionsService extends BaseService<PermissionsEntity> {
  constructor(
    @InjectRepository(PermissionsEntity)
    private readonly permissionsRepository: Repository<PermissionsEntity>,
  ) {
    super(permissionsRepository);
  }

  async findAll(pageOptionsDto: any) {
    const permissions = await this.permissionsRepository.query(`
      SELECT
        model,
        json_agg(
          json_build_object(
            'screen', screen,
            'permissions', permissions
          )
        ) AS screens
      FROM (
        SELECT
          model,
          screen,
          json_agg(json_build_object('id', id, 'name', name)) AS permissions
        FROM permissions
        GROUP BY model, screen
      ) AS permissions_grouped
      GROUP BY model
    `);

    return permissions;
  }
}
