import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ToArray, ToBoolean } from '../../common/dto/boolean.transform';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { TaskStatus } from '../../common/enums';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateTaskDto {
  @ApiProperty({ example: 'Pour level 2 slab' })
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString({ strict: true })
  plannedStart: string;

  @ApiProperty({ example: '2026-03-10' })
  @IsDateString({ strict: true })
  plannedEnd: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['PRJ-0042-T-0001'],
    description: 'Tasks (in the same project) this task waits on',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsOptional()
  dependsOn?: string[];
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsDateString({ strict: true })
  @IsOptional()
  plannedStart?: string;

  @ApiPropertyOptional({ example: '2026-03-10' })
  @IsDateString({ strict: true })
  @IsOptional()
  plannedEnd?: string;
}

export class AddDependencyDto {
  @ApiProperty({ example: 'PRJ-0042-T-0001', description: 'The task that must be done first' })
  @IsString()
  @IsNotEmpty()
  dependsOn: string;
}

export const TASK_SORTS = ['id', 'name', 'startDate', 'endDate', 'dependents'] as const;

export class TaskListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TaskStatus, isArray: true, description: 'One or more statuses (comma separated)' })
  @ToArray()
  @IsEnum(TaskStatus, { each: true })
  @IsOptional()
  status?: TaskStatus[];

  @ApiPropertyOptional({ description: 'true = only Late tasks, false = only tasks that are not late' })
  @ToBoolean()
  @IsOptional()
  late?: boolean;

  @ApiPropertyOptional({ description: 'true = only Blocked tasks, false = only unblocked ones' })
  @ToBoolean()
  @IsOptional()
  blocked?: boolean;

  @ApiPropertyOptional({ example: '2026-03-01', description: 'Planned period overlaps a range starting here' })
  @IsDateString({ strict: true })
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-03-31', description: 'Planned period overlaps a range ending here' })
  @IsDateString({ strict: true })
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ description: 'Search by name or ID ("slab", "PRJ-0042-T-0137", "T-0137", "137")' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: TASK_SORTS, default: 'id' })
  @IsIn(TASK_SORTS)
  @IsOptional()
  sortBy?: (typeof TASK_SORTS)[number];
}
