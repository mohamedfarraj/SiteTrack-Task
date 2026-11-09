import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateMaterialDto {
  @ApiProperty({ example: 'Cement, OPC 50 kg bag' })
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 'Cement' })
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category: string;

  @ApiProperty({ example: 'bag' })
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  unit: string;
}

export class UpdateMaterialDto {
  @ApiPropertyOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional()
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @IsOptional()
  unit?: string;
}

export const MATERIAL_SORTS = ['name', 'category'] as const;

export class MaterialListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ enum: MATERIAL_SORTS, default: 'name' })
  @IsIn(MATERIAL_SORTS)
  @IsOptional()
  sortBy?: (typeof MATERIAL_SORTS)[number];
}
