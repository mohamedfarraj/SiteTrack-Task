import { CustomBaseEntity } from '../../../common/base/baseEntity.entity';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  JoinTable,
  ManyToMany,
  OneToMany,
} from 'typeorm';
import { PermissionsEntity } from '../permissions/permissions.entity';
import { AdminsEntity } from '../admins/admins.entity';


@Entity({ name: 'roles' })
export class RolesEntity extends CustomBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;


  @ManyToMany(() => PermissionsEntity, (item) => item.roles, {
    eager: true,
    cascade: true,
  })
  @JoinTable()
  permissionsList: PermissionsEntity[];

  @OneToMany(() => AdminsEntity, (item) => item.rolesId)
  adminsList: AdminsEntity[];

  
}
