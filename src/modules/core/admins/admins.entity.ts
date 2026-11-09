import { CustomBaseEntity } from '../../../common/base/baseEntity.entity';
import { Entity, Column, ManyToOne } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { RolesEntity } from '../roles/roles.entity';

@Entity({ name: 'admins' })
export class AdminsEntity extends CustomBaseEntity {
  @Column({
    unique:true
  })
  username: string;

  @Column({
    unique:true
  })
  email: string;

  @Column({
    select:false
  })
  password: string;

  @ManyToOne(()=>RolesEntity,item=>item.adminsList,{
    eager: true
  })
  rolesId:RolesEntity;


  async comparePassword(attempt: string): Promise<boolean> {
    return await bcrypt.compare(attempt, this.password);
  }
}
