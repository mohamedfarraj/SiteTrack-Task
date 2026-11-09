import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ToArray } from '../../common/dto/boolean.transform';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { StockStatus } from '../../common/enums';

export const COMPANY_STOCK_SORTS = ['name', 'quantity', 'status'] as const;
export const PROJECT_STOCK_SORTS = ['name', 'quantity', 'lastDelivery'] as const;

class StockQueryBase extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by material name' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ example: 'Cement' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  category?: string;
}

export class CompanyStockQueryDto extends StockQueryBase {
  @ApiPropertyOptional({ enum: StockStatus, isArray: true, description: 'One or more (comma separated)' })
  @ToArray()
  @IsEnum(StockStatus, { each: true })
  @IsOptional()
  status?: StockStatus[];

  @ApiPropertyOptional({ enum: COMPANY_STOCK_SORTS, default: 'name' })
  @IsIn(COMPANY_STOCK_SORTS)
  @IsOptional()
  sortBy?: (typeof COMPANY_STOCK_SORTS)[number];
}

export class ProjectStockQueryDto extends StockQueryBase {
  @ApiPropertyOptional({ enum: PROJECT_STOCK_SORTS, default: 'name' })
  @IsIn(PROJECT_STOCK_SORTS)
  @IsOptional()
  sortBy?: (typeof PROJECT_STOCK_SORTS)[number];
}

export class ReorderPointDto {
  @ApiProperty({ example: 50, description: 'Low stock when quantity is above 0 and at or below this value' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(99_999_999_999)
  reorderPoint: number;
}

export class ProjectPickerQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;
}
