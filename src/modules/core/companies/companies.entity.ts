import { CustomBaseEntity } from '../../../common/base/baseEntity.entity';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'companies' })
export class CompaniesEntity extends CustomBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    unique: true,
  })
  name: string;



  @Column()
  phone: string;



  @Column({default: true})
  status: boolean;

}
