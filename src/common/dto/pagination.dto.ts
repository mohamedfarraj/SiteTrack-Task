import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SortOrder } from '../enums';

/** Shared query parameters for every list endpoint. */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit: number = 20;

  @ApiPropertyOptional({ enum: SortOrder })
  @IsEnum(SortOrder)
  @IsOptional()
  order?: SortOrder;

  get offset(): number {
    return (this.page - 1) * this.limit;
  }
}

/** Pagination metadata returned next to every list. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Standard list response: `{ items, meta }`. */
export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

export function paginate<T>(items: T[], total: number, query: PaginationQueryDto): Paginated<T> {
  return {
    items,
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}
