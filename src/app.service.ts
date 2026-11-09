import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SYSTEM_USERS_TYPES, USERS_TYPES } from './common/shared/constants';

@Injectable()
export class AppService {
  constructor(private dataSource: DataSource) {}
  getHello(): string {
    return 'Hello World!';
  }

  async getAllTables(): Promise<string[]> {
    try {
      const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE';
    `;
      const result = await this.dataSource.query(query);
      return result.map((row) => row.table_name);
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }

  async getTableData(tableName: string): Promise<any[]> {
    try {
      if (
        !/^[a-zA-Z0-9_]+$/.test(tableName) &&
        SYSTEM_USERS_TYPES.includes(tableName)
      ) {
        throw new HttpException(
          'Invalid table name',
          HttpStatus.METHOD_NOT_ALLOWED,
        );
      }

      if (tableName == 'roles') {
        const query = `
        SELECT id, name
        FROM ${tableName};
      `;
        return this.dataSource.query(query);
      } else {
        const query = `
        SELECT id, name, name_en
        FROM ${tableName};
      `;
        return this.dataSource.query(query);
      }
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }

  getConstants(name: string) {
    try {
      if (name == 'USERS_TYPES') {
        return USERS_TYPES;
      }
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.METHOD_NOT_ALLOWED);
    }
  }
}
