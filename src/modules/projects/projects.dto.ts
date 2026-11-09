import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ToBoolean } from '../../common/dto/boolean.transform';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateProjectDto {
  @ApiProperty({ example: 'Riverside Tower' })
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '2026-01-15', description: 'Planned start date (YYYY-MM-DD)' })
  @IsDateString({ strict: true })
  plannedStart: string;

  @ApiProperty({ example: '2026-12-20', description: 'Planned end date (YYYY-MM-DD), on or after the start' })
  @IsDateString({ strict: true })
  plannedEnd: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsDateString({ strict: true })
  @IsOptional()
  plannedStart?: string;

  @ApiPropertyOptional({ example: '2026-12-20' })
  @IsDateString({ strict: true })
  @IsOptional()
  plannedEnd?: string;
}

export const PROJECT_SORTS = ['name', 'startDate', 'percentDone', 'lateTasks'] as const;

export class ProjectListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or ID (e.g. "tower", "PRJ-0042", "42")' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Only projects that have at least one late task' })
  @ToBoolean()
  @IsOptional()
  hasLateTasks?: boolean;

  @ApiPropertyOptional({ enum: PROJECT_SORTS, default: 'name' })
  @IsIn(PROJECT_SORTS)
  @IsOptional()
  sortBy?: (typeof PROJECT_SORTS)[number];
}
