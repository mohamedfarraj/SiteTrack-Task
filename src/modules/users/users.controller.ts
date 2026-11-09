import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../../common/auth/decorators';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto';
import { AppRole } from '../../common/enums';
import { likePattern } from '../../common/utils/ids';
import { DatabaseService } from '../../database/database.service';

class UserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}

class ChangeRoleDto {
  @IsEnum(AppRole)
  role: AppRole;
}

/**
 * Account administration for SuperAdmins. Changing a role takes effect on the
 * person's very next request, because the auth guard re-reads the role.
 */
@ApiTags('Users (SuperAdmin)')
@ApiBearerAuth()
@Roles(AppRole.SUPER_ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'List all accounts' })
  async list(@Query() query: UserListQueryDto) {
    const params: unknown[] = [query.limit, query.offset];
    let where = '';
    if (query.search) {
      params.push(likePattern(query.search));
      where = `WHERE name ILIKE $3 OR email ILIKE $3`;
    }
    const rows = await this.db.query(
      `SELECT id, name, email, role, created_at AS "createdAt", count(*) OVER()::int AS total
         FROM users ${where}
        ORDER BY name, id LIMIT $1 OFFSET $2`,
      params,
    );
    return paginate(
      rows.map(({ total: _t, ...u }) => u),
      rows[0]?.total ?? 0,
      query,
    );
  }

  @Patch(':id/role')
  @ApiOperation({ summary: "Change a person's app role" })
  async changeRole(@Param('id', ParseIntPipe) id: number, @Body() dto: ChangeRoleDto) {
    const user = await this.db.one(
      `UPDATE users SET role = $2, updated_at = now() WHERE id = $1 RETURNING id, name, email, role`,
      [id, dto.role],
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
