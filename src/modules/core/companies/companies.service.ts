import { BadRequestException, Injectable, Post } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CompaniesEntity } from './companies.entity';
import { BaseService } from 'src/common/base/baseService.service';

@Injectable()
export class CompaniesService extends BaseService<CompaniesEntity> {
  constructor(
    @InjectRepository(CompaniesEntity)
    private readonly companiesRepository: Repository<CompaniesEntity>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {
    super(companiesRepository);
  }

  async create(body): Promise<CompaniesEntity> {
    try {
      this.createNewSchema(body.name);

      const company = await this.companiesRepository.save({ name: body.name, phone: body.phone });
      if (company) {
        this.createNewSchema(body.name);
      }
      return company;


    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async createNewSchema(schema: string): Promise<void> {
    try {
      const data: any = this.dataSource.options;
  
      // إنشاء المخطط الجديد إذا لم يكن موجودًا
      await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  
      const entities = ['dist/modules/tenants/**/*.entity{.ts,.js}'];
  
      // إنشاء اتصال جديد مع المخطط الجديد
      const AppDataSource = new DataSource({
        type: 'postgres',
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        database: data.database,
        schema: schema,
        entities: entities,
        synchronize: true,
      });
  
      // تهيئة الاتصال
      await AppDataSource.initialize();


      // إغلاق الاتصال
      await AppDataSource.destroy();

      
    } catch (error) {
      console.error(`Error creating schema "${schema}":`, error);
      throw new BadRequestException(
        `Failed to create schema "${schema}": ${error.message}`,
      );
    }
  }
}
