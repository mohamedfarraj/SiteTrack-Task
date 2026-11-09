import { CustomBaseEntity } from '../../../common/base/baseEntity.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToMany,
  Unique,
  Index,
} from 'typeorm';
import { RolesEntity } from '../roles/roles.entity';
import { SYSTEM_USERS_TYPES } from 'src/common/shared/constants';

@Entity({ name: 'permissions' })
@Index(['id', 'screen', 'model'], { unique: true })
export class PermissionsEntity extends CustomBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  url: string;

  @Column()
  method: string;

  @Column()
  screen: string;

  @Column()
  model: string;

  @ManyToMany(() => RolesEntity, (item) => item.permissionsList)
  roles: RolesEntity[];
}
