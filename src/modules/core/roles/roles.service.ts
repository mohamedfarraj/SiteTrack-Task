import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RolesEntity } from './roles.entity';
import { BaseService } from 'src/common/base/baseService.service';

@Injectable()
export class RolesService extends BaseService<RolesEntity> {
  constructor(
    @InjectRepository(RolesEntity)
    private readonly rolesRepository: Repository<RolesEntity>,
  ) {
    super(rolesRepository);
  }

  //Cannot query across many-to-many for property permissionsList


  async update(id: number, entity: any): Promise<RolesEntity> {
    try {
      const existingRole = await this.repository.findOneByOrFail({ id });
      
      // Handle permissions separately if they exist in the entity
      const permissions = entity.permissionsList;
      delete entity.permissionsList;

      // Update basic role properties
      Object.assign(existingRole, entity);
      
      // Update permissions if provided
      if (permissions) {
        existingRole.permissionsList = permissions;
      }

      // Save the updated entity
      return await this.repository.save(existingRole);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }


 
}
